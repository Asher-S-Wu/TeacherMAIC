import { Sparkles } from 'lucide-react';

export type ModelPresetId = 'auto';

export interface ModelPresetOption {
  id: ModelPresetId;
  label: string;
  description: string;
  icon: typeof Sparkles;
}

export const AUTO_MODEL_PRESET: ModelPresetOption = {
  id: 'auto',
  label: '自动',
  description: '自动生成课程内容',
  icon: Sparkles,
};

export function getCurrentModelPreset(): ModelPresetOption {
  return AUTO_MODEL_PRESET;
}
