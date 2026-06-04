import type { ProviderConfig, ProviderId, ThinkingCapability } from '@/lib/types/provider';
import { MINIMAX_M3_MODEL_ID } from './minimax-models';

export function getModelMetadataKey(providerId: string, modelId: string): string {
  return `${providerId}:${modelId}`;
}

const MINIMAX_M3_THINKING_CAPABILITY: ThinkingCapability = {
  control: 'mode',
  requestAdapter: 'anthropic-messages',
  defaultMode: 'enabled',
  toggleable: true,
  defaultEnabled: true,
};

const THINKING_CAPABILITIES: Record<string, ThinkingCapability> = {
  [`minimax:${MINIMAX_M3_MODEL_ID}`]: MINIMAX_M3_THINKING_CAPABILITY,
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
