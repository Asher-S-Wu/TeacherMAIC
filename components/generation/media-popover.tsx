'use client';

import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Volume2,
  Globe2,
  SlidersHorizontal,
  ChevronRight,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/lib/store/settings';
import { WEB_SEARCH_PROVIDERS } from '@/lib/web-search/constants';
import type { SettingsSection } from '@/lib/types/settings';

interface MediaPopoverProps {
  webSearch: boolean;
  onWebSearchChange: (v: boolean) => void;
  onSettingsOpen: (section: SettingsSection) => void;
}

type TabId = 'search' | 'tts';

const TABS: Array<{ id: TabId; icon: LucideIcon; label: string }> = [
  { id: 'search', icon: Globe2, label: 'Search' },
  { id: 'tts', icon: Volume2, label: 'TTS' },
];

export function MediaPopover({ webSearch, onWebSearchChange, onSettingsOpen }: MediaPopoverProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('search');

  // ─── Store ───
  const ttsEnabled = useSettingsStore((s) => s.ttsEnabled);
  const setTTSEnabled = useSettingsStore((s) => s.setTTSEnabled);

  const webSearchProviderId = useSettingsStore((s) => s.webSearchProviderId);
  const webSearchProvidersConfig = useSettingsStore((s) => s.webSearchProvidersConfig);

  const enabledMap: Record<TabId, boolean> = {
    search: webSearch,
    tts: ttsEnabled,
  };

  const enabledCount = [webSearch, ttsEnabled].filter(Boolean).length;

  const webSearchProvider = WEB_SEARCH_PROVIDERS[webSearchProviderId];
  const webSearchConfig = webSearchProvidersConfig[webSearchProviderId];
  const webSearchAvailable = webSearchProvider
    ? !webSearchProvider.requiresApiKey ||
      !!webSearchConfig?.isServerConfigured
    : false;

  // Auto-select first enabled tab on open
  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      const first = (['search', 'tts'] as TabId[]).find(
        (id) => enabledMap[id],
      );
      setActiveTab(first || 'search');
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'inline-flex h-[32px] items-center justify-center gap-[6px] rounded-full border px-[10px] text-[12px] font-medium leading-none transition-all cursor-pointer select-none whitespace-nowrap',
            enabledCount > 0
              ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border-violet-200/60 dark:border-violet-700/50'
              : 'text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 border-border/50',
          )}
        >
          <SlidersHorizontal className="size-[14px]" />
          {webSearch && webSearchProvider?.icon ? (
            <img
              src={webSearchProvider.icon}
              alt=""
              className="size-[14px] shrink-0 rounded-sm"
            />
          ) : null}
          {ttsEnabled && <Volume2 className="size-[14px]" />}
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" side="bottom" avoidCollisions={false} className="w-80 p-0">
        {/* ── Tab bar (segmented control) ── */}
        <div className="p-2 pb-0">
          <div className="flex gap-0.5 p-0.5 bg-muted/60 rounded-lg">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              const isEnabled = enabledMap[tab.id];
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[11px] font-medium transition-all relative',
                    isActive
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground/80',
                  )}
                >
                  <Icon className="size-3.5" />
                  <span className="hidden sm:inline">{tab.label}</span>
                  {isEnabled && !isActive && (
                    <span className="absolute top-1 right-1 size-1.5 rounded-full bg-violet-500" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Tab content ── */}
        <div className="p-3 pt-2.5">
          {activeTab === 'search' && (
            <TabPanel
              icon={Globe2}
              label={webSearchProvider?.name || '网络搜索'}
              enabled={webSearch}
              onToggle={(enabled) => {
                if (webSearchAvailable || !enabled) {
                  onWebSearchChange(enabled);
                }
              }}
            >
              <div className="space-y-2">
                <div className="flex items-center gap-2 rounded-lg bg-muted/45 px-2.5 py-2">
                  {webSearchProvider?.icon && (
                    <img src={webSearchProvider.icon} alt="" className="size-4 rounded-sm" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {webSearchProvider?.name || '自动'}
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground/70">
                  {webSearchAvailable
                    ? '生成前智能判断是否需要联网获取资料，让内容更准确'
                    : '联网搜索暂时不可用，请稍后再试'}
                </p>
              </div>
            </TabPanel>
          )}

          {activeTab === 'tts' && (
            <TabPanel
              icon={Volume2}
              label="语音合成"
              enabled={ttsEnabled}
              onToggle={setTTSEnabled}
            />
          )}
        </div>

        {/* ── Footer ── */}
        <div className="border-t border-border/40">
          <button
            onClick={() => {
              setOpen(false);
              onSettingsOpen(activeTab === 'search' ? 'web-search' : activeTab);
            }}
            className="w-full flex items-center justify-between px-3.5 py-2.5 text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            <span>高级设置</span>
            <ChevronRight className="size-3" />
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Tab panel: header (label + switch) + optional body ───
function TabPanel({
  icon: Icon,
  label,
  enabled,
  onToggle,
  children,
}: {
  icon: LucideIcon;
  label: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2.5">
        <Icon
          className={cn(
            'size-4 shrink-0 transition-colors',
            enabled ? 'text-violet-600 dark:text-violet-400' : 'text-muted-foreground/50',
          )}
        />
        <span
          className={cn(
            'flex-1 text-sm font-medium transition-colors',
            !enabled && 'text-muted-foreground',
          )}
        >
          {label}
        </span>
        <Switch
          checked={enabled}
          onCheckedChange={onToggle}
          className="scale-[0.85] origin-right"
        />
      </div>
      {enabled && children}
    </div>
  );
}
