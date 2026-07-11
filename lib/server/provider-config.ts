/**
 * Server-side Provider Configuration
 *
 * Loads provider configs from server environment variables.
 * Keys never leave the server — only provider IDs and metadata are exposed via API.
 */

import { createLogger } from '@/lib/logger';
import { COSYVOICE_TTS_ENDPOINT } from '@/lib/ai/cosyvoice-models';
import { GEMINI_API_BASE_URL } from '@/lib/ai/gemini-models';

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
  webSearch: Record<string, ServerProviderEntry>;
}

// ---------------------------------------------------------------------------
// Env-var prefix mappings
// ---------------------------------------------------------------------------

const GEMINI_API_KEY_ENV = 'GEMINI_API_KEY';
const DASHSCOPE_API_KEY_ENV = 'DASHSCOPE_API_KEY';
const FIRECRAWL_API_KEY_ENV = 'FIRECRAWL_API_KEY';

function loadLLMEnvSection(): Record<string, ServerProviderEntry> {
  const apiKey = process.env[GEMINI_API_KEY_ENV] || undefined;
  if (!apiKey) return {};
  return {
    'google-gemini': {
      apiKey,
      baseUrl: GEMINI_API_BASE_URL,
    },
  };
}

function loadCosyVoiceSection(): Record<string, ServerProviderEntry> {
  const apiKey = process.env[DASHSCOPE_API_KEY_ENV] || undefined;
  if (!apiKey) return {};
  return {
    'aliyun-cosyvoice-tts': {
      apiKey,
      baseUrl: COSYVOICE_TTS_ENDPOINT,
    },
  };
}

function loadFirecrawlSection(): Record<string, ServerProviderEntry> {
  const apiKey = process.env[FIRECRAWL_API_KEY_ENV] || undefined;
  return apiKey
    ? { firecrawl: { apiKey, baseUrl: 'https://api.firecrawl.dev/v2/search' } }
    : {};
}

// ---------------------------------------------------------------------------
// Module-level cache (process singleton)
// ---------------------------------------------------------------------------

let _config: ServerConfig | null = null;

function buildConfig(): ServerConfig {
  return {
    providers: loadLLMEnvSection(),
    tts: loadCosyVoiceSection(),
    webSearch: loadFirecrawlSection(),
  };
}

function logConfig(config: ServerConfig, label: string): void {
  const counts = [
    Object.keys(config.providers).length,
    Object.keys(config.tts).length,
    Object.keys(config.webSearch).length,
  ];
  if (counts.some((c) => c > 0)) {
    log.info(
      `[ServerProviderConfig] Loaded (${label}): ${counts[0]} LLM, ${counts[1]} TTS, ${counts[2]} WebSearch providers`,
    );
  }
}

function getConfig(): ServerConfig {
  if (_config) return _config;

  _config = buildConfig();
  logConfig(_config, 'server env');
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
  return getConfig().webSearch.firecrawl?.apiKey || '';
}
