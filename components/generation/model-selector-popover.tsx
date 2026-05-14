'use client';

import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/lib/store/settings';
import {
  getCurrentModelPresetId,
  MODEL_PRESET_OPTIONS,
  type ModelPresetOption,
} from '@/components/generation/model-presets';

interface ModelSelectorPopoverProps {
  children: React.ReactNode;
}

export function ModelSelectorPopover({ children }: ModelSelectorPopoverProps) {
  const [open, setOpen] = useState(false);

  const currentProviderId = useSettingsStore((s) => s.providerId);
  const currentModelId = useSettingsStore((s) => s.modelId);
  const thinkingConfigs = useSettingsStore((s) => s.thinkingConfigs);
  const setModelWithThinkingConfig = useSettingsStore((s) => s.setModelWithThinkingConfig);

  const currentPresetId = getCurrentModelPresetId(
    currentProviderId,
    currentModelId,
    thinkingConfigs,
  );

  const handleSelect = (option: ModelPresetOption) => {
    setModelWithThinkingConfig(option.providerId, option.modelId, option.thinkingConfig);
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
        {MODEL_PRESET_OPTIONS.map((option) => {
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
                  : 'hover:bg-primary/5 hover:text-primary text-foreground border border-transparent',
              )}
            >
              <Icon className="size-4 shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-xs font-semibold block leading-tight">{option.label}</span>
                <span
                  className={cn(
                    'text-[10px] block leading-tight',
                    isSelected ? 'text-primary/70' : 'text-muted-foreground',
                  )}
                >
                  {option.description}
                </span>
              </div>
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
