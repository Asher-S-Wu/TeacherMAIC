/**
 * Alibaba Cloud Bailian Web Search Integration
 *
 * Uses Bailian's OpenAI-compatible Responses API with built-in web_search
 * and web_extractor tools.
 */

import { DEFAULT_MODEL_ID } from '@/lib/ai/providers';
import { proxyFetch } from '@/lib/server/proxy-fetch';
import type { WebSearchResult, WebSearchSource } from '@/lib/types/web-search';

const BAILIAN_RESPONSES_API_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/responses';
const BAILIAN_SEARCH_MODEL = DEFAULT_MODEL_ID;

interface BailianSource {
  type?: string;
  url?: string;
}

interface BailianAnnotation {
  type?: string;
  title?: string;
  url?: string;
}

interface BailianMessageContent {
  type?: string;
  text?: string;
  annotations?: BailianAnnotation[];
}

interface BailianOutputItem {
  type?: string;
  content?: BailianMessageContent[];
  action?: {
    type?: string;
    query?: string;
    sources?: BailianSource[];
  };
  urls?: string[];
  output?: string;
}

interface BailianResponsesApiResponse {
  id?: string;
  output_text?: string;
  output?: BailianOutputItem[];
  error?: {
    code?: string;
    message?: string;
  } | null;
}

function createSource(url: string, content = '', title?: string): WebSearchSource | null {
  try {
    const parsed = new URL(url);
    return {
      title: title || parsed.hostname.replace(/^www\./, '') || url,
      url,
      content,
      score: 1,
    };
  } catch {
    return null;
  }
}

function addSource(
  sources: Map<string, WebSearchSource>,
  url: string | undefined,
  content = '',
  title?: string,
): void {
  if (!url) return;
  const source = createSource(url, content, title);
  if (!source) return;

  const existing = sources.get(source.url);
  if (!existing) {
    sources.set(source.url, source);
    return;
  }

  if (!existing.content && source.content) {
    sources.set(source.url, { ...existing, content: source.content });
  }
  if (existing.title === new URL(source.url).hostname.replace(/^www\./, '') && source.title) {
    sources.set(source.url, { ...sources.get(source.url)!, title: source.title });
  }
}

function extractAnswer(data: BailianResponsesApiResponse): string {
  if (data.output_text?.trim()) {
    return data.output_text.trim();
  }

  return (data.output || [])
    .flatMap((item) => item.content || [])
    .map((content) => content.text || '')
    .join('\n')
    .trim();
}

function extractSources(data: BailianResponsesApiResponse, maxResults: number): WebSearchSource[] {
  const sources = new Map<string, WebSearchSource>();

  for (const item of data.output || []) {
    if (item.type === 'web_search_call') {
      for (const source of item.action?.sources || []) {
        addSource(sources, source.url);
      }
    }

    if (item.type === 'web_extractor_call') {
      const content = (item.output || '').replace(/\s+/g, ' ').trim().slice(0, 500);
      for (const url of item.urls || []) {
        addSource(sources, url, content);
      }
    }

    if (item.type === 'message') {
      for (const content of item.content || []) {
        for (const annotation of content.annotations || []) {
          addSource(sources, annotation.url, '', annotation.title);
        }
      }
    }
  }

  return Array.from(sources.values()).slice(0, maxResults);
}

/**
 * Search the web using Bailian Responses API and return structured results.
 */
export async function searchWithBailian(params: {
  query: string;
  apiKey: string;
  maxResults?: number;
}): Promise<WebSearchResult> {
  const { query, apiKey, maxResults = 5 } = params;
  const startedAt = Date.now();

  const res = await proxyFetch(BAILIAN_RESPONSES_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: BAILIAN_SEARCH_MODEL,
      input: [
        {
          role: 'system',
          content:
            '你是联网搜索助手。必须先使用 web_search 搜索，再使用 web_extractor 阅读最相关网页。请用与用户查询一致的语言简洁总结，并保留可追溯来源。',
        },
        {
          role: 'user',
          content: query,
        },
      ],
      tools: [{ type: 'web_search' }, { type: 'web_extractor' }],
      max_output_tokens: 900,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`百炼联网搜索失败（${res.status}）：${errorText || res.statusText}`);
  }

  const data = (await res.json()) as BailianResponsesApiResponse;
  if (data.error) {
    throw new Error(`百炼联网搜索失败：${data.error.message || data.error.code || '未知错误'}`);
  }

  return {
    answer: extractAnswer(data),
    sources: extractSources(data, maxResults),
    query,
    responseTime: (Date.now() - startedAt) / 1000,
  };
}

/**
 * Format search results into a markdown context block for LLM prompts.
 */
export function formatSearchResultsAsContext(result: WebSearchResult): string {
  if (!result.answer && result.sources.length === 0) {
    return '';
  }

  const lines: string[] = [];

  if (result.answer) {
    lines.push(result.answer);
    lines.push('');
  }

  if (result.sources.length > 0) {
    lines.push('Sources:');
    for (const src of result.sources) {
      lines.push(`- [${src.title}](${src.url}): ${src.content.slice(0, 200)}`);
    }
  }

  return lines.join('\n');
}
