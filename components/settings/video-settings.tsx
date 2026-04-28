'use client';

import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useSettingsStore } from '@/lib/store/settings';
import { VIDEO_PROVIDERS } from '@/lib/media/video-providers';
import { CheckCircle2, Loader2, XCircle, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VideoProviderId } from '@/lib/media/types';

interface VideoSettingsProps {
  selectedProviderId: VideoProviderId;
}

export function VideoSettings({ selectedProviderId }: VideoSettingsProps) {
  const { t } = useI18n();

  const provider = VIDEO_PROVIDERS['qwen-video'];
  const videoProvidersConfig = useSettingsStore((state) => state.videoProvidersConfig);

  const [testLoading, setTestLoading] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');

  const [prevSelectedProviderId, setPrevSelectedProviderId] = useState(selectedProviderId);
  if (selectedProviderId !== prevSelectedProviderId) {
    setPrevSelectedProviderId(selectedProviderId);
    setTestStatus('idle');
    setTestMessage('');
  }

  const currentConfig = videoProvidersConfig['qwen-video'];
  const isServerConfigured = !!currentConfig?.isServerConfigured;

  const handleTest = async () => {
    setTestLoading(true);
    setTestStatus('idle');
    setTestMessage('');
    try {
      const response = await fetch('/api/verify-video-provider', {
        method: 'POST',
      });
      const data = await response.json();
      if (data.success) {
        setTestStatus('success');
        setTestMessage(t('settings.videoConnectivitySuccess'));
      } else {
        setTestStatus('error');
        setTestMessage(
          `${t('settings.videoConnectivityFailed')}: ${data.error || data.details || data.message}`,
        );
      }
    } catch (err) {
      setTestStatus('error');
      setTestMessage(`${t('settings.videoConnectivityFailed')}: ${err}`);
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-3 text-sm text-blue-700 dark:text-blue-300">
        {isServerConfigured
          ? t('settings.serverConfiguredNotice')
          : t('settings.serverConfigMissingNotice')}
      </div>

      <div className="space-y-2">
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleTest}
            disabled={testLoading || !isServerConfigured}
            className="gap-1.5"
          >
            {testLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <>
                <Zap className="h-3.5 w-3.5" />
                {t('settings.testConnection')}
              </>
            )}
          </Button>
        </div>
        {testMessage && (
          <div
            className={cn(
              'rounded-lg p-3 text-sm overflow-hidden',
              testStatus === 'success' &&
                'bg-green-50 text-green-700 border border-green-200 dark:bg-green-950/50 dark:text-green-400 dark:border-green-800',
              testStatus === 'error' &&
                'bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800',
            )}
          >
            <div className="flex items-start gap-2 min-w-0">
              {testStatus === 'success' && <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />}
              {testStatus === 'error' && <XCircle className="h-4 w-4 mt-0.5 shrink-0" />}
              <p className="flex-1 min-w-0 break-all">{testMessage}</p>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-sm text-muted-foreground">{t('settings.availableModels')}</Label>
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/50 border border-border/40 text-xs font-mono text-muted-foreground">
          <span className="size-1.5 rounded-full bg-emerald-500/70" />
          {provider.models[0].name}
        </div>
      </div>
    </div>
  );
}
