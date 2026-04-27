'use client';

import { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useSettingsStore } from '@/lib/store/settings';
import { TTS_PROVIDERS } from '@/lib/audio/constants';
import type { TTSProviderId } from '@/lib/audio/types';
import { CheckCircle2, Eye, EyeOff, Loader2, Volume2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createLogger } from '@/lib/logger';
import { useTTSPreview } from '@/lib/audio/use-tts-preview';

const log = createLogger('TTSSettings');

interface TTSSettingsProps {
  selectedProviderId: TTSProviderId;
}

export function TTSSettings({ selectedProviderId }: TTSSettingsProps) {
  const { t } = useI18n();
  const provider = TTS_PROVIDERS['qwen-tts'];
  const providerConfig = useSettingsStore((state) => state.ttsProvidersConfig['qwen-tts']);
  const ttsVoice = useSettingsStore((state) => state.ttsVoice);
  const ttsSpeed = useSettingsStore((state) => state.ttsSpeed);
  const setTTSVoice = useSettingsStore((state) => state.setTTSVoice);
  const setTTSSpeed = useSettingsStore((state) => state.setTTSSpeed);
  const setTTSProviderConfig = useSettingsStore((state) => state.setTTSProviderConfig);

  const [showApiKey, setShowApiKey] = useState(false);
  const [testText, setTestText] = useState(t('settings.ttsTestTextDefault'));
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const { previewing: testingTTS, startPreview, stopPreview } = useTTSPreview();

  useEffect(() => {
    setTestText(t('settings.ttsTestTextDefault'));
  }, [t]);

  useEffect(() => {
    stopPreview();
    setShowApiKey(false);
    setTestStatus('idle');
    setTestMessage('');
  }, [selectedProviderId, stopPreview]);

  const handleTestTTS = async () => {
    if (!testText.trim()) return;

    setTestStatus('testing');
    setTestMessage('');

    try {
      await startPreview({
        text: testText,
        providerId: 'qwen-tts',
        voice: ttsVoice,
        speed: ttsSpeed,
        apiKey: providerConfig?.apiKey,
      });
      setTestStatus('success');
      setTestMessage(t('settings.ttsTestSuccess'));
    } catch (error) {
      log.error('TTS test failed:', error);
      setTestStatus('error');
      setTestMessage(
        error instanceof Error && error.message
          ? `${t('settings.ttsTestFailed')}: ${error.message}`
          : t('settings.ttsTestFailed'),
      );
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {providerConfig?.isServerConfigured && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-3 text-sm text-blue-700 dark:text-blue-300">
          {t('settings.serverConfiguredNotice')}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-sm">{t('settings.ttsApiKey')}</Label>
          <div className="relative">
            <Input
              name="tts-api-key-qwen"
              type={showApiKey ? 'text' : 'password'}
              autoComplete="new-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder={
                providerConfig?.isServerConfigured
                  ? t('settings.optionalOverride')
                  : t('settings.enterApiKey')
              }
              value={providerConfig?.apiKey || ''}
              onChange={(e) => setTTSProviderConfig('qwen-tts', { apiKey: e.target.value })}
              className="font-mono text-sm pr-10"
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm">{t('settings.ttsVoice')}</Label>
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
          <Label className="text-sm">{t('settings.ttsSpeed')}</Label>
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
          <Label className="text-sm text-muted-foreground">{t('settings.availableModels')}</Label>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/50 border border-border/40 text-xs font-mono text-muted-foreground">
            <span className="size-1.5 rounded-full bg-emerald-500/70" />
            {provider.models[0].name}
          </div>
        </div>
      </div>

      <div className="space-y-3 pt-2 border-t">
        <Label className="text-sm">{t('settings.testConnection')}</Label>
        <div className="flex gap-2">
          <Input
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            placeholder={t('settings.ttsTestTextPlaceholder')}
            className="flex-1"
          />
          <Button onClick={handleTestTTS} disabled={testingTTS || !testText.trim()} className="gap-2">
            {testingTTS ? <Loader2 className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />}
            {testingTTS ? t('settings.testing') : t('settings.testConnection')}
          </Button>
        </div>

        {testStatus !== 'idle' && testMessage && (
          <div
            className={cn(
              'flex items-center gap-2 text-sm',
              testStatus === 'success' && 'text-emerald-600 dark:text-emerald-400',
              testStatus === 'error' && 'text-destructive',
            )}
          >
            {testStatus === 'success' && <CheckCircle2 className="h-4 w-4" />}
            {testStatus === 'error' && <XCircle className="h-4 w-4" />}
            <span>{testMessage}</span>
          </div>
        )}
      </div>
    </div>
  );
}
