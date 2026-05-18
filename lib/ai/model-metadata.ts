import type { ProviderConfig, ProviderId, ThinkingCapability } from '@/lib/types/provider';
import {
  GEMINI_3_1_FLASH_LITE_PREVIEW_MODEL_ID,
  GEMINI_3_FLASH_PREVIEW_MODEL_ID,
  GEMINI_3_1_PRO_PREVIEW_CUSTOM_TOOLS_MODEL_ID,
} from './gemini-models';
import { CLAUDE_OPUS_4_7_MODEL_ID } from './anthropic-models';

export function getModelMetadataKey(providerId: string, modelId: string): string {
  return `${providerId}:${modelId}`;
}

const OFFICIAL_GEMINI_FLASH_THINKING_CAPABILITY: ThinkingCapability = {
  control: 'level',
  requestAdapter: 'gemini-generate-content',
  defaultMode: 'enabled',
  levelValues: ['minimal', 'low', 'medium', 'high'],
  defaultLevel: 'high',
  toggleable: true,
  budgetAdjustable: true,
  defaultEnabled: true,
};

const OFFICIAL_GEMINI_PRO_THINKING_CAPABILITY: ThinkingCapability = {
  control: 'level',
  requestAdapter: 'gemini-generate-content',
  defaultMode: 'enabled',
  levelValues: ['low', 'medium', 'high'],
  defaultLevel: 'high',
  toggleable: true,
  budgetAdjustable: true,
  defaultEnabled: true,
};

const ANTHROPIC_CLAUDE_OPUS_THINKING_CAPABILITY: ThinkingCapability = {
  control: 'level',
  requestAdapter: 'anthropic-messages',
  defaultMode: 'enabled',
  levelValues: ['low', 'medium', 'high'],
  defaultLevel: 'high',
  toggleable: true,
  budgetAdjustable: false,
  defaultEnabled: true,
};

const THINKING_CAPABILITIES: Record<string, ThinkingCapability> = {
  [`gemini:${GEMINI_3_1_FLASH_LITE_PREVIEW_MODEL_ID}`]: OFFICIAL_GEMINI_FLASH_THINKING_CAPABILITY,
  [`gemini:${GEMINI_3_FLASH_PREVIEW_MODEL_ID}`]: OFFICIAL_GEMINI_FLASH_THINKING_CAPABILITY,
  [`gemini:${GEMINI_3_1_PRO_PREVIEW_CUSTOM_TOOLS_MODEL_ID}`]:
    OFFICIAL_GEMINI_PRO_THINKING_CAPABILITY,
  [`anthropic:${CLAUDE_OPUS_4_7_MODEL_ID}`]: ANTHROPIC_CLAUDE_OPUS_THINKING_CAPABILITY,
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
