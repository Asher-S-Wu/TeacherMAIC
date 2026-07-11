import { proxyFetch } from '@/lib/server/proxy-fetch';

export const FIRECRAWL_SEARCH_URL = 'https://api.firecrawl.dev/v2/search';
export const FIRECRAWL_SCRAPE_URL = 'https://api.firecrawl.dev/v2/scrape';

export interface FirecrawlSearchItem {
  position: number;
  title: string;
  url: string;
  description: string;
}

export interface FirecrawlResearchPage {
  title: string;
  url: string;
  finalUrl: string;
  summary: string;
  markdown: string;
}

interface FirecrawlSearchApiResult {
  title?: string;
  description?: string;
  url?: string;
  position?: number;
}

interface FirecrawlSearchApiResponse {
  success?: boolean;
  data?: {
    web?: FirecrawlSearchApiResult[];
  };
  error?: string;
  code?: string;
}

interface FirecrawlScrapeApiResponse {
  success?: boolean;
  data?: {
    markdown?: string;
    metadata?: {
      title?: string;
      description?: string;
      sourceURL?: string;
      url?: string;
      error?: string;
    };
  };
  error?: string;
  code?: string;
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
  if (!text) return res.statusText;

  try {
    const data = JSON.parse(text) as { error?: string; message?: string };
    return data.error || data.message || text;
  } catch {
    return text;
  }
}

function getApiError(data: { error?: string; code?: string }): string {
  return data.error || data.code || 'Firecrawl 返回了未知错误';
}

export async function searchFirecrawl(params: {
  query: string;
  apiKey: string;
  limit?: number;
}): Promise<FirecrawlSearchItem[]> {
  const { query, apiKey, limit = 6 } = params;

  const res = await proxyFetch(FIRECRAWL_SEARCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query,
      limit: Math.min(Math.max(limit, 1), 20),
      sources: ['web'],
    }),
  });

  if (!res.ok) {
    throw new Error(`Firecrawl 搜索失败（${res.status}）：${await readErrorMessage(res)}`);
  }

  const data = (await res.json()) as FirecrawlSearchApiResponse;
  if (!data.success) {
    throw new Error(`Firecrawl 搜索失败：${getApiError(data)}`);
  }

  const webResults = data.data?.web;
  if (!Array.isArray(webResults)) {
    throw new Error('Firecrawl 搜索失败：响应中缺少网页结果');
  }

  return webResults
    .filter((item): item is FirecrawlSearchApiResult & { url: string } => Boolean(item.url))
    .slice(0, limit)
    .map((item, index) => ({
      position: item.position || index + 1,
      title: normalizeText(item.title) || getTitleFromUrl(item.url),
      url: item.url,
      description: normalizeText(item.description),
    }));
}

export async function scrapeFirecrawl(params: {
  url: string;
  apiKey: string;
}): Promise<FirecrawlResearchPage> {
  const { url, apiKey } = params;

  const res = await proxyFetch(FIRECRAWL_SCRAPE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      url,
      formats: ['markdown'],
      onlyMainContent: true,
    }),
  });

  if (!res.ok) {
    throw new Error(`Firecrawl 抓取失败（${res.status}）：${await readErrorMessage(res)}`);
  }

  const response = (await res.json()) as FirecrawlScrapeApiResponse;
  if (!response.success) {
    throw new Error(`Firecrawl 抓取失败：${getApiError(response)}`);
  }

  const metadata = response.data?.metadata;
  if (metadata?.error) {
    throw new Error(`Firecrawl 抓取失败：${metadata.error}`);
  }

  const markdown = response.data?.markdown?.trim() || '';
  if (!markdown) {
    throw new Error(`Firecrawl 抓取失败：网页未返回 Markdown 正文（${url}）`);
  }

  return {
    title: normalizeText(metadata?.title) || getTitleFromUrl(url),
    url,
    finalUrl: metadata?.url || metadata?.sourceURL || url,
    summary: normalizeText(metadata?.description),
    markdown,
  };
}
