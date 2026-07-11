/**
 * Unified AI Provider Configuration
 *
 * Text generation is fixed to the server-configured Google Gemini provider.
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
  GEMINI_API_BASE_URL,
  GEMINI_3_5_FLASH_MODEL_ID,
  GEMINI_3_5_FLASH_MODEL_NAME,
} from './gemini-models';

export const DEFAULT_PROVIDER_ID: BuiltInProviderId = 'google-gemini';
export const DEFAULT_MODEL_ID = GEMINI_3_5_FLASH_MODEL_ID;
export const DEFAULT_MODEL_STRING = `${DEFAULT_PROVIDER_ID}:${DEFAULT_MODEL_ID}`;

export type { ProviderId, ProviderConfig, ModelConfig };

/** Provider IDs whose logos are monochrome-dark and need `dark:invert` in dark mode */
export const MONO_LOGO_PROVIDERS: ReadonlySet<string> = new Set();

export const PROVIDERS: Record<BuiltInProviderId, ProviderConfig> = {
  'google-gemini': {
    id: 'google-gemini',
    name: 'Google Gemini',
    type: 'google-gemini',
    defaultBaseUrl: GEMINI_API_BASE_URL,
    requiresApiKey: true,
    models: [
      {
        id: GEMINI_3_5_FLASH_MODEL_ID,
        name: GEMINI_3_5_FLASH_MODEL_NAME,
        contextWindow: 1_048_576,
        outputWindow: 65_536,
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
  requestUserId?: string;
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
