/**
 * Unified AI Provider Configuration
 *
 * Text generation can use any server-configured built-in provider.
 */

import type {
  ProviderId,
  BuiltInProviderId,
  ProviderConfig,
  ProviderType,
  ModelInfo,
  ModelConfig,
} from '@/lib/types/provider';
import { applyModelMetadata } from './model-metadata';
import {
  ARK_BASE_URL,
  ARK_LLM_MODEL_ID,
  ARK_LLM_MODEL_NAME,
  DOUBAO_SEED_2_0_LITE_MODEL_ID,
  DOUBAO_SEED_2_0_LITE_MODEL_NAME,
} from './ark-models';
import {
  KIMI_K2_6_MODEL_ID,
  KIMI_K2_6_MODEL_NAME,
  OPENROUTER_BASE_URL,
} from './openrouter-models';

export const DEFAULT_PROVIDER_ID: BuiltInProviderId = 'ark';
export const DEFAULT_MODEL_ID = ARK_LLM_MODEL_ID;
export const DEFAULT_MODEL_STRING = `${DEFAULT_PROVIDER_ID}:${DEFAULT_MODEL_ID}`;
export const DEEPSEEK_PROVIDER_ID: BuiltInProviderId = 'deepseek';
export const DEEPSEEK_MODEL_ID = 'deepseek-v4-pro';
export const DEEPSEEK_MODEL_NAME = 'DeepSeek V4 Pro';
export const DEEPSEEK_FLASH_MODEL_ID = 'deepseek-v4-flash';
export const DEEPSEEK_FLASH_MODEL_NAME = 'DeepSeek V4 Flash';
export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
export const DEEPSEEK_CHAT_COMPLETIONS_PATH = '/chat/completions';
export const OPENROUTER_PROVIDER_ID: BuiltInProviderId = 'openrouter';
export const OPENROUTER_KIMI_K2_6_MODEL_ID = KIMI_K2_6_MODEL_ID;
export const OPENROUTER_KIMI_K2_6_MODEL_NAME = KIMI_K2_6_MODEL_NAME;
export const OPENROUTER_EXPERT_MODEL_STRING = `${OPENROUTER_PROVIDER_ID}:${OPENROUTER_KIMI_K2_6_MODEL_ID}`;
export const EXPERT_PROVIDER_ID = OPENROUTER_PROVIDER_ID;
export const EXPERT_MODEL_ID = OPENROUTER_KIMI_K2_6_MODEL_ID;
export const EXPERT_MODEL_STRING = OPENROUTER_EXPERT_MODEL_STRING;

// Re-export shared provider types.
export type { ProviderId, ProviderConfig, ModelInfo, ModelConfig };

/** Provider IDs whose logos are monochrome-dark and need `dark:invert` in dark mode */
export const MONO_LOGO_PROVIDERS: ReadonlySet<string> = new Set();

/**
 * Provider registry
 */
export const PROVIDERS: Record<BuiltInProviderId, ProviderConfig> = {
  ark: {
    id: 'ark',
    name: '火山方舟',
    type: 'ark-responses',
    defaultBaseUrl: ARK_BASE_URL,
    requiresApiKey: true,
    icon: '/logos/doubao-color.svg',
    models: [
      {
        id: DEFAULT_MODEL_ID,
        name: ARK_LLM_MODEL_NAME,
        contextWindow: 256000,
        outputWindow: 128000,
        capabilities: {
          streaming: true,
          tools: true,
          vision: true,
        },
      },
      {
        id: DOUBAO_SEED_2_0_LITE_MODEL_ID,
        name: DOUBAO_SEED_2_0_LITE_MODEL_NAME,
        contextWindow: 256000,
        outputWindow: 128000,
        capabilities: {
          streaming: true,
          tools: true,
          vision: true,
        },
      },
    ],
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    type: 'openai',
    defaultBaseUrl: DEEPSEEK_BASE_URL,
    requiresApiKey: true,
    icon: '/logos/deepseek-color.svg',
    models: [
      {
        id: DEEPSEEK_MODEL_ID,
        name: DEEPSEEK_MODEL_NAME,
        contextWindow: 1000000,
        outputWindow: 384000,
        capabilities: {
          streaming: true,
          tools: true,
          json: true,
        },
      },
      {
        id: DEEPSEEK_FLASH_MODEL_ID,
        name: DEEPSEEK_FLASH_MODEL_NAME,
        contextWindow: 1000000,
        outputWindow: 384000,
        capabilities: {
          streaming: true,
          tools: true,
          json: true,
        },
      },
    ],
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    type: 'openrouter-responses',
    defaultBaseUrl: OPENROUTER_BASE_URL,
    requiresApiKey: true,
    models: [
      {
        id: OPENROUTER_KIMI_K2_6_MODEL_ID,
        name: OPENROUTER_KIMI_K2_6_MODEL_NAME,
        contextWindow: 262000,
        outputWindow: 32768,
        capabilities: {
          streaming: true,
          tools: true,
          vision: true,
          json: true,
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
  model: ArkResponsesModel;
  modelInfo: ModelInfo | null;
}

export interface ArkResponsesModel {
  providerId: ProviderId;
  providerType: ProviderType;
  modelId: string;
  apiKey: string;
  baseUrl: string;
  modelInfo: ModelInfo | null;
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
    throw new Error('智能服务暂时不可用，请稍后再试');
  }

  const effectiveApiKey = config.apiKey || '';
  const effectiveBaseUrl = provider.defaultBaseUrl || ARK_BASE_URL;

  const model: ArkResponsesModel = {
    providerId: config.providerId,
    providerType: provider.type,
    modelId: config.modelId,
    apiKey: effectiveApiKey,
    baseUrl: effectiveBaseUrl,
    modelInfo,
  };

  return { model, modelInfo };
}

/**
 * Parse model string in format "providerId:modelId".
 * Bare model IDs are treated as Ark model IDs.
 */
export function parseModelString(modelString: string): {
  providerId: ProviderId;
  modelId: string;
} {
  const colonIndex = modelString.indexOf(':');

  if (colonIndex > 0) {
    const providerId = modelString.slice(0, colonIndex);
    const provider = getProviderConfig(providerId);
    if (!provider) {
      throw new Error(`Unsupported text model provider: ${providerId}`);
    }

    return {
      providerId: provider.id,
      modelId: modelString.slice(colonIndex + 1) || provider.models[0]?.id || DEFAULT_MODEL_ID,
    };
  }

  return {
    providerId: DEFAULT_PROVIDER_ID,
    modelId: modelString || DEFAULT_MODEL_ID,
  };
}

export function isExpertModel(providerId: string, modelId: string): boolean {
  return providerId === OPENROUTER_PROVIDER_ID && modelId === OPENROUTER_KIMI_K2_6_MODEL_ID;
}

export function isExpertModelString(modelString: string): boolean {
  const { providerId, modelId } = parseModelString(modelString);
  return isExpertModel(providerId, modelId);
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
