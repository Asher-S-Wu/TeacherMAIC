'use client';

import { useState } from 'react';
import { Zap, Atom, Network, Check } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/lib/store/settings';
import type { ThinkingConfig } from '@/lib/types/provider';
import { EXPERT_MODEL_ID, EXPERT_PROVIDER_ID } from '@/lib/ai/providers';

interface PresetOption {
  id: string;
  label: string;
  description: string;
  icon: typeof Zap;
  providerId: 'ark' | 'deepseek';
  modelId: string;
  thinkingConfig?: ThinkingConfig;
}

const PRESET_OPTIONS: PresetOption[] = [
  {
    id: 'fast',
    label: '快速',
    description: '适用于大部分情况',
    icon: Zap,
    providerId: 'deepseek',
    modelId: 'deepseek-v4-flash',
    thinkingConfig: { mode: 'disabled' },
  },
  {
    id: 'think',
    label: '思考',
    description: '擅长解决更难的问题',
    icon: Atom,
    providerId: 'ark',
    modelId: 'doubao-seed-2-0-lite-260428',
    thinkingConfig: { mode: 'enabled' },
  },
  {
    id: 'expert',
    label: '专家',
    description: '研究级智能模型',
    icon: Network,
    providerId: EXPERT_PROVIDER_ID,
    modelId: EXPERT_MODEL_ID,
    thinkingConfig: { mode: 'enabled', effort: 'max' },
  },
];

interface ModelSelectorPopoverProps {
  children: React.ReactNode;
}

export function ModelSelectorPopover({ children }: ModelSelectorPopoverProps) {
  const [open, setOpen] = useState(false);

  const currentProviderId = useSettingsStore((s) => s.providerId);
  const currentModelId = useSettingsStore((s) => s.modelId);
  const setModel = useSettingsStore((s) => s.setModel);
  const setThinkingConfig = useSettingsStore((s) => s.setThinkingConfig);

  const getCurrentPresetId = (): string => {
    for (const option of PRESET_OPTIONS) {
      if (option.providerId === currentProviderId && option.modelId === currentModelId) {
        return option.id;
      }
    }
    return 'think';
  };

  const currentPresetId = getCurrentPresetId();

  const handleSelect = (option: PresetOption) => {
    setModel(option.providerId, option.modelId);
    if (option.thinkingConfig) {
      setThinkingConfig(option.providerId, option.modelId, option.thinkingConfig);
    }
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        avoidCollisions={false}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        className="w-44 p-1"
      >
        {PRESET_OPTIONS.map((option) => {
          const isSelected = option.id === currentPresetId;
          const Icon = option.icon;
          return (
            <button
              key={option.id}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleSelect(option);
              }}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-1.5 rounded-md transition-all text-left',
                isSelected
                  ? 'bg-primary/10 text-primary border border-primary/20'
                  : 'hover:bg-muted/50 text-foreground border border-transparent',
              )}
            >
              <Icon className="size-4 shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-xs font-semibold block leading-tight">{option.label}</span>
                <span className="text-[10px] text-muted-foreground block leading-tight">{option.description}</span>
              </div>
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
