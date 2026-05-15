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
import { ARK_BASE_URL } from './ark-models';
import {
  GEMINI_3_1_FLASH_LITE_PREVIEW_MODEL_ID,
  GEMINI_3_1_FLASH_LITE_PREVIEW_MODEL_NAME,
  GEMINI_3_FLASH_PREVIEW_MODEL_ID,
  GEMINI_3_FLASH_PREVIEW_MODEL_NAME,
  GEMINI_3_1_PRO_PREVIEW_CUSTOM_TOOLS_MODEL_ID,
  GEMINI_3_1_PRO_PREVIEW_CUSTOM_TOOLS_MODEL_NAME,
  OPENROUTER_BASE_URL,
} from './openrouter-models';

export const OPENROUTER_PROVIDER_ID: BuiltInProviderId = 'openrouter';
export const OPENROUTER_GEMINI_3_1_FLASH_LITE_PREVIEW_MODEL_ID =
  GEMINI_3_1_FLASH_LITE_PREVIEW_MODEL_ID;
export const OPENROUTER_GEMINI_3_1_FLASH_LITE_PREVIEW_MODEL_NAME =
  GEMINI_3_1_FLASH_LITE_PREVIEW_MODEL_NAME;
export const OPENROUTER_GEMINI_3_FLASH_PREVIEW_MODEL_ID = GEMINI_3_FLASH_PREVIEW_MODEL_ID;
export const OPENROUTER_GEMINI_3_FLASH_PREVIEW_MODEL_NAME = GEMINI_3_FLASH_PREVIEW_MODEL_NAME;
export const OPENROUTER_GEMINI_3_1_PRO_PREVIEW_CUSTOM_TOOLS_MODEL_ID =
  GEMINI_3_1_PRO_PREVIEW_CUSTOM_TOOLS_MODEL_ID;
export const OPENROUTER_GEMINI_3_1_PRO_PREVIEW_CUSTOM_TOOLS_MODEL_NAME =
  GEMINI_3_1_PRO_PREVIEW_CUSTOM_TOOLS_MODEL_NAME;
export const DEFAULT_PROVIDER_ID: BuiltInProviderId = OPENROUTER_PROVIDER_ID;
export const DEFAULT_MODEL_ID = OPENROUTER_GEMINI_3_1_FLASH_LITE_PREVIEW_MODEL_ID;
export const DEFAULT_MODEL_STRING = `${DEFAULT_PROVIDER_ID}:${DEFAULT_MODEL_ID}`;
export const OPENROUTER_EXPERT_MODEL_STRING = `${OPENROUTER_PROVIDER_ID}:${OPENROUTER_GEMINI_3_1_PRO_PREVIEW_CUSTOM_TOOLS_MODEL_ID}`;
export const EXPERT_PROVIDER_ID = OPENROUTER_PROVIDER_ID;
export const EXPERT_MODEL_ID = OPENROUTER_GEMINI_3_1_PRO_PREVIEW_CUSTOM_TOOLS_MODEL_ID;
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
    type: 'ark-chat-completions',
    defaultBaseUrl: ARK_BASE_URL,
    requiresApiKey: true,
    icon: '/logos/doubao-color.svg',
    models: [],
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    type: 'openrouter-chat-completions',
    defaultBaseUrl: OPENROUTER_BASE_URL,
    requiresApiKey: true,
    models: [
      {
        id: OPENROUTER_GEMINI_3_1_FLASH_LITE_PREVIEW_MODEL_ID,
        name: OPENROUTER_GEMINI_3_1_FLASH_LITE_PREVIEW_MODEL_NAME,
        contextWindow: 1048576,
        outputWindow: 65536,
        capabilities: {
          streaming: true,
          tools: true,
          vision: true,
          json: true,
        },
      },
      {
        id: OPENROUTER_GEMINI_3_FLASH_PREVIEW_MODEL_ID,
        name: OPENROUTER_GEMINI_3_FLASH_PREVIEW_MODEL_NAME,
        contextWindow: 1048576,
        outputWindow: 65536,
        capabilities: {
          streaming: true,
          tools: true,
          vision: true,
          json: true,
        },
      },
      {
        id: OPENROUTER_GEMINI_3_1_PRO_PREVIEW_CUSTOM_TOOLS_MODEL_ID,
        name: OPENROUTER_GEMINI_3_1_PRO_PREVIEW_CUSTOM_TOOLS_MODEL_NAME,
        contextWindow: 1048576,
        outputWindow: 65536,
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
  model: ChatCompletionsModel;
  modelInfo: ModelInfo | null;
}

export interface ChatCompletionsModel {
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

  const model: ChatCompletionsModel = {
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
 * Bare model IDs are treated as default-provider model IDs.
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
  return (
    providerId === OPENROUTER_PROVIDER_ID &&
    modelId === OPENROUTER_GEMINI_3_1_PRO_PREVIEW_CUSTOM_TOOLS_MODEL_ID
  );
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
  return Object.values(PROVIDERS)
    .filter((provider) => provider.models.length > 0)
    .map((provider) => ({
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
