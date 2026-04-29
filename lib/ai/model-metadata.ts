import type { ProviderConfig, ProviderId, ThinkingCapability } from '@/lib/types/provider';

export function getModelMetadataKey(providerId: string, modelId: string): string {
  return `${providerId}:${modelId}`;
}

function qwenToggleCapability(): ThinkingCapability {
  return {
    control: 'toggle',
    requestAdapter: 'qwen',
    defaultMode: 'enabled',
    toggleable: true,
    budgetAdjustable: false,
    defaultEnabled: true,
  };
}

const THINKING_CAPABILITIES: Record<string, ThinkingCapability> = {
  [getModelMetadataKey('qwen', 'qwen3.6-flash')]: qwenToggleCapability(),
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
