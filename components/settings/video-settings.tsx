'use client';

import { Label } from '@/components/ui/label';
import { useSettingsStore } from '@/lib/store/settings';
import { VIDEO_PROVIDERS } from '@/lib/media/video-providers';
import type { VideoProviderId } from '@/lib/media/types';

interface VideoSettingsProps {
  selectedProviderId: VideoProviderId;
}

export function VideoSettings({ selectedProviderId }: VideoSettingsProps) {
  const provider = VIDEO_PROVIDERS[selectedProviderId];
  const videoProvidersConfig = useSettingsStore((state) => state.videoProvidersConfig);

  const currentConfig = videoProvidersConfig[selectedProviderId];
  const isServerConfigured = !!currentConfig?.isServerConfigured;

  return (
    <div className="space-y-6 max-w-3xl">
      {!isServerConfigured && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-3 text-sm text-blue-700 dark:text-blue-300">
          此功能暂时不可用，请稍后再试。
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-sm text-muted-foreground">可用模型</Label>
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/50 border border-border/40 text-xs font-mono text-muted-foreground">
          <span className="size-1.5 rounded-full bg-emerald-500/70" />
          {provider.models[0].name}
        </div>
      </div>
    </div>
  );
}
