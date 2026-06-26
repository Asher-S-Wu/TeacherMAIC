import { createLogger } from '@/lib/logger';
import type { AICallFn } from '@/lib/generation/pipeline-types';
import { parseJsonResponse } from '@/lib/generation/json-repair';
import {
  buildSearchQuery,
  decideWebSearch,
  planNextSearchQuery,
  assessSearchSufficiency,
  WEB_SEARCH_MAX_ROUNDS,
  WEB_SEARCH_QUERY_DIGEST_LIMIT,
} from '@/lib/server/search-query-builder';
import {
  searchTavily,
  tavilyItemToResearchPage,
  type TavilyResearchPage,
  type TavilySearchItem,
} from '@/lib/web-search/tavily';
import type { WebSearchResult, WebSearchSource } from '@/lib/web-search/types';

const log = createLogger('WebResearch');
// 多轮检索的默认参数
const DEFAULT_SEARCH_LIMIT_PER_ROUND = 6;
const DEFAULT_SCRAPE_PER_ROUND = 2;
const DEFAULT_MAX_SCRAPE_TOTAL = 8;
const DEFAULT_MAX_CANDIDATE_POOL = 30;
const PAGE_MARKDOWN_LIMIT = 6000;
const SOURCE_CONTENT_LIMIT = 700;
// 摘要里每条候选/已抓页的最大字符数，避免单条过长撑爆 digest
const CANDIDATE_LINE_MAX = 220;
const SCRAPED_LINE_MAX = 320;

type AICallFactory = (operation: string) => AICallFn;

interface ResearchSummaryResponse {
  answer: string;
  summary: string;
}

// 单轮检索快照，用于元数据回传与日志
export interface WebResearchRound {
  round: number;
  query: string;
  newCandidates: number;
  scrapedUrls: string[];
  sufficient: boolean | null;
  reason: string;
}

// 多轮检索过程中的进度事件，供调用方桥接到上层进度链路
export type WebResearchProgressEvent =
  | { phase: 'round_start'; round: number; query: string }
  | {
      phase: 'round_done';
      round: number;
      newCandidates: number;
      scraped: number;
      sufficient: boolean | null;
    }
  | { phase: 'summarizing' };

export interface AgentDrivenWebResearchResult extends WebSearchResult {
  context: string;
  skipped?: boolean;
  reason?: string;
  rounds?: WebResearchRound[];
  totalRounds?: number;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

// URL 归一化：去掉锚点与末尾斜杠，便于跨轮去重
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

// 把候选池压成给 LLM 看的字符串摘要，受总长度上限保护
function formatCandidatesDigest(items: TavilySearchItem[]): string {
  if (items.length === 0) return '(empty)';
  const lines = items.map((item, index) => {
    const desc = item.description ? ` — ${truncate(item.description, CANDIDATE_LINE_MAX)}` : '';
    return `[${index + 1}] ${item.title} — ${item.url}${desc}`;
  });
  return truncate(lines.join('\n'), WEB_SEARCH_QUERY_DIGEST_LIMIT);
}

// 把已抓页压成给 LLM 看的字符串摘要
function formatScrapedDigest(pages: TavilyResearchPage[]): string {
  if (pages.length === 0) return '(empty)';
  const lines = pages.map((page, index) => {
    const body = page.summary || page.markdown;
    const trimmed = truncate(body, SCRAPED_LINE_MAX);
    return `[${index + 1}] ${page.title} — ${page.finalUrl}\n${trimmed}`;
  });
  return truncate(lines.join('\n\n'), WEB_SEARCH_QUERY_DIGEST_LIMIT);
}

// 给 summarizeResearch 用的完整正文格式（与原实现一致，保留较长截断）
function formatScrapedPages(pages: TavilyResearchPage[]): string {
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

function buildSources(
  pages: TavilyResearchPage[],
  candidates: TavilySearchItem[],
): WebSearchSource[] {
  const candidateByUrl = new Map(candidates.map((item) => [normalizeUrlKey(item.url), item]));

  return pages.map((page, index) => {
    const candidate = candidateByUrl.get(normalizeUrlKey(page.url));
    const content = truncate(
      page.summary || candidate?.description || page.markdown,
      SOURCE_CONTENT_LIMIT,
    );
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

// 合并本轮搜索结果到候选池：按 normalizeUrlKey 去重，受候选池上限约束
function mergeCandidates(
  pool: TavilySearchItem[],
  incoming: TavilySearchItem[],
  cap: number,
): { merged: TavilySearchItem[]; addedCount: number } {
  const existingKeys = new Set(pool.map((item) => normalizeUrlKey(item.url)));
  const merged = [...pool];
  let addedCount = 0;
  for (const item of incoming) {
    if (merged.length >= cap) break;
    const key = normalizeUrlKey(item.url);
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);
    merged.push(item);
    addedCount += 1;
  }
  return { merged, addedCount };
}

// 规则函数：从本轮新增候选里取前 N 个未抓过的 URL，受总抓页预算约束
function pickRoundUrls(
  newCandidates: TavilySearchItem[],
  scrapedKeys: Set<string>,
  take: number,
  remainingBudget: number,
): string[] {
  if (remainingBudget <= 0 || take <= 0) return [];
  const sorted = [...newCandidates].sort((a, b) => a.position - b.position);
  const picked: string[] = [];
  const limit = Math.min(take, remainingBudget);
  for (const item of sorted) {
    if (picked.length >= limit) break;
    const key = normalizeUrlKey(item.url);
    if (scrapedKeys.has(key)) continue;
    scrapedKeys.add(key);
    picked.push(item.url);
  }
  return picked;
}

async function summarizeResearch(params: {
  requirement: string;
  searchQuery: string;
  pages: TavilyResearchPage[];
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

// 多轮 Tavily 联网研究：搜 → 读结果正文 → 评估，必要时换关键词再来一轮
export async function runAgentDrivenWebResearch(params: {
  requirement: string;
  pdfText?: string;
  apiKey: string;
  createAiCall: AICallFactory;
  maxRounds?: number;
  searchLimitPerRound?: number;
  scrapePerRound?: number;
  maxScrapeTotal?: number;
  maxCandidatePool?: number;
  onProgress?: (event: WebResearchProgressEvent) => void;
}): Promise<AgentDrivenWebResearchResult> {
  const {
    requirement,
    pdfText,
    apiKey,
    createAiCall,
    maxRounds = WEB_SEARCH_MAX_ROUNDS,
    searchLimitPerRound = DEFAULT_SEARCH_LIMIT_PER_ROUND,
    scrapePerRound = DEFAULT_SCRAPE_PER_ROUND,
    maxScrapeTotal = DEFAULT_MAX_SCRAPE_TOTAL,
    maxCandidatePool = DEFAULT_MAX_CANDIDATE_POOL,
    onProgress,
  } = params;
  const startedAt = Date.now();

  // 第一步：是否需要联网（与单轮版本一致）
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

  // 累积状态
  const previousQueries: string[] = [];
  let candidatePool: TavilySearchItem[] = [];
  const scrapedPages: TavilyResearchPage[] = [];
  const scrapedKeys = new Set<string>();
  const rounds: WebResearchRound[] = [];
  let lastMissingAspects: string[] = [];

  for (let round = 1; round <= maxRounds; round++) {
    // 1. 决定本轮关键词
    let query: string;
    if (round === 1) {
      const initial = await buildSearchQuery(
        requirement,
        pdfText,
        createAiCall('web-search-query-rewrite'),
      );
      query = initial.query;
      log.info('Round 1 initial query built', {
        hasPdfContext: initial.hasPdfContext,
        rawRequirementLength: initial.rawRequirementLength,
        finalQueryLength: initial.finalQueryLength,
      });
    } else {
      const plan = await planNextSearchQuery({
        requirement,
        pdfText,
        previousQueries,
        candidatesDigest: formatCandidatesDigest(candidatePool),
        scrapedDigest: formatScrapedDigest(scrapedPages),
        missingAspects: lastMissingAspects,
        currentRound: round,
        maxRounds,
        aiCall: createAiCall('web-search-query-replan'),
      });
      // LLM 给出与历史归一化后重复的关键词 → 视为终止条件，不再继续
      if (plan.duplicate) {
        rounds.push({
          round,
          query: plan.query,
          newCandidates: 0,
          scrapedUrls: [],
          sufficient: null,
          reason: '关键词与历史重复',
        });
        log.info('Loop ended: duplicate query', { round, query: plan.query });
        break;
      }
      query = plan.query;
    }
    previousQueries.push(query);

    onProgress?.({ phase: 'round_start', round, query });
    log.info('Running search round', { round, query, queryLength: query.length });

    // 2. 搜索 + 合并候选池
    const searchItems = await searchTavily({
      query,
      apiKey,
      limit: searchLimitPerRound,
    });
    const { merged, addedCount } = mergeCandidates(
      candidatePool,
      searchItems,
      maxCandidatePool,
    );
    candidatePool = merged;

    // 本轮没有任何新候选 → 终止（继续也只是浪费）
    if (addedCount === 0) {
      rounds.push({
        round,
        query,
        newCandidates: 0,
        scrapedUrls: [],
        sufficient: null,
        reason: '本轮无新增候选',
      });
      onProgress?.({
        phase: 'round_done',
        round,
        newCandidates: 0,
        scraped: 0,
        sufficient: null,
      });
      log.info('Loop ended: no new candidates', { round });
      break;
    }

    // 3. 抓页：从本轮新增候选里按规则取若干个 URL
    const remainingBudget = maxScrapeTotal - scrapedPages.length;
    const newCandidatesOnly = searchItems.filter((item) => {
      const key = normalizeUrlKey(item.url);
      return !scrapedKeys.has(key);
    });
    const toScrape = pickRoundUrls(
      newCandidatesOnly,
      scrapedKeys,
      scrapePerRound,
      remainingBudget,
    );
    const newPages: TavilyResearchPage[] = [];
    if (toScrape.length > 0) {
      const itemByUrl = new Map(searchItems.map((item) => [normalizeUrlKey(item.url), item]));
      for (const url of toScrape) {
        const item = itemByUrl.get(normalizeUrlKey(url));
        if (!item) continue;
        const page = tavilyItemToResearchPage(item);
        scrapedPages.push(page);
        scrapedKeys.add(normalizeUrlKey(page.finalUrl));
        newPages.push(page);
      }
    }

    // 4. 充足性判定：最后一轮跳过（节省一次 LLM 调用），无抓页也跳过
    let sufficient: boolean | null = null;
    let reasonText = '';

    if (round >= maxRounds) {
      reasonText = '达到最大轮数';
    } else if (scrapedPages.length === 0) {
      reasonText = '尚无抓取正文，进入下一轮';
    } else {
      const assess = await assessSearchSufficiency({
        requirement,
        pdfText,
        candidatesDigest: formatCandidatesDigest(candidatePool),
        scrapedDigest: formatScrapedDigest(scrapedPages),
        currentRound: round,
        maxRounds,
        aiCall: createAiCall('web-search-sufficiency'),
      });
      sufficient = assess.sufficient;
      reasonText = assess.reason;
      lastMissingAspects = assess.missingAspects;
    }

    rounds.push({
      round,
      query,
      newCandidates: addedCount,
      scrapedUrls: newPages.map((p) => p.finalUrl),
      sufficient,
      reason: reasonText,
    });
    onProgress?.({
      phase: 'round_done',
      round,
      newCandidates: addedCount,
      scraped: newPages.length,
      sufficient,
    });
    log.info('Round done', {
      round,
      newCandidates: addedCount,
      scraped: newPages.length,
      sufficient,
      reason: reasonText,
    });

    if (sufficient === true) break;
    if (round >= maxRounds) break;
    if (scrapedPages.length >= maxScrapeTotal) {
      // 抓页预算已用完，再搜也无法抓新页 → 退出去汇总
      log.info('Loop ended: scrape budget exhausted', { round });
      break;
    }
  }

  // 5. 汇总
  const lastQuery = previousQueries[previousQueries.length - 1] || requirement;

  if (scrapedPages.length === 0) {
    return {
      answer: '',
      sources: [],
      context: '',
      query: lastQuery,
      responseTime: (Date.now() - startedAt) / 1000,
      rounds,
      totalRounds: rounds.length,
    };
  }

  onProgress?.({ phase: 'summarizing' });
  const sources = buildSources(scrapedPages, candidatePool);
  const summary = await summarizeResearch({
    requirement,
    searchQuery: lastQuery,
    pages: scrapedPages,
    aiCall: createAiCall('web-search-research-summary'),
  });

  return {
    answer: summary.answer,
    sources,
    context: formatResearchContext(summary.summary, sources),
    query: lastQuery,
    responseTime: (Date.now() - startedAt) / 1000,
    rounds,
    totalRounds: rounds.length,
  };
}
