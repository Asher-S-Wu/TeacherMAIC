/**
 * Server-side Provider Configuration
 *
 * Loads provider configs from Vercel environment variables.
 * Keys never leave the server — only provider IDs and metadata are exposed via API.
 */

import { createLogger } from '@/lib/logger';
import { DOUBAO_AUDIO_TTS_ENDPOINT } from '@/lib/ai/doubao-audio-models';
import { ARK_BASE_URL } from '@/lib/ai/ark-models';

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
  pdf: Record<string, ServerProviderEntry>;
  webSearch: Record<string, ServerProviderEntry>;
}

// ---------------------------------------------------------------------------
// Env-var prefix mappings
// ---------------------------------------------------------------------------

const ARK_API_KEY_ENV = 'ARK_API_KEY';
const VOLCENGINE_SPEECH_API_KEY_ENV = 'VOLCENGINE_SPEECH_API_KEY';
const TAVILY_API_KEY_ENV = 'TAVILY_API_KEY';

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
  return loadArkSection('volcengine-ark', ARK_BASE_URL);
}

function loadArkSection(
  providerId: string,
  baseUrl: string,
): Record<string, ServerProviderEntry> {
  const apiKey = process.env[ARK_API_KEY_ENV] || undefined;
  if (!apiKey) return {};
  return {
    [providerId]: {
      apiKey,
      baseUrl,
    },
  };
}

function loadVolcengineSpeechSection(): Record<string, ServerProviderEntry> {
  const apiKey = process.env[VOLCENGINE_SPEECH_API_KEY_ENV] || undefined;
  if (!apiKey) return {};
  return {
    'volcengine-doubao-tts': {
      apiKey,
      baseUrl: DOUBAO_AUDIO_TTS_ENDPOINT,
    },
  };
}

function loadTavilySection(): Record<string, ServerProviderEntry> {
  const apiKey = process.env[TAVILY_API_KEY_ENV] || undefined;
  return apiKey ? { tavily: { apiKey, baseUrl: 'https://api.tavily.com/search' } } : {};
}

// ---------------------------------------------------------------------------
// Module-level cache (process singleton)
// ---------------------------------------------------------------------------

let _config: ServerConfig | null = null;

function buildConfig(): ServerConfig {
  return {
    providers: loadLLMEnvSection(),
    tts: loadVolcengineSpeechSection(),
    pdf: loadEnvSection(PDF_ENV_MAP),
    webSearch: loadTavilySection(),
  };
}

function logConfig(config: ServerConfig, label: string): void {
  const counts = [
    Object.keys(config.providers).length,
    Object.keys(config.tts).length,
    Object.keys(config.pdf).length,
    Object.keys(config.webSearch).length,
  ];
  if (counts.some((c) => c > 0)) {
    log.info(
      `[ServerProviderConfig] Loaded (${label}): ${counts[0]} LLM, ${counts[1]} TTS, ${counts[2]} PDF, ${counts[3]} WebSearch providers`,
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
  return getConfig().webSearch.tavily?.apiKey || '';
}
