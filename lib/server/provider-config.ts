/**
 * Server-side Provider Configuration
 *
 * Loads provider configs from Vercel environment variables.
 * Keys never leave the server — only provider IDs and metadata are exposed via API.
 */

import { createLogger } from '@/lib/logger';
import {
  buildBailianCompatibleBaseUrl,
  buildBailianDashScopeApiBaseUrl,
} from '@/lib/ai/bailian-models';

const log = createLogger('ServerProviderConfig');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ServerProviderEntry {
  apiKey: string;
  baseUrl?: string;
  models?: string[];
}

interface ServerConfig {
  providers: Record<string, ServerProviderEntry>;
  tts: Record<string, ServerProviderEntry>;
  asr: Record<string, ServerProviderEntry>;
  pdf: Record<string, ServerProviderEntry>;
  image: Record<string, ServerProviderEntry>;
  video: Record<string, ServerProviderEntry>;
  webSearch: Record<string, ServerProviderEntry>;
}

// ---------------------------------------------------------------------------
// Env-var prefix mappings
// ---------------------------------------------------------------------------

const DASHSCOPE_API_KEY_ENV = 'DASHSCOPE_API_KEY';
const XCRAWL_API_KEY_ENV = 'XCRAWL_API_KEY';

const PDF_ENV_MAP: Record<string, string> = {
  PDF_MINERU_CLOUD: 'mineru-cloud',
};

// ---------------------------------------------------------------------------
// Env-var helpers
// ---------------------------------------------------------------------------

function loadEnvSection(envMap: Record<string, string>): Record<string, ServerProviderEntry> {
  const result: Record<string, ServerProviderEntry> = {};

  for (const [prefix, providerId] of Object.entries(envMap)) {
    const envApiKey = process.env[`${prefix}_API_KEY`] || undefined;

    if (!envApiKey) continue;
    result[providerId] = {
      apiKey: envApiKey || '',
    };
  }

  return result;
}

function loadLLMEnvSection(): Record<string, ServerProviderEntry> {
  return loadBailianSection('bailian', buildBailianCompatibleBaseUrl);
}

function loadBailianSection(
  providerId: string,
  buildBaseUrl: () => string,
): Record<string, ServerProviderEntry> {
  const apiKey = process.env[DASHSCOPE_API_KEY_ENV] || undefined;
  if (!apiKey) return {};
  return {
    [providerId]: {
      apiKey,
      baseUrl: buildBaseUrl(),
    },
  };
}

function loadXCrawlSection(): Record<string, ServerProviderEntry> {
  const apiKey = process.env[XCRAWL_API_KEY_ENV] || undefined;
  return apiKey ? { xcrawl: { apiKey } } : {};
}

// ---------------------------------------------------------------------------
// Module-level cache (process singleton)
// ---------------------------------------------------------------------------

let _config: ServerConfig | null = null;

function buildConfig(): ServerConfig {
  return {
    providers: loadLLMEnvSection(),
    tts: loadBailianSection('bailian-tts', buildBailianDashScopeApiBaseUrl),
    asr: loadBailianSection('bailian-asr', buildBailianCompatibleBaseUrl),
    pdf: loadEnvSection(PDF_ENV_MAP),
    image: loadBailianSection('bailian-image', buildBailianDashScopeApiBaseUrl),
    video: loadBailianSection('bailian-video', buildBailianDashScopeApiBaseUrl),
    webSearch: loadXCrawlSection(),
  };
}

function logConfig(config: ServerConfig, label: string): void {
  const counts = [
    Object.keys(config.providers).length,
    Object.keys(config.tts).length,
    Object.keys(config.asr).length,
    Object.keys(config.pdf).length,
    Object.keys(config.image).length,
    Object.keys(config.video).length,
    Object.keys(config.webSearch).length,
  ];
  if (counts.some((c) => c > 0)) {
    log.info(
      `[ServerProviderConfig] Loaded (${label}): ${counts[0]} LLM, ${counts[1]} TTS, ${counts[2]} ASR, ${counts[3]} PDF, ${counts[4]} Image, ${counts[5]} Video, ${counts[6]} WebSearch providers`,
    );
  }
}

function getConfig(): ServerConfig {
  if (_config) return _config;

  _config = buildConfig();
  logConfig(_config, 'Vercel env');
  return _config;
}

// ---------------------------------------------------------------------------
// Public API — LLM
// ---------------------------------------------------------------------------

/** Returns server-configured LLM providers (no apiKeys) */
export function getServerProviders(): Record<string, { models?: string[]; baseUrl?: string }> {
  const cfg = getConfig();
  const result: Record<string, { models?: string[]; baseUrl?: string }> = {};
  for (const [id, entry] of Object.entries(cfg.providers)) {
    result[id] = {};
    if (entry.baseUrl) result[id].baseUrl = entry.baseUrl;
  }
  return result;
}

/** Resolve API key from server environment only. */
export function resolveApiKey(providerId: string): string {
  return getConfig().providers[providerId]?.apiKey || '';
}

export function resolveBaseUrl(providerId: string, _clientBaseUrl?: string): string | undefined {
  return getConfig().providers[providerId]?.baseUrl;
}

// ---------------------------------------------------------------------------
// Public API — TTS
// ---------------------------------------------------------------------------

export function getServerTTSProviders(): Record<string, { baseUrl?: string }> {
  const cfg = getConfig();
  const result: Record<string, { baseUrl?: string }> = {};
  for (const [id, entry] of Object.entries(cfg.tts)) {
    result[id] = {};
    if (entry.baseUrl) result[id].baseUrl = entry.baseUrl;
  }
  return result;
}

export function resolveTTSApiKey(providerId: string): string {
  return getConfig().tts[providerId]?.apiKey || '';
}

export function resolveTTSBaseUrl(providerId: string, _clientBaseUrl?: string): string | undefined {
  return getConfig().tts[providerId]?.baseUrl;
}

// ---------------------------------------------------------------------------
// Public API — ASR
// ---------------------------------------------------------------------------

export function getServerASRProviders(): Record<string, { baseUrl?: string }> {
  const cfg = getConfig();
  const result: Record<string, { baseUrl?: string }> = {};
  for (const [id, entry] of Object.entries(cfg.asr)) {
    result[id] = {};
    if (entry.baseUrl) result[id].baseUrl = entry.baseUrl;
  }
  return result;
}

export function resolveASRApiConfig(
  providerId: string,
): { apiKey: string; baseUrl?: string } {
  const entry = getConfig().asr[providerId];
  return {
    apiKey: entry?.apiKey || '',
    baseUrl: entry?.baseUrl,
  };
}

export function resolveASRBaseUrl(providerId: string, _clientBaseUrl?: string): string | undefined {
  return getConfig().asr[providerId]?.baseUrl;
}

// ---------------------------------------------------------------------------
// Public API — PDF
// ---------------------------------------------------------------------------

export function getServerPDFProviders(): Record<string, object> {
  const cfg = getConfig();
  const result: Record<string, object> = {};
  for (const id of Object.keys(cfg.pdf)) {
    result[id] = {};
  }
  return result;
}

export function resolvePDFApiKey(providerId: string): string {
  return getConfig().pdf[providerId]?.apiKey || '';
}

// ---------------------------------------------------------------------------
// Public API — Image Generation
// ---------------------------------------------------------------------------

export function getServerImageProviders(): Record<string, { baseUrl?: string }> {
  const cfg = getConfig();
  const result: Record<string, { baseUrl?: string }> = {};
  for (const [id, entry] of Object.entries(cfg.image)) {
    result[id] = {};
    if (entry.baseUrl) result[id].baseUrl = entry.baseUrl;
  }
  return result;
}

export function resolveImageApiKey(providerId: string): string {
  return getConfig().image[providerId]?.apiKey || '';
}

export function resolveImageBaseUrl(
  providerId: string,
  _clientBaseUrl?: string,
): string | undefined {
  return getConfig().image[providerId]?.baseUrl;
}

// ---------------------------------------------------------------------------
// Public API — Video Generation
// ---------------------------------------------------------------------------

export function getServerVideoProviders(): Record<string, { baseUrl?: string }> {
  const cfg = getConfig();
  const result: Record<string, { baseUrl?: string }> = {};
  for (const [id, entry] of Object.entries(cfg.video)) {
    result[id] = {};
    if (entry.baseUrl) result[id].baseUrl = entry.baseUrl;
  }
  return result;
}

export function resolveVideoApiKey(providerId: string): string {
  return getConfig().video[providerId]?.apiKey || '';
}

export function resolveVideoBaseUrl(
  providerId: string,
  _clientBaseUrl?: string,
): string | undefined {
  return getConfig().video[providerId]?.baseUrl;
}

// ---------------------------------------------------------------------------
// Public API — Web Search
// ---------------------------------------------------------------------------

/** Returns server-configured web search providers (no apiKeys exposed) */
export function getServerWebSearchProviders(): Record<string, { baseUrl?: string }> {
  const cfg = getConfig();
  const result: Record<string, { baseUrl?: string }> = {};
  for (const [id, entry] of Object.entries(cfg.webSearch)) {
    result[id] = {};
    if (entry.baseUrl) result[id].baseUrl = entry.baseUrl;
  }
  return result;
}

export function resolveWebSearchApiKey(): string {
  return getConfig().webSearch.xcrawl?.apiKey || '';
}
