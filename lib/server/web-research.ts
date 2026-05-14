import { parseJsonResponse } from '@/lib/generation/json-repair';
import type { AICallFn } from '@/lib/generation/pipeline-types';
import { createLogger } from '@/lib/logger';
import { buildSearchQuery, decideWebSearch } from '@/lib/server/search-query-builder';
import { scrapeXCrawl, searchXCrawl, type XCrawlScrapedPage, type XCrawlSearchItem } from '@/lib/web-search/xcrawl';
import type { WebSearchResult, WebSearchSource } from '@/lib/web-search/types';

const log = createLogger('WebResearch');
const DEFAULT_SEARCH_LIMIT = 6;
const DEFAULT_SCRAPE_LIMIT = 3;
const PAGE_MARKDOWN_LIMIT = 6000;
const SOURCE_CONTENT_LIMIT = 700;

type AICallFactory = (operation: string) => AICallFn;

interface UrlSelectionResponse {
  urls: string[];
}

interface ResearchSummaryResponse {
  answer: string;
  summary: string;
}

export interface AgentDrivenWebResearchResult extends WebSearchResult {
  context: string;
  skipped?: boolean;
  reason?: string;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeUrlKey(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return url.trim().replace(/\/$/, '');
  }
}

function truncate(value: string, maxLength: number): string {
  const normalized = normalizeWhitespace(value);
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function formatSearchCandidates(items: XCrawlSearchItem[]): string {
  return items
    .map(
      (item, index) =>
        `[${index + 1}] ${item.title}\nURL: ${item.url}\n摘要: ${
          item.description || '无'
        }`,
    )
    .join('\n\n');
}

function formatScrapedPages(pages: XCrawlScrapedPage[]): string {
  return pages
    .map((page, index) => {
      const content = [
        page.summary ? `摘要: ${page.summary}` : '',
        page.markdown ? `正文摘录: ${truncate(page.markdown, PAGE_MARKDOWN_LIMIT)}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      return `[${index + 1}] ${page.title}\nURL: ${page.finalUrl}\n${content || '无正文内容'}`;
    })
    .join('\n\n');
}

function buildSources(pages: XCrawlScrapedPage[], candidates: XCrawlSearchItem[]): WebSearchSource[] {
  const candidateByUrl = new Map(candidates.map((item) => [normalizeUrlKey(item.url), item]));

  return pages.map((page, index) => {
    const candidate = candidateByUrl.get(normalizeUrlKey(page.url));
    const content = truncate(page.summary || candidate?.description || page.markdown, SOURCE_CONTENT_LIMIT);
    return {
      title: page.title || candidate?.title || page.finalUrl,
      url: page.finalUrl,
      content,
      score: Math.max(0.1, 1 - index * 0.1),
    };
  });
}

function formatResearchContext(summary: string, sources: WebSearchSource[]): string {
  const lines = ['研究摘要:', summary.trim(), '', '来源:'];
  for (const source of sources) {
    lines.push(`- [${source.title}](${source.url}): ${source.content}`);
  }
  return lines.join('\n');
}

async function selectResearchUrls(params: {
  requirement: string;
  searchQuery: string;
  candidates: XCrawlSearchItem[];
  maxPages: number;
  aiCall: AICallFn;
}): Promise<string[]> {
  const { requirement, searchQuery, candidates, maxPages, aiCall } = params;
  if (candidates.length === 0) return [];

  const systemPrompt = `你是课堂生成 Agent 的联网研究规划员。你需要从搜索结果中选择最值得抓取原文的网页。
只输出 JSON，格式必须是 {"urls":["https://..."]}。
最多选择 ${maxPages} 个 URL。
只能选择搜索结果里已经给出的 URL，不能自己编造 URL。
优先选择权威、信息量高、和课堂需求直接相关的网页。`;

  const userPrompt = `课堂需求:
${requirement}

搜索词:
${searchQuery}

搜索结果:
${formatSearchCandidates(candidates)}`;

  const response = await aiCall(systemPrompt, userPrompt);
  const parsed = parseJsonResponse<UrlSelectionResponse>(response);
  if (!parsed || !Array.isArray(parsed.urls)) {
    throw new Error('联网搜索结果筛选失败');
  }

  const candidateByUrl = new Map(candidates.map((item) => [normalizeUrlKey(item.url), item.url]));
  const selected: string[] = [];
  for (const url of parsed.urls) {
    const exactUrl = candidateByUrl.get(normalizeUrlKey(url));
    if (exactUrl && !selected.includes(exactUrl)) {
      selected.push(exactUrl);
    }
    if (selected.length >= maxPages) break;
  }

  if (selected.length === 0) {
    throw new Error('联网搜索结果筛选失败');
  }

  return selected;
}

async function summarizeResearch(params: {
  requirement: string;
  searchQuery: string;
  pages: XCrawlScrapedPage[];
  aiCall: AICallFn;
}): Promise<ResearchSummaryResponse> {
  const { requirement, searchQuery, pages, aiCall } = params;
  const systemPrompt = `你是课堂资料研究 Agent。你要把网页资料整理成后续课堂生成能直接使用的研究上下文。
只输出 JSON，格式必须是 {"answer":"简短结论","summary":"详细研究摘要"}。
不要编造网页中没有的信息。
summary 要保留来源编号，例如 [1]、[2]，方便后续追溯。`;

  const userPrompt = `课堂需求:
${requirement}

搜索词:
${searchQuery}

网页资料:
${formatScrapedPages(pages)}`;

  const response = await aiCall(systemPrompt, userPrompt);
  const parsed = parseJsonResponse<ResearchSummaryResponse>(response);
  const answer = normalizeWhitespace(parsed?.answer || '');
  const summary = (parsed?.summary || '').trim();

  if (!answer || !summary) {
    throw new Error('联网研究摘要整理失败');
  }

  return { answer, summary };
}

export async function runAgentDrivenWebResearch(params: {
  requirement: string;
  pdfText?: string;
  apiKey: string;
  createAiCall: AICallFactory;
  maxSearchResults?: number;
  maxScrapePages?: number;
}): Promise<AgentDrivenWebResearchResult> {
  const {
    requirement,
    pdfText,
    apiKey,
    createAiCall,
    maxSearchResults = DEFAULT_SEARCH_LIMIT,
    maxScrapePages = DEFAULT_SCRAPE_LIMIT,
  } = params;
  const startedAt = Date.now();

  const decision = await decideWebSearch(
    requirement,
    pdfText,
    createAiCall('web-search-decision'),
  );

  if (!decision.shouldSearch) {
    return {
      answer: '',
      sources: [],
      context: '',
      query: requirement,
      responseTime: (Date.now() - startedAt) / 1000,
      skipped: true,
      reason: decision.reason,
    };
  }

  const searchQuery = await buildSearchQuery(
    requirement,
    pdfText,
    createAiCall('web-search-query-rewrite'),
  );

  log.info('Running XCrawl research', {
    hasPdfContext: searchQuery.hasPdfContext,
    rawRequirementLength: searchQuery.rawRequirementLength,
    rewriteAttempted: searchQuery.rewriteAttempted,
    finalQueryLength: searchQuery.finalQueryLength,
  });

  const searchResults = await searchXCrawl({
    query: searchQuery.query,
    apiKey,
    limit: maxSearchResults,
  });

  if (searchResults.length === 0) {
    return {
      answer: '',
      sources: [],
      context: '',
      query: searchQuery.query,
      responseTime: (Date.now() - startedAt) / 1000,
    };
  }

  const selectedUrls = await selectResearchUrls({
    requirement,
    searchQuery: searchQuery.query,
    candidates: searchResults,
    maxPages: maxScrapePages,
    aiCall: createAiCall('web-search-result-selection'),
  });

  const pages = await Promise.all(selectedUrls.map((url) => scrapeXCrawl({ url, apiKey })));
  const sources = buildSources(pages, searchResults);
  const summary = await summarizeResearch({
    requirement,
    searchQuery: searchQuery.query,
    pages,
    aiCall: createAiCall('web-search-research-summary'),
  });

  return {
    answer: summary.answer,
    sources,
    context: formatResearchContext(summary.summary, sources),
    query: searchQuery.query,
    responseTime: (Date.now() - startedAt) / 1000,
  };
}
