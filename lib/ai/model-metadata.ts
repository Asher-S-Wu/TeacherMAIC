import type { ProviderConfig, ProviderId, ThinkingCapability } from '@/lib/types/provider';

export function getModelMetadataKey(providerId: string, modelId: string): string {
  return `${providerId}:${modelId}`;
}

const THINKING_CAPABILITIES: Record<string, ThinkingCapability> = {
  'ark:doubao-seed-2-0-lite-260428': {
    control: 'toggle',
    requestAdapter: 'ark-responses',
    defaultMode: 'enabled',
    defaultEnabled: true,
    toggleable: true,
  },
  'deepseek:deepseek-v4-pro': {
    control: 'effort',
    requestAdapter: 'deepseek-chat',
    defaultMode: 'enabled',
    effortValues: ['high', 'max'],
    defaultEffort: 'max',
    defaultEnabled: true,
    budgetAdjustable: true,
  },
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
