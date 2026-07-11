'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { SettingsSection } from '@/lib/types/settings';
import { MediaPopover } from '@/components/generation/media-popover';
import { ModelSelectorPopover } from '@/components/generation/model-selector-popover';
import { getCurrentModelPreset } from '@/components/generation/model-presets';

// ─── Types ───────────────────────────────────────────────────
export interface GenerationToolbarProps {
  webSearch: boolean;
  onWebSearchChange: (v: boolean) => void;
  onSettingsOpen: (section?: SettingsSection) => void;
}

// ─── Component ───────────────────────────────────────────────
export function GenerationToolbar({
  webSearch,
  onWebSearchChange,
  onSettingsOpen,
}: GenerationToolbarProps) {
  const currentPreset = getCurrentModelPreset();

  // ─── Pill button helper ─────────────────────────────
  const pillCls =
    'inline-flex h-[32px] min-w-0 items-center justify-center gap-[6px] rounded-full border px-[12px] text-[12px] font-medium leading-none transition-all cursor-pointer select-none whitespace-nowrap';
  return (
    <div className="flex h-[32px] min-w-0 flex-1 flex-nowrap items-center gap-[8px] overflow-hidden">
      {/* ── Server-managed model ── */}
      <Tooltip>
        <ModelSelectorPopover>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={cn(
                pillCls,
                'order-3 ml-auto border-primary/20 bg-primary/10 text-primary hover:bg-primary/15 dark:border-primary/25 dark:bg-primary/15 dark:hover:bg-primary/20',
              )}
            >
              <currentPreset.icon className="size-[14px] shrink-0" />
              <span>{currentPreset.label}</span>
            </button>
          </TooltipTrigger>
        </ModelSelectorPopover>
        <TooltipContent>当前课程会使用这里显示的模型。</TooltipContent>
      </Tooltip>

      {/* ── Separator ── */}
      <div className="order-4 h-[18px] w-px shrink-0 bg-border/60" />

      {/* ── Media popover ── */}
      <div className="order-5 shrink-0">
        <MediaPopover
          webSearch={webSearch}
          onWebSearchChange={onWebSearchChange}
          onSettingsOpen={onSettingsOpen}
        />
      </div>
    </div>
  );
}
