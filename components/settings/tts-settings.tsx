'use client';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSettingsStore } from '@/lib/store/settings';
import { TTS_PROVIDERS } from '@/lib/audio/constants';
import type { TTSProviderId } from '@/lib/audio/types';

interface TTSSettingsProps {
  selectedProviderId: TTSProviderId;
}

export function TTSSettings({ selectedProviderId }: TTSSettingsProps) {
  const provider = TTS_PROVIDERS[selectedProviderId];
  const providerConfig = useSettingsStore((state) => state.ttsProvidersConfig[selectedProviderId]);
  const ttsVoice = useSettingsStore((state) => state.ttsVoice);
  const ttsSpeed = useSettingsStore((state) => state.ttsSpeed);
  const setTTSVoice = useSettingsStore((state) => state.setTTSVoice);
  const setTTSSpeed = useSettingsStore((state) => state.setTTSSpeed);

  return (
    <div className="space-y-6 max-w-3xl">
      {!providerConfig?.isServerConfigured && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-3 text-sm text-blue-700 dark:text-blue-300">
          此功能暂时不可用，请稍后再试。
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-sm">音色</Label>
          <Select value={ttsVoice} onValueChange={setTTSVoice}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {provider.voices.map((voice) => (
                <SelectItem key={voice.id} value={voice.id}>
                  {voice.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-sm">语速</Label>
          <Input
            type="number"
            min="0.5"
            max="2"
            step="0.1"
            value={ttsSpeed}
            onChange={(e) => setTTSSpeed(Number(e.target.value) || 1)}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm text-muted-foreground">可用模型</Label>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/50 border border-border/40 text-xs font-mono text-muted-foreground">
            <span className="size-1.5 rounded-full bg-emerald-500/70" />
            {provider.models[0].name}
          </div>
        </div>
      </div>
    </div>
  );
}
