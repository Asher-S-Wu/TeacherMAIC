/**
 * Unified AI Provider Configuration
 *
 * Text generation normally uses Volcengine Ark; developer mode uses DragonCode GPT-5.5.
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
import { ARK_BASE_URL, ARK_LLM_MODEL_ID, ARK_LLM_MODEL_NAME } from './ark-models';

export const DEFAULT_PROVIDER_ID: BuiltInProviderId = 'ark';
export const DEFAULT_MODEL_ID = ARK_LLM_MODEL_ID;
export const DEFAULT_MODEL_STRING = `${DEFAULT_PROVIDER_ID}:${DEFAULT_MODEL_ID}`;
export const DEVELOPER_PROVIDER_ID: BuiltInProviderId = 'dragoncode';
export const DEVELOPER_MODEL_ID = 'gpt-5.5';
export const DEVELOPER_MODEL_NAME = 'GPT-5.5';
export const DEVELOPER_MODEL_STRING = `${DEVELOPER_PROVIDER_ID}:${DEVELOPER_MODEL_ID}`;
export const DRAGONCODE_BASE_URL = 'https://dragoncode.codes';
export const DRAGONCODE_RESPONSES_PATH = '/responses';

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
    ],
  },
  dragoncode: {
    id: 'dragoncode',
    name: 'DragonCode',
    type: 'openai',
    defaultBaseUrl: DRAGONCODE_BASE_URL,
    requiresApiKey: true,
    models: [
      {
        id: DEVELOPER_MODEL_ID,
        name: DEVELOPER_MODEL_NAME,
        contextWindow: 1050000,
        outputWindow: 128000,
        capabilities: {
          streaming: true,
          tools: true,
          vision: true,
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
      modelId:
        modelString.slice(colonIndex + 1) ||
        (provider.id === DEVELOPER_PROVIDER_ID ? DEVELOPER_MODEL_ID : DEFAULT_MODEL_ID),
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
