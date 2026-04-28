/**
 * Unified AI Provider Configuration
 *
 * Text generation is intentionally limited to Qwen through Alibaba Cloud
 * DashScope's OpenAI-compatible endpoint.
 */

import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import type {
  ProviderId,
  BuiltInProviderId,
  ProviderConfig,
  ModelInfo,
  ModelConfig,
  ThinkingConfig,
} from '@/lib/types/provider';
import { applyModelMetadata, getCatalogThinkingCapability } from './model-metadata';
import { getThinkingMode } from './thinking-config';

export const DEFAULT_PROVIDER_ID: BuiltInProviderId = 'qwen';
export const DEFAULT_MODEL_ID = 'qwen3.6-plus';
export const DEFAULT_MODEL_STRING = `${DEFAULT_PROVIDER_ID}:${DEFAULT_MODEL_ID}`;

// Re-export types for backward compatibility
export type { ProviderId, ProviderConfig, ModelInfo, ModelConfig };

/** Provider IDs whose logos are monochrome-dark and need `dark:invert` in dark mode */
export const MONO_LOGO_PROVIDERS: ReadonlySet<string> = new Set();

/**
 * Provider registry
 */
export const PROVIDERS: Record<BuiltInProviderId, ProviderConfig> = {
  qwen: {
    id: 'qwen',
    name: 'Qwen',
    type: 'openai',
    defaultBaseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    requiresApiKey: true,
    icon: '/logos/bailian.svg',
    models: [
      {
        id: DEFAULT_MODEL_ID,
        name: 'Qwen3.6 Plus',
        contextWindow: 256000,
        outputWindow: 8192,
        capabilities: {
          streaming: true,
          tools: true,
          vision: true,
          thinking: {
            control: 'toggle',
            requestAdapter: 'qwen',
            defaultMode: 'enabled',
            toggleable: true,
            budgetAdjustable: false,
            defaultEnabled: true,
          },
        },
      },
    ],
  },
};

applyModelMetadata(PROVIDERS);

/**
 * Get provider config from the built-in registry.
 */
function getProviderConfig(providerId: string): ProviderConfig | null {
  return PROVIDERS[providerId as BuiltInProviderId] ?? null;
}

/**
 * Model instance with its configuration info
 */
export interface ModelWithInfo {
  model: LanguageModel;
  modelInfo: ModelInfo | null;
}

function getCompatThinkingBodyParams(
  providerId: string,
  modelId: string,
  config: ThinkingConfig,
): Record<string, unknown> | undefined {
  const capability = getCatalogThinkingCapability(providerId, modelId);
  if (!capability || capability.control === 'none') return undefined;

  const mode = getThinkingMode(config);

  if (capability.requestAdapter === 'qwen') {
    if (mode === 'disabled') return { enable_thinking: false };
    if (mode === 'enabled') return { enable_thinking: true };
    return undefined;
  }

  return undefined;
}

/** Returns true if the provider requires an API key. */
export function isProviderKeyRequired(providerId: string): boolean {
  return getProviderConfig(providerId as ProviderId)?.requiresApiKey ?? true;
}

/**
 * Get a configured language model instance with its info.
 */
export function getModel(config: ModelConfig): ModelWithInfo {
  const provider = getProviderConfig(config.providerId);
  if (!provider) {
    throw new Error(`Unknown provider: ${config.providerId}`);
  }

  const modelInfo = provider.models.find((m) => m.id === config.modelId) || null;
  if (!modelInfo) {
    throw new Error(`Unsupported text model: ${config.providerId}:${config.modelId}`);
  }

  const requiresApiKey = config.requiresApiKey ?? provider.requiresApiKey;
  if (requiresApiKey && !config.apiKey) {
    throw new Error('API key required for Qwen. Set QWEN_API_KEY in Vercel.');
  }

  const effectiveApiKey = config.apiKey || '';
  const effectiveBaseUrl = provider.defaultBaseUrl;

  const openai = createOpenAI({
    apiKey: effectiveApiKey,
    baseURL: effectiveBaseUrl,
    fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
      const thinkingCtx = (globalThis as Record<string, unknown>).__thinkingContext as
        | { getStore?: () => unknown }
        | undefined;
      const thinking = thinkingCtx?.getStore?.() as ThinkingConfig | undefined;

      if (thinking && init?.body && typeof init.body === 'string') {
        const extra = getCompatThinkingBodyParams(config.providerId, config.modelId, thinking);
        if (extra) {
          try {
            const body = JSON.parse(init.body);
            Object.assign(body, extra);
            init = { ...init, body: JSON.stringify(body) };
          } catch {
            // Leave body as-is when it is not JSON.
          }
        }
      }

      return globalThis.fetch(url, init);
    },
  });

  const model = openai.chat(config.modelId);

  return { model, modelInfo };
}

/**
 * Parse model string in format "providerId:modelId".
 * Bare model IDs are treated as Qwen model IDs.
 */
export function parseModelString(modelString: string): {
  providerId: BuiltInProviderId;
  modelId: string;
} {
  const colonIndex = modelString.indexOf(':');

  if (colonIndex > 0) {
    const providerId = modelString.slice(0, colonIndex);
    if (providerId !== DEFAULT_PROVIDER_ID) {
      throw new Error(`Unsupported text model provider: ${providerId}`);
    }

    return {
      providerId,
      modelId: modelString.slice(colonIndex + 1) || DEFAULT_MODEL_ID,
    };
  }

  return {
    providerId: DEFAULT_PROVIDER_ID,
    modelId: modelString || DEFAULT_MODEL_ID,
  };
}

/**
 * Get all available models grouped by provider.
 */
export function getAllModels(): {
  provider: ProviderConfig;
  models: ModelInfo[];
}[] {
  return Object.values(PROVIDERS).map((provider) => ({
    provider,
    models: provider.models,
  }));
}

/**
 * Get provider by ID.
 */
export function getProvider(providerId: string): ProviderConfig | undefined {
  return PROVIDERS[providerId as BuiltInProviderId];
}

/**
 * Get model info.
 */
export function getModelInfo(providerId: string, modelId: string): ModelInfo | undefined {
  const provider = PROVIDERS[providerId as BuiltInProviderId];
  return provider?.models.find((m) => m.id === modelId);
}
