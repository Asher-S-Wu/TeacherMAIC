'use client';

import { useState, useMemo, Fragment } from 'react';
import { Bot, Check, ChevronRight } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useSettingsStore } from '@/lib/store/settings';
import { MONO_LOGO_PROVIDERS, type ProviderId } from '@/lib/ai/providers';

interface ModelSelectorPopoverProps {
  children: React.ReactNode;
}

export function ModelSelectorPopover({ children }: ModelSelectorPopoverProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [selectedProviderId, setSelectedProviderId] = useState<ProviderId | null>(null);

  const currentProviderId = useSettingsStore((s) => s.providerId);
  const currentModelId = useSettingsStore((s) => s.modelId);
  const providersConfig = useSettingsStore((s) => s.providersConfig);
  const setModel = useSettingsStore((s) => s.setModel);

  const allProviders = useMemo(() => {
    return Object.entries(providersConfig).map(([id, config]) => ({
      id: id as ProviderId,
      name: config.name,
      icon: config.icon,
      requiresApiKey: config.requiresApiKey,
      isServerConfigured: config.isServerConfigured,
      models: config.models,
    }));
  }, [providersConfig]);

  const currentProvider = providersConfig[currentProviderId];
  const currentModel = currentProvider?.models.find((m) => m.id === currentModelId);

  const handleProviderClick = (providerId: ProviderId) => {
    setSelectedProviderId(providerId);
  };

  const handleModelSelect = (providerId: ProviderId, modelId: string) => {
    setModel(providerId, modelId);
    setOpen(false);
    setSelectedProviderId(null);
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setSelectedProviderId(null);
    }
  };

  const isProviderAvailable = (provider: { requiresApiKey?: boolean; isServerConfigured?: boolean }) => {
    return !provider.requiresApiKey || !!provider.isServerConfigured;
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" side="top" avoidCollisions={false} className="w-72 p-0">
        {selectedProviderId ? (
          // Model list view
          <div className="max-h-[300px] overflow-y-auto">
            <div className="p-2 border-b border-border/40">
              <button
                onClick={() => setSelectedProviderId(null)}
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronRight className="size-3 rotate-180" />
                {t('settings.backToProviders')}
              </button>
            </div>
            <div className="p-1.5">
              {providersConfig[selectedProviderId]?.models.map((model) => {
                const isSelected =
                  selectedProviderId === currentProviderId && model.id === currentModelId;
                return (
                  <button
                    key={model.id}
                    onClick={() => handleModelSelect(selectedProviderId, model.id)}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all text-left',
                      isSelected
                        ? 'bg-primary/10 text-primary'
                        : 'hover:bg-muted/50 text-foreground',
                    )}
                  >
                    <span className="text-sm flex-1 truncate">{model.name}</span>
                    {isSelected && <Check className="size-4 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          // Provider list view
          <div className="max-h-[300px] overflow-y-auto">
            <div className="p-1.5">
              {allProviders.map((provider) => {
                const available = isProviderAvailable(provider);
                const isCurrentProvider = provider.id === currentProviderId;
                return (
                  <Fragment key={provider.id}>
                    <button
                      onClick={() => {
                        if (available) {
                          handleProviderClick(provider.id);
                        }
                      }}
                      disabled={!available}
                      className={cn(
                        'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-all text-left',
                        !available && 'opacity-50 cursor-not-allowed',
                        available && !isCurrentProvider && 'hover:bg-muted/50',
                        isCurrentProvider && 'bg-primary/5',
                      )}
                    >
                      {provider.icon ? (
                        <img
                          src={provider.icon}
                          alt={provider.name}
                          className={cn(
                            'w-5 h-5 rounded',
                            MONO_LOGO_PROVIDERS.has(provider.id) && 'dark:invert',
                          )}
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <Bot className="h-5 w-5 text-muted-foreground" />
                      )}
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium truncate block">{provider.name}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {provider.models.length} {t('settings.models')}
                        </span>
                      </div>
                      {isCurrentProvider && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary shrink-0">
                          {t('settings.current')}
                        </span>
                      )}
                      {available && <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />}
                    </button>
                  </Fragment>
                );
              })}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}