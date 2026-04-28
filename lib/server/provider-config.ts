/**
 * Server-side Provider Configuration
 *
 * Loads provider configs from Vercel environment variables.
 * Keys never leave the server — only provider IDs and metadata are exposed via API.
 */

import { createLogger } from '@/lib/logger';

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

const QWEN_API_KEY_ENV = 'QWEN_API_KEY';

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
  const apiKey = process.env[QWEN_API_KEY_ENV] || undefined;
  return apiKey ? { qwen: { apiKey } } : {};
}

function loadQwenOnlySection(providerId: string): Record<string, ServerProviderEntry> {
  const apiKey = process.env[QWEN_API_KEY_ENV] || undefined;
  return apiKey ? { [providerId]: { apiKey } } : {};
}

// ---------------------------------------------------------------------------
// Module-level cache (process singleton)
// ---------------------------------------------------------------------------

let _config: ServerConfig | null = null;

function buildConfig(): ServerConfig {
  return {
    providers: loadLLMEnvSection(),
    tts: loadQwenOnlySection('qwen-tts'),
    asr: loadQwenOnlySection('qwen-asr'),
    pdf: loadEnvSection(PDF_ENV_MAP),
    image: loadQwenOnlySection('qwen-image'),
    video: loadQwenOnlySection('qwen-video'),
    webSearch: loadQwenOnlySection('bailian'),
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
  for (const id of Object.keys(cfg.providers)) {
    result[id] = {};
  }
  return result;
}

/** Resolve API key: client key > server key > empty string */
export function resolveApiKey(providerId: string, clientKey?: string): string {
  if (clientKey) return clientKey;
  return getConfig().providers[providerId]?.apiKey || '';
}

/** LLM base URL is fixed by the built-in Qwen provider registry. */
export function resolveBaseUrl(_providerId: string, _clientBaseUrl?: string): string | undefined {
  return undefined;
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

export function resolveTTSApiKey(providerId: string, clientKey?: string): string {
  if (clientKey) return clientKey;
  return getConfig().tts[providerId]?.apiKey || '';
}

export function resolveTTSBaseUrl(_providerId: string, _clientBaseUrl?: string): string | undefined {
  return undefined;
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

export function resolveASRApiKey(providerId: string, clientKey?: string): string {
  if (clientKey) return clientKey;
  return getConfig().asr[providerId]?.apiKey || '';
}

export function resolveASRBaseUrl(_providerId: string, _clientBaseUrl?: string): string | undefined {
  return undefined;
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

export function resolvePDFApiKey(providerId: string, clientKey?: string): string {
  if (clientKey) return clientKey;
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

export function resolveImageApiKey(providerId: string, clientKey?: string): string {
  if (clientKey) return clientKey;
  return getConfig().image[providerId]?.apiKey || '';
}

export function resolveImageBaseUrl(
  _providerId: string,
  _clientBaseUrl?: string,
): string | undefined {
  return undefined;
}

// ---------------------------------------------------------------------------
// Public API — Video Generation
// ---------------------------------------------------------------------------

export function getServerVideoProviders(): Record<string, { baseUrl?: string }> {
  const cfg = getConfig();
  const result: Record<string, { baseUrl?: string }> = {};
  for (const id of Object.keys(cfg.video)) {
    result[id] = {};
  }
  return result;
}

export function resolveVideoApiKey(providerId: string, clientKey?: string): string {
  if (clientKey) return clientKey;
  return getConfig().video[providerId]?.apiKey || '';
}

export function resolveVideoBaseUrl(
  _providerId: string,
  _clientBaseUrl?: string,
): string | undefined {
  return undefined;
}

// ---------------------------------------------------------------------------
// Public API — Web Search (Bailian)
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

/** Resolve Bailian API key: client key > server QWEN_API_KEY > empty */
export function resolveWebSearchApiKey(clientKey?: string): string {
  if (clientKey) return clientKey;
  return getConfig().webSearch.bailian?.apiKey || '';
}
