import type { ProviderConfig, ProviderId, ThinkingCapability } from '@/lib/types/provider';

export function getModelMetadataKey(providerId: string, modelId: string): string {
  return `${providerId}:${modelId}`;
}

const THINKING_CAPABILITIES: Record<string, ThinkingCapability> = {
  'ark:doubao-seed-2-0-mini-260428': {
    control: 'effort',
    requestAdapter: 'ark-responses',
    defaultMode: 'enabled',
    effortValues: ['none', 'minimal', 'low', 'medium', 'high'],
    defaultEffort: 'high',
    defaultEnabled: true,
    toggleable: true,
    budgetAdjustable: true,
  },
  'ark:doubao-seed-2-0-lite-260428': {
    control: 'effort',
    requestAdapter: 'ark-responses',
    defaultMode: 'enabled',
    effortValues: ['none', 'minimal', 'low', 'medium', 'high'],
    defaultEffort: 'high',
    defaultEnabled: true,
    toggleable: true,
    budgetAdjustable: true,
  },
  'deepseek:deepseek-v4-pro': {
    control: 'effort',
    requestAdapter: 'deepseek-chat',
    defaultMode: 'disabled',
    effortValues: ['none', 'max'],
    defaultEffort: 'none',
    defaultEnabled: false,
    budgetAdjustable: true,
  },
  'deepseek:deepseek-v4-flash': {
    control: 'effort',
    requestAdapter: 'deepseek-chat',
    defaultMode: 'disabled',
    effortValues: ['none', 'max'],
    defaultEffort: 'none',
    defaultEnabled: false,
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
