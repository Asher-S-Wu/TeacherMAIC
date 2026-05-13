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
  resourceId?: string;
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

const ARK_API_KEY_ENV = 'ARK_API_KEY';
const DEEPSEEK_API_KEY_ENV = 'DEEPSEEK_API_KEY';
const VOLCENGINE_TTS_API_KEY_ENV = 'VOLCENGINE_TTS_API_KEY';
const VOLCENGINE_TTS_RESOURCE_ID_ENV = 'VOLCENGINE_TTS_RESOURCE_ID';

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
  const result: Record<string, ServerProviderEntry> = {};
  const arkApiKey = process.env[ARK_API_KEY_ENV] || undefined;
  const deepseekApiKey = process.env[DEEPSEEK_API_KEY_ENV] || undefined;

  if (arkApiKey) result.ark = { apiKey: arkApiKey };
  if (deepseekApiKey) result.deepseek = { apiKey: deepseekApiKey };

  return result;
}

function loadArkOnlySection(providerId: string): Record<string, ServerProviderEntry> {
  const apiKey = process.env[ARK_API_KEY_ENV] || undefined;
  return apiKey ? { [providerId]: { apiKey } } : {};
}

function loadDoubaoSpeechSection(providerId: string): Record<string, ServerProviderEntry> {
  const apiKey = process.env[VOLCENGINE_TTS_API_KEY_ENV] || undefined;
  const resourceId = process.env[VOLCENGINE_TTS_RESOURCE_ID_ENV] || 'seed-tts-2.0';
  return apiKey ? { [providerId]: { apiKey, resourceId } } : {};
}

// ---------------------------------------------------------------------------
// Module-level cache (process singleton)
// ---------------------------------------------------------------------------

let _config: ServerConfig | null = null;

function buildConfig(): ServerConfig {
  return {
    providers: loadLLMEnvSection(),
    tts: loadDoubaoSpeechSection('ark-tts'),
    asr: loadArkOnlySection('ark-asr'),
    pdf: loadEnvSection(PDF_ENV_MAP),
    image: loadArkOnlySection('ark-image'),
    video: loadArkOnlySection('ark-video'),
    webSearch: loadArkOnlySection('ark-search'),
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

/** Resolve API key from server environment only. */
export function resolveApiKey(providerId: string): string {
  return getConfig().providers[providerId]?.apiKey || '';
}

/** LLM base URL is fixed by the built-in provider registry. */
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

export function resolveTTSApiKey(providerId: string): string {
  return getConfig().tts[providerId]?.apiKey || '';
}

export function resolveTTSResourceId(providerId: string): string | undefined {
  return getConfig().tts[providerId]?.resourceId;
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

export function resolveASRApiKey(providerId: string): string {
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

export function resolveVideoApiKey(providerId: string): string {
  return getConfig().video[providerId]?.apiKey || '';
}

export function resolveVideoBaseUrl(
  _providerId: string,
  _clientBaseUrl?: string,
): string | undefined {
  return undefined;
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
  return getConfig().webSearch['ark-search']?.apiKey || '';
}
