import { proxyFetch } from '@/lib/server/proxy-fetch';

export const TAVILY_SEARCH_URL = 'https://api.tavily.com/search';

export interface TavilySearchItem {
  position: number;
  title: string;
  url: string;
  description: string;
  content: string;
  rawContent: string;
}

export interface TavilyResearchPage {
  title: string;
  url: string;
  finalUrl: string;
  summary: string;
  markdown: string;
}

interface TavilyApiResult {
  title?: string;
  url?: string;
  content?: string;
  raw_content?: string | null;
  score?: number;
}

interface TavilyApiResponse {
  query?: string;
  answer?: string;
  results?: TavilyApiResult[];
  response_time?: number;
  request_id?: string;
  error?: string;
  detail?: string;
}

function getTitleFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '') || url;
  } catch {
    return url;
  }
}

function normalizeText(value: string | undefined | null): string {
  return (value || '').replace(/\s+/g, ' ').trim();
}

async function readErrorMessage(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  return text || res.statusText;
}

export async function searchTavily(params: {
  query: string;
  apiKey: string;
  limit?: number;
}): Promise<TavilySearchItem[]> {
  const { query, apiKey, limit = 6 } = params;

  const res = await proxyFetch(TAVILY_SEARCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query,
      search_depth: 'basic',
      max_results: Math.min(Math.max(limit, 1), 20),
      include_answer: 'basic',
      include_raw_content: 'markdown',
      topic: 'general',
    }),
  });

  if (!res.ok) {
    throw new Error(`Tavily 搜索失败（${res.status}）：${await readErrorMessage(res)}`);
  }

  const data = (await res.json()) as TavilyApiResponse;
  if (data.error || data.detail) {
    throw new Error(`Tavily 搜索失败：${data.error || data.detail}`);
  }

  return (data.results || [])
    .filter((item): item is TavilyApiResult & { url: string } => Boolean(item.url))
    .slice(0, limit)
    .map((item, index) => ({
      position: index + 1,
      title: normalizeText(item.title) || getTitleFromUrl(item.url),
      url: item.url,
      description: normalizeText(item.content),
      content: normalizeText(item.content),
      rawContent: (item.raw_content || '').trim(),
    }));
}

export function tavilyItemToResearchPage(item: TavilySearchItem): TavilyResearchPage {
  return {
    title: item.title,
    url: item.url,
    finalUrl: item.url,
    summary: item.description,
    markdown: item.rawContent || item.content || item.description,
  };
}
