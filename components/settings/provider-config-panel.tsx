'use client';

import { Label } from '@/components/ui/label';
import { Zap, Sparkles, Wrench, FileText, Send } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { ProviderConfig } from '@/lib/ai/providers';
import type { ProvidersConfig } from '@/lib/types/settings';
import { formatContextWindow } from './utils';

interface ProviderConfigPanelProps {
  provider: ProviderConfig;
  providersConfig: ProvidersConfig;
}

export function ProviderConfigPanel({ provider, providersConfig }: ProviderConfigPanelProps) {
  const { t } = useI18n();
  const models = providersConfig[provider.id]?.models || [];
  const isServerConfigured = providersConfig[provider.id]?.isServerConfigured;

  return (
    <div className="space-y-6 max-w-3xl">
      {!isServerConfigured && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-3 text-sm text-blue-700 dark:text-blue-300">
          {t('settings.serverConfigMissingNotice')}
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Label className="text-base">{t('settings.models')}</Label>
        </div>
        <div className="space-y-1.5">
          {models.map((model) => (
            <div
              key={model.id}
              className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-card"
            >
              <div className="flex-1">
                <div className="font-mono text-sm font-medium mb-1.5">{model.name}</div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    {model.capabilities?.vision && (
                      <div title={t('settings.capabilities.vision')}>
                        <Sparkles className="h-3 w-3" />
                      </div>
                    )}
                    {model.capabilities?.tools && (
                      <div title={t('settings.capabilities.tools')}>
                        <Wrench className="h-3 w-3" />
                      </div>
                    )}
                    {model.capabilities?.streaming && (
                      <div title={t('settings.capabilities.streaming')}>
                        <Zap className="h-3 w-3" />
                      </div>
                    )}
                  </div>
                  {model.contextWindow && (
                    <span className="flex items-center gap-0.5">
                      <FileText className="h-3 w-3" />
                      <span className="text-[10px]">{formatContextWindow(model.contextWindow)}</span>
                    </span>
                  )}
                  {model.outputWindow && (
                    <span className="flex items-center gap-0.5">
                      <Send className="h-3 w-3" />
                      <span className="text-[10px]">{formatContextWindow(model.outputWindow)}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
