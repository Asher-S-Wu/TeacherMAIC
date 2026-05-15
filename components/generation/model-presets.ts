import { Atom, Network, Zap } from 'lucide-react';

import {
  EXPERT_MODEL_ID,
  EXPERT_PROVIDER_ID,
  OPENROUTER_GEMINI_3_1_FLASH_LITE_PREVIEW_MODEL_ID,
  OPENROUTER_GEMINI_3_FLASH_PREVIEW_MODEL_ID,
  OPENROUTER_PROVIDER_ID,
  isExpertModel,
} from '@/lib/ai/providers';
import type { ProviderId, ThinkingConfig } from '@/lib/types/provider';

export type ModelPresetId = 'fast' | 'think' | 'expert';

export interface ModelPresetOption {
  id: ModelPresetId;
  label: string;
  description: string;
  icon: typeof Zap;
  providerId: ProviderId;
  modelId: string;
  thinkingConfig: ThinkingConfig;
}

export const MODEL_PRESET_BY_ID: Record<ModelPresetId, ModelPresetOption> = {
  fast: {
    id: 'fast',
    label: '快速',
    description: '适用于大部分情况',
    icon: Zap,
    providerId: OPENROUTER_PROVIDER_ID,
    modelId: OPENROUTER_GEMINI_3_1_FLASH_LITE_PREVIEW_MODEL_ID,
    thinkingConfig: { mode: 'enabled', effort: 'high' },
  },
  think: {
    id: 'think',
    label: '标准',
    description: '擅长解决更难的问题',
    icon: Atom,
    providerId: OPENROUTER_PROVIDER_ID,
    modelId: OPENROUTER_GEMINI_3_FLASH_PREVIEW_MODEL_ID,
    thinkingConfig: { mode: 'enabled', effort: 'high' },
  },
  expert: {
    id: 'expert',
    label: '专业',
    description: '研究级智能模型',
    icon: Network,
    providerId: EXPERT_PROVIDER_ID,
    modelId: EXPERT_MODEL_ID,
    thinkingConfig: { mode: 'enabled', effort: 'high' },
  },
};

export const MODEL_PRESET_OPTIONS: ModelPresetOption[] = [
  MODEL_PRESET_BY_ID.fast,
  MODEL_PRESET_BY_ID.think,
  MODEL_PRESET_BY_ID.expert,
];

export function getCurrentModelPresetId(
  providerId: ProviderId,
  modelId: string,
  thinkingConfigs: Record<string, ThinkingConfig>,
): ModelPresetId {
  void thinkingConfigs;
  if (
    providerId === OPENROUTER_PROVIDER_ID &&
    modelId === OPENROUTER_GEMINI_3_1_FLASH_LITE_PREVIEW_MODEL_ID
  ) {
    return 'fast';
  }
  if (
    providerId === OPENROUTER_PROVIDER_ID &&
    modelId === OPENROUTER_GEMINI_3_FLASH_PREVIEW_MODEL_ID
  ) {
    return 'think';
  }

  if (isExpertModel(providerId, modelId)) {
    return 'expert';
  }

  return 'think';
}

export function getCurrentModelPreset(
  providerId: ProviderId,
  modelId: string,
  thinkingConfigs: Record<string, ThinkingConfig>,
): ModelPresetOption {
  return MODEL_PRESET_BY_ID[getCurrentModelPresetId(providerId, modelId, thinkingConfigs)];
}
