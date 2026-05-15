import type { ProviderConfig, ProviderId, ThinkingCapability } from '@/lib/types/provider';
import {
  GEMINI_3_1_FLASH_LITE_PREVIEW_MODEL_ID,
  GEMINI_3_FLASH_PREVIEW_MODEL_ID,
  GEMINI_3_1_PRO_PREVIEW_CUSTOM_TOOLS_MODEL_ID,
} from './openrouter-models';

export function getModelMetadataKey(providerId: string, modelId: string): string {
  return `${providerId}:${modelId}`;
}

const OPENROUTER_GEMINI_THINKING_CAPABILITY: ThinkingCapability = {
  control: 'effort',
  requestAdapter: 'openrouter-chat-completions',
  defaultMode: 'enabled',
  effortValues: ['minimal', 'low', 'medium', 'high'],
  defaultEffort: 'high',
  toggleable: true,
  budgetAdjustable: true,
  defaultEnabled: true,
};

const THINKING_CAPABILITIES: Record<string, ThinkingCapability> = {
  [`openrouter:${GEMINI_3_1_FLASH_LITE_PREVIEW_MODEL_ID}`]:
    OPENROUTER_GEMINI_THINKING_CAPABILITY,
  [`openrouter:${GEMINI_3_FLASH_PREVIEW_MODEL_ID}`]: OPENROUTER_GEMINI_THINKING_CAPABILITY,
  [`openrouter:${GEMINI_3_1_PRO_PREVIEW_CUSTOM_TOOLS_MODEL_ID}`]:
    OPENROUTER_GEMINI_THINKING_CAPABILITY,
};

export function getCatalogThinkingCapability(
  providerId: string,
  modelId: string,
): ThinkingCapability | undefined {
  return THINKING_CAPABILITIES[getModelMetadataKey(providerId, modelId)];
}

export function applyModelMetadata(providers: Record<ProviderId, ProviderConfig>): void {
  for (const provider of Object.values(providers)) {
    for (const model of provider.models) {
      const thinking = getCatalogThinkingCapability(provider.id, model.id);
      if (thinking) {
        model.capabilities = {
          ...model.capabilities,
          thinking,
        };
      }
    }
  }
}
