'use client';

import { Bot, Check, FileText, Send, Sparkles, Wrench, Zap } from 'lucide-react';

import { Label } from '@/components/ui/label';
import type { ProviderConfig } from '@/lib/ai/providers';
import type { ProvidersConfig } from '@/lib/types/settings';
import { formatContextWindow } from './utils';

interface ProviderConfigPanelProps {
  provider: ProviderConfig;
  providersConfig: ProvidersConfig;
}

export function ProviderConfigPanel({ provider, providersConfig }: ProviderConfigPanelProps) {
  const model = providersConfig[provider.id]?.models[0];
  const isServerConfigured = providersConfig[provider.id]?.isServerConfigured;

  return (
    <div className="max-w-3xl space-y-6">
      {!isServerConfigured && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300">
          此功能暂时不可用，请稍后再试。
        </div>
      )}

      <div className="space-y-3">
        <Label className="text-base">模型</Label>
        <div className="flex w-full items-center justify-between rounded-lg border border-primary/60 bg-primary/5 p-3 text-left">
          <div className="flex min-w-0 flex-1 items-start gap-2.5">
            {provider.icon ? (
              <img src={provider.icon} alt="" className="mt-0.5 h-5 w-5 shrink-0 rounded" />
            ) : (
              <Bot className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 text-sm font-medium">自动</div>
              {model && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-mono text-[11px]">{model.name}</span>
                  <span className="flex items-center gap-1">
                    {model.capabilities?.vision && (
                      <span title="视觉">
                        <Sparkles className="h-3 w-3" />
                      </span>
                    )}
                    {model.capabilities?.tools && (
                      <span title="工具">
                        <Wrench className="h-3 w-3" />
                      </span>
                    )}
                    {model.capabilities?.streaming && (
                      <span title="流式">
                        <Zap className="h-3 w-3" />
                      </span>
                    )}
                  </span>
                  {model.contextWindow && (
                    <span className="flex items-center gap-0.5">
                      <FileText className="h-3 w-3" />
                      <span className="text-[10px]">
                        {formatContextWindow(model.contextWindow)}
                      </span>
                    </span>
                  )}
                  {model.outputWindow && (
                    <span className="flex items-center gap-0.5">
                      <Send className="h-3 w-3" />
                      <span className="text-[10px]">
                        {formatContextWindow(model.outputWindow)}
                      </span>
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          <Check className="ml-3 h-4 w-4 shrink-0 text-primary" />
        </div>
      </div>
    </div>
  );
}
