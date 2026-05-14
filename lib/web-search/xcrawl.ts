import { proxyFetch } from '@/lib/server/proxy-fetch';

export const XCRAWL_BASE_URL = 'https://run.xcrawl.com/v1';
const XCRAWL_SEARCH_URL = `${XCRAWL_BASE_URL}/search`;
const XCRAWL_SCRAPE_URL = `${XCRAWL_BASE_URL}/scrape`;

export interface XCrawlSearchItem {
  position: number;
  title: string;
  url: string;
  description: string;
}

export interface XCrawlScrapedPage {
  title: string;
  url: string;
  finalUrl: string;
  summary: string;
  markdown: string;
}

interface XCrawlSearchApiItem {
  position?: number;
  title?: string | null;
  url?: string;
  description?: string;
}

interface XCrawlSearchApiResponse {
  status?: string;
  query?: string;
  data?: {
    status?: string;
    data?: XCrawlSearchApiItem[];
  };
  error?: {
    message?: string;
    code?: string;
  } | null;
}

interface XCrawlScrapeApiResponse {
  status?: string;
  url?: string;
  data?: {
    markdown?: string;
    summary?: string;
    metadata?: {
      title?: string;
      final_url?: string;
      url?: string;
      status_code?: number;
      statusCode?: number;
    };
  };
  error?: {
    message?: string;
    code?: string;
  } | null;
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

function assertXCrawlSuccess(data: { error?: { message?: string; code?: string } | null }) {
  if (data.error) {
    throw new Error(data.error.message || data.error.code || '未知错误');
  }
}

export async function searchXCrawl(params: {
  query: string;
  apiKey: string;
  limit?: number;
  location?: string;
  language?: string;
}): Promise<XCrawlSearchItem[]> {
  const { query, apiKey, limit = 6, location = 'CN', language = 'zh' } = params;

  const res = await proxyFetch(XCRAWL_SEARCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query,
      location,
      language,
      limit,
    }),
  });

  if (!res.ok) {
    throw new Error(`XCrawl 搜索失败（${res.status}）：${await readErrorMessage(res)}`);
  }

  const data = (await res.json()) as XCrawlSearchApiResponse;
  try {
    assertXCrawlSuccess(data);
  } catch (error) {
    throw new Error(
      `XCrawl 搜索失败：${error instanceof Error ? error.message : '未知错误'}`,
    );
  }

  if (data.status && data.status !== 'completed') {
    throw new Error(`XCrawl 搜索失败：任务状态为 ${data.status}`);
  }

  if (data.data?.status && data.data.status !== 'success') {
    throw new Error(`XCrawl 搜索失败：搜索状态为 ${data.data.status}`);
  }

  return (data.data?.data || [])
    .filter((item): item is XCrawlSearchApiItem & { url: string } => Boolean(item.url))
    .slice(0, limit)
    .map((item, index) => ({
      position: item.position || index + 1,
      title: normalizeText(item.title) || getTitleFromUrl(item.url),
      url: item.url,
      description: normalizeText(item.description),
    }));
}

export async function scrapeXCrawl(params: {
  url: string;
  apiKey: string;
}): Promise<XCrawlScrapedPage> {
  const { url, apiKey } = params;

  const res = await proxyFetch(XCRAWL_SCRAPE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      url,
      mode: 'sync',
      output: {
        formats: ['markdown', 'summary'],
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`XCrawl 抓取失败（${res.status}）：${await readErrorMessage(res)}`);
  }

  const data = (await res.json()) as XCrawlScrapeApiResponse;
  try {
    assertXCrawlSuccess(data);
  } catch (error) {
    throw new Error(
      `XCrawl 抓取失败：${error instanceof Error ? error.message : '未知错误'}`,
    );
  }

  if (data.status && data.status !== 'completed') {
    throw new Error(`XCrawl 抓取失败：任务状态为 ${data.status}`);
  }

  const metadata = data.data?.metadata;
  const finalUrl = metadata?.final_url || metadata?.url || data.url || url;
  return {
    title: normalizeText(metadata?.title) || getTitleFromUrl(finalUrl),
    url,
    finalUrl,
    summary: normalizeText(data.data?.summary),
    markdown: (data.data?.markdown || '').trim(),
  };
}
