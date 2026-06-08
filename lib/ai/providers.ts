/**
 * Unified AI Provider Configuration
 *
 * Text generation is fixed to the server-configured Bailian OpenAI-compatible provider.
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
  BAILIAN_COMPATIBLE_BASE_URL_TEMPLATE,
  QWEN_3_7_PLUS_MODEL_ID,
  QWEN_3_7_PLUS_MODEL_NAME,
} from './bailian-models';

export const BAILIAN_PROVIDER_ID: BuiltInProviderId = 'bailian';
export const DEFAULT_PROVIDER_ID: BuiltInProviderId = BAILIAN_PROVIDER_ID;
export const DEFAULT_MODEL_ID = QWEN_3_7_PLUS_MODEL_ID;
export const DEFAULT_MODEL_STRING = `${DEFAULT_PROVIDER_ID}:${DEFAULT_MODEL_ID}`;

export type { ProviderId, ProviderConfig, ModelInfo, ModelConfig };

/** Provider IDs whose logos are monochrome-dark and need `dark:invert` in dark mode */
export const MONO_LOGO_PROVIDERS: ReadonlySet<string> = new Set();

export const PROVIDERS: Record<BuiltInProviderId, ProviderConfig> = {
  bailian: {
    id: 'bailian',
    name: '阿里云百炼',
    type: 'openai-chat',
    defaultBaseUrl: BAILIAN_COMPATIBLE_BASE_URL_TEMPLATE,
    requiresApiKey: true,
    models: [
      {
        id: QWEN_3_7_PLUS_MODEL_ID,
        name: QWEN_3_7_PLUS_MODEL_NAME,
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
  metadataUserId?: string;
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
  if (!config.baseUrl) {
    throw new Error('智能服务暂时不可用，请稍后再试');
  }

  return {
    model: {
      providerId: config.providerId,
      providerType: provider.type,
      modelId: config.modelId,
      apiKey: config.apiKey || '',
      baseUrl: config.baseUrl,
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
