'use client';

import { Box } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProviderId, ProviderConfig } from '@/lib/ai/providers';
import { MONO_LOGO_PROVIDERS } from '@/lib/ai/providers';

interface ProviderWithServerInfo extends ProviderConfig {
  isServerConfigured?: boolean;
}

interface ProviderListProps {
  providers: ProviderWithServerInfo[];
  selectedProviderId: ProviderId;
  onSelect: (providerId: ProviderId) => void;
  width?: number;
}

export function ProviderList({
  providers,
  selectedProviderId,
  onSelect,
  width,
}: ProviderListProps) {
  return (
    <div className="flex-shrink-0 bg-background flex flex-col" style={{ width: width ?? 192 }}>
      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        {providers.map((provider) => (
          <button
            key={provider.id}
            onClick={() => onSelect(provider.id)}
            className={cn(
              'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-all border text-left',
              selectedProviderId === provider.id
                ? 'bg-primary/5 border-primary/50 shadow-sm'
                : 'border-transparent hover:bg-muted/50',
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
              <Box className="h-5 w-5 text-muted-foreground" />
            )}
            <span className="font-medium text-sm flex-1 truncate">{provider.name}</span>
            {provider.isServerConfigured && (
              <span className="text-[10px] px-1 py-0 h-4 leading-4 rounded shrink-0 bg-muted text-muted-foreground">
                可用
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
