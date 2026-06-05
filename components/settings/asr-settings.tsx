'use client';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSettingsStore } from '@/lib/store/settings';
import { ASR_PROVIDERS, getASRLanguageName } from '@/lib/audio/constants';
import type { ASRProviderId } from '@/lib/audio/types';

interface ASRSettingsProps {
  selectedProviderId: ASRProviderId;
}

export function ASRSettings({ selectedProviderId }: ASRSettingsProps) {
  const provider = ASR_PROVIDERS[selectedProviderId];
  const asrLanguage = useSettingsStore((state) => state.asrLanguage);
  const providerConfig = useSettingsStore((state) => state.asrProvidersConfig[selectedProviderId]);
  const setASRLanguage = useSettingsStore((state) => state.setASRLanguage);

  return (
    <div className="space-y-6 max-w-3xl">
      {!providerConfig?.isServerConfigured && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-3 text-sm text-blue-700 dark:text-blue-300">
          此功能暂时不可用，请稍后再试。
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-sm">识别语言</Label>
          <Select value={asrLanguage} onValueChange={setASRLanguage}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {provider.supportedLanguages.map((language) => (
                <SelectItem key={language} value={language}>
                  {getASRLanguageName(language)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

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
