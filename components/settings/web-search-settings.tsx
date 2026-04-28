'use client';

import { Label } from '@/components/ui/label';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useSettingsStore } from '@/lib/store/settings';
import { WEB_SEARCH_PROVIDERS } from '@/lib/web-search/constants';
import type { WebSearchProviderId } from '@/lib/web-search/types';

interface WebSearchSettingsProps {
  selectedProviderId: WebSearchProviderId;
}

export function WebSearchSettings({ selectedProviderId }: WebSearchSettingsProps) {
  const { t } = useI18n();

  const webSearchProvidersConfig = useSettingsStore((state) => state.webSearchProvidersConfig);

  const provider = WEB_SEARCH_PROVIDERS[selectedProviderId];
  const isServerConfigured = !!webSearchProvidersConfig[selectedProviderId]?.isServerConfigured;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-3 text-sm text-blue-700 dark:text-blue-300">
        {isServerConfigured || !provider.requiresApiKey
          ? t('settings.serverConfiguredNotice')
          : t('settings.serverConfigMissingNotice')}
      </div>

      <div className="space-y-2">
        <Label className="text-sm">{t('settings.providerStatus')}</Label>
        <p className="text-sm text-muted-foreground">
          {isServerConfigured ? t('settings.serverManagedDesc') : t('settings.serverConfigMissingDesc')}
        </p>
      </div>
    </div>
  );
}
