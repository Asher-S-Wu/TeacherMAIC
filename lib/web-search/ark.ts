import { ARK_BASE_URL } from '@/lib/ai/ark-models';
import { DEFAULT_MODEL_ID } from '@/lib/ai/providers';
import { proxyFetch } from '@/lib/server/proxy-fetch';
import type { WebSearchResult, WebSearchSource } from '@/lib/web-search/types';

const ARK_RESPONSES_API_URL = `${ARK_BASE_URL}/responses`;
const ARK_SEARCH_MODEL = DEFAULT_MODEL_ID;

interface ArkSource {
  type?: string;
  url?: string;
}

interface ArkAnnotation {
  type?: string;
  title?: string;
  url?: string;
}

interface ArkMessageContent {
  type?: string;
  text?: string;
  annotations?: ArkAnnotation[];
}

interface ArkOutputItem {
  type?: string;
  content?: ArkMessageContent[];
  action?: {
    type?: string;
    query?: string;
    sources?: ArkSource[];
  };
}

interface ArkResponsesApiResponse {
  id?: string;
  output_text?: string;
  output?: ArkOutputItem[];
  error?: {
    code?: string;
    message?: string;
  } | null;
}

function createSource(url: string, title?: string): WebSearchSource | null {
  try {
    const parsed = new URL(url);
    return {
      title: title || parsed.hostname.replace(/^www\./, '') || url,
      url,
      content: '',
      score: 1,
    };
  } catch {
    return null;
  }
}

function addSource(
  sources: Map<string, WebSearchSource>,
  url: string | undefined,
  title?: string,
): void {
  if (!url) return;
  const source = createSource(url, title);
  if (!source) return;
  const existing = sources.get(source.url);
  if (!existing || (source.title && existing.title !== source.title)) {
    sources.set(source.url, existing ? { ...existing, ...source } : source);
  }
}

function extractAnswer(data: ArkResponsesApiResponse): string {
  if (data.output_text?.trim()) {
    return data.output_text.trim();
  }

  return (data.output || [])
    .flatMap((item) => item.content || [])
    .map((content) => content.text || '')
    .join('\n')
    .trim();
}

function extractSources(data: ArkResponsesApiResponse, maxResults: number): WebSearchSource[] {
  const sources = new Map<string, WebSearchSource>();

  for (const item of data.output || []) {
    if (item.type === 'web_search_call') {
      for (const source of item.action?.sources || []) {
        addSource(sources, source.url);
      }
    }

    if (item.type === 'message') {
      for (const content of item.content || []) {
        for (const annotation of content.annotations || []) {
          addSource(sources, annotation.url, annotation.title);
        }
      }
    }
  }

  return Array.from(sources.values()).slice(0, maxResults);
}

export async function searchWithArk(params: {
  query: string;
  apiKey: string;
  maxResults?: number;
}): Promise<WebSearchResult> {
  const { query, apiKey, maxResults = 5 } = params;
  const startedAt = Date.now();

  const res = await proxyFetch(ARK_RESPONSES_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: ARK_SEARCH_MODEL,
      input: [
        {
          role: 'system',
          content:
            '你是联网搜索助手。必须先使用 web_search 搜索，再用与用户查询一致的语言简洁总结，并保留可追溯来源。',
        },
        {
          role: 'user',
          content: query,
        },
      ],
      tools: [{ type: 'web_search' }],
      max_output_tokens: 900,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`火山方舟联网搜索失败（${res.status}）：${errorText || res.statusText}`);
  }

  const data = (await res.json()) as ArkResponsesApiResponse;
  if (data.error) {
    throw new Error(`火山方舟联网搜索失败：${data.error.message || data.error.code || '未知错误'}`);
  }

  return {
    answer: extractAnswer(data),
    sources: extractSources(data, maxResults),
    query,
    responseTime: (Date.now() - startedAt) / 1000,
  };
}

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
