/**
 * Unified AI Provider Configuration
 *
 * Text generation is fixed to the server-configured Volcengine Ark OpenAI-compatible provider.
 */

import type {
  ProviderId,
  BuiltInProviderId,
  ProviderConfig,
  ProviderType,
  ModelInfo,
  ModelConfig,
} from '@/lib/types/provider';
import {
  ARK_BASE_URL,
  DOUBAO_SEED_2_1_PRO_MODEL_ID,
  DOUBAO_SEED_2_1_PRO_MODEL_NAME,
} from './ark-models';

export const DEFAULT_PROVIDER_ID: BuiltInProviderId = 'volcengine-ark';
export const DEFAULT_MODEL_ID = DOUBAO_SEED_2_1_PRO_MODEL_ID;
export const DEFAULT_MODEL_STRING = `${DEFAULT_PROVIDER_ID}:${DEFAULT_MODEL_ID}`;

export type { ProviderId, ProviderConfig, ModelConfig };

/** Provider IDs whose logos are monochrome-dark and need `dark:invert` in dark mode */
export const MONO_LOGO_PROVIDERS: ReadonlySet<string> = new Set();

export const PROVIDERS: Record<BuiltInProviderId, ProviderConfig> = {
  'volcengine-ark': {
    id: 'volcengine-ark',
    name: '火山方舟',
    type: 'openai-chat-completions',
    defaultBaseUrl: ARK_BASE_URL,
    requiresApiKey: true,
    models: [
      {
        id: DOUBAO_SEED_2_1_PRO_MODEL_ID,
        name: DOUBAO_SEED_2_1_PRO_MODEL_NAME,
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

function getProviderConfig(providerId: string): ProviderConfig | null {
  return PROVIDERS[providerId as BuiltInProviderId] ?? null;
}

export interface ModelWithInfo {
  model: ResponsesModel;
  modelInfo: ModelInfo | null;
}

export interface ResponsesModel {
  providerId: ProviderId;
  /** Transport protocol used by the configured text model. */
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
