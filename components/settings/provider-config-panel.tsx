'use client';

import { Label } from '@/components/ui/label';
import { Check, Zap, Sparkles, Wrench, FileText, Send } from 'lucide-react';
import type { ProviderConfig, ProviderId } from '@/lib/ai/providers';
import type { ProvidersConfig } from '@/lib/types/settings';
import { formatContextWindow } from './utils';
import { cn } from '@/lib/utils';

interface ProviderConfigPanelProps {
  provider: ProviderConfig;
  providersConfig: ProvidersConfig;
  selectedProviderId: ProviderId;
  selectedModelId: string;
  onModelSelect: (providerId: ProviderId, modelId: string) => void;
}

export function ProviderConfigPanel({
  provider,
  providersConfig,
  selectedProviderId,
  selectedModelId,
  onModelSelect,
}: ProviderConfigPanelProps) {
  const models = providersConfig[provider.id]?.models || [];
  const isServerConfigured = providersConfig[provider.id]?.isServerConfigured;

  return (
    <div className="space-y-6 max-w-3xl">
      {!isServerConfigured && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-3 text-sm text-blue-700 dark:text-blue-300">
          此功能暂时不可用，请稍后再试。
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Label className="text-base">模型</Label>
        </div>
        <div className="space-y-1.5">
          {models.map((model) => {
            const selected = selectedProviderId === provider.id && selectedModelId === model.id;
            return (
              <button
                key={model.id}
                type="button"
                onClick={() => onModelSelect(provider.id, model.id)}
                className={cn(
                  'flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors',
                  selected
                    ? 'border-primary/60 bg-primary/5'
                    : 'border-border/50 bg-card hover:bg-muted/50',
                )}
              >
                <div className="flex min-w-0 flex-1 items-start gap-2.5">
                  {provider.icon && (
                    <img src={provider.icon} alt="" className="mt-0.5 h-5 w-5 shrink-0 rounded" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-sm font-medium mb-1.5">{model.name}</div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        {model.capabilities?.vision && (
                          <div title="视觉">
                            <Sparkles className="h-3 w-3" />
                          </div>
                        )}
                        {model.capabilities?.tools && (
                          <div title="工具">
                            <Wrench className="h-3 w-3" />
                          </div>
                        )}
                        {model.capabilities?.streaming && (
                          <div title="流式">
                            <Zap className="h-3 w-3" />
                          </div>
                        )}
                      </div>
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
                  </div>
                </div>
                {selected && <Check className="ml-3 h-4 w-4 shrink-0 text-primary" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
