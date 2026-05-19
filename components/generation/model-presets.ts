import { Atom, Crown, Network, Zap } from 'lucide-react';

import {
  ANTHROPIC_PROVIDER_ID,
  EXPERT_MODEL_ID,
  EXPERT_PROVIDER_ID,
  GEMINI_PROVIDER_ID,
  OFFICIAL_CLAUDE_OPUS_4_7_MODEL_ID,
  OFFICIAL_GEMINI_3_FLASH_PREVIEW_MODEL_ID,
  isExpertModel,
} from '@/lib/ai/providers';
import type { ProviderId, ThinkingConfig } from '@/lib/types/provider';

export type ModelPresetId = 'fast' | 'think' | 'expert' | 'ultimate';

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
    providerId: GEMINI_PROVIDER_ID,
    modelId: OFFICIAL_GEMINI_3_FLASH_PREVIEW_MODEL_ID,
    thinkingConfig: { mode: 'disabled' },
  },
  think: {
    id: 'think',
    label: '标准',
    description: '擅长解决更难的问题',
    icon: Atom,
    providerId: GEMINI_PROVIDER_ID,
    modelId: OFFICIAL_GEMINI_3_FLASH_PREVIEW_MODEL_ID,
    thinkingConfig: { mode: 'enabled', level: 'high' },
  },
  expert: {
    id: 'expert',
    label: '专业',
    description: '研究级智能模型',
    icon: Network,
    providerId: EXPERT_PROVIDER_ID,
    modelId: EXPERT_MODEL_ID,
    thinkingConfig: { mode: 'enabled', level: 'high' },
  },
  ultimate: {
    id: 'ultimate',
    label: '极致',
    description: '限时体验旗舰级模型',
    icon: Crown,
    providerId: ANTHROPIC_PROVIDER_ID,
    modelId: OFFICIAL_CLAUDE_OPUS_4_7_MODEL_ID,
    thinkingConfig: { mode: 'enabled', level: 'max' },
  },
};

export const MODEL_PRESET_OPTIONS: ModelPresetOption[] = [
  MODEL_PRESET_BY_ID.fast,
  MODEL_PRESET_BY_ID.think,
  MODEL_PRESET_BY_ID.expert,
  MODEL_PRESET_BY_ID.ultimate,
];

export function getCurrentModelPresetId(
  providerId: ProviderId,
  modelId: string,
  thinkingConfigs: Record<string, ThinkingConfig>,
): ModelPresetId {
  // “快速”和“标准”共用同一个 Gemini 3 Flash 模型，靠思考开关区分：关闭=快速，启用=标准
  if (
    providerId === GEMINI_PROVIDER_ID &&
    modelId === OFFICIAL_GEMINI_3_FLASH_PREVIEW_MODEL_ID
  ) {
    const thinkingMode = thinkingConfigs[modelId]?.mode;
    return thinkingMode === 'disabled' ? 'fast' : 'think';
  }

  if (
    providerId === ANTHROPIC_PROVIDER_ID &&
    modelId === OFFICIAL_CLAUDE_OPUS_4_7_MODEL_ID
  ) {
    return 'ultimate';
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
