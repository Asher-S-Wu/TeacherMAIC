import type { ProviderConfig, ProviderId, ThinkingCapability } from '@/lib/types/provider';
import { GEMINI_3_5_FLASH_MODEL_ID } from './gemini-models';

export function getModelMetadataKey(providerId: string, modelId: string): string {
  return `${providerId}:${modelId}`;
}

const GEMINI_FLASH_THINKING_CAPABILITY: ThinkingCapability = {
  control: 'level',
  requestAdapter: 'gemini-generate-content',
  defaultMode: 'enabled',
  levelValues: ['high'],
  defaultLevel: 'high',
  toggleable: true,
  budgetAdjustable: true,
  defaultEnabled: true,
};

const THINKING_CAPABILITIES: Record<string, ThinkingCapability> = {
  [`gemini:${GEMINI_3_5_FLASH_MODEL_ID}`]: GEMINI_FLASH_THINKING_CAPABILITY,
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
