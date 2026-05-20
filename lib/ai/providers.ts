/**
 * Unified AI Provider Configuration
 *
 * Text generation is fixed to the server-configured Gemini native provider.
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
  GEMINI_3_5_FLASH_MODEL_ID,
  GEMINI_3_5_FLASH_MODEL_NAME,
  GEMINI_BASE_URL,
} from './gemini-models';

export const GEMINI_PROVIDER_ID: BuiltInProviderId = 'gemini';
export const OFFICIAL_GEMINI_3_5_FLASH_MODEL_ID = GEMINI_3_5_FLASH_MODEL_ID;
export const OFFICIAL_GEMINI_3_5_FLASH_MODEL_NAME = GEMINI_3_5_FLASH_MODEL_NAME;
export const DEFAULT_PROVIDER_ID: BuiltInProviderId = GEMINI_PROVIDER_ID;
export const DEFAULT_MODEL_ID = OFFICIAL_GEMINI_3_5_FLASH_MODEL_ID;
export const DEFAULT_MODEL_STRING = `${DEFAULT_PROVIDER_ID}:${DEFAULT_MODEL_ID}`;

export type { ProviderId, ProviderConfig, ModelInfo, ModelConfig };

/** Provider IDs whose logos are monochrome-dark and need `dark:invert` in dark mode */
export const MONO_LOGO_PROVIDERS: ReadonlySet<string> = new Set();

export const PROVIDERS: Record<BuiltInProviderId, ProviderConfig> = {
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    type: 'gemini-generate-content',
    defaultBaseUrl: GEMINI_BASE_URL,
    requiresApiKey: true,
    models: [
      {
        id: OFFICIAL_GEMINI_3_5_FLASH_MODEL_ID,
        name: OFFICIAL_GEMINI_3_5_FLASH_MODEL_NAME,
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

function getProviderConfig(providerId: string): ProviderConfig | null {
  return PROVIDERS[providerId as BuiltInProviderId] ?? null;
}

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

export function isProviderKeyRequired(providerId: string): boolean {
  return getProviderConfig(providerId)?.requiresApiKey ?? true;
}

export function getModel(config: ModelConfig): ModelWithInfo {
  const provider = getProviderConfig(config.providerId);
  if (!provider) {
    throw new Error(`Unknown provider: ${config.providerId}`);
  }

  const modelInfo = provider.models.find((model) => model.id === config.modelId) || null;
  if (!modelInfo) {
    throw new Error(`Unsupported text model: ${config.providerId}:${config.modelId}`);
  }

  const requiresApiKey = config.requiresApiKey ?? provider.requiresApiKey;
  if (requiresApiKey && !config.apiKey) {
    throw new Error('智能服务暂时不可用，请稍后再试');
  }

  return {
    model: {
      providerId: config.providerId,
      providerType: provider.type,
      modelId: config.modelId,
      apiKey: config.apiKey || '',
      baseUrl: provider.defaultBaseUrl || GEMINI_BASE_URL,
      modelInfo,
    },
    modelInfo,
  };
}

export function getAllModels(): {
  provider: ProviderConfig;
  models: ModelInfo[];
}[] {
  return Object.values(PROVIDERS).map((provider) => ({
    provider,
    models: provider.models,
  }));
}

export function getProvider(providerId: string): ProviderConfig | undefined {
  return PROVIDERS[providerId as BuiltInProviderId];
}

export function getModelInfo(providerId: string, modelId: string): ModelInfo | undefined {
  const provider = PROVIDERS[providerId as BuiltInProviderId];
  return provider?.models.find((model) => model.id === modelId);
}
