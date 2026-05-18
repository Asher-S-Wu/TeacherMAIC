'use client';

import { useSettingsStore } from '@/lib/store/settings';
import { WEB_SEARCH_PROVIDERS } from '@/lib/web-search/constants';
import type { WebSearchProviderId } from '@/lib/web-search/types';

interface WebSearchSettingsProps {
  selectedProviderId: WebSearchProviderId;
}

export function WebSearchSettings({ selectedProviderId }: WebSearchSettingsProps) {
  const webSearchProvidersConfig = useSettingsStore((state) => state.webSearchProvidersConfig);

  const provider = WEB_SEARCH_PROVIDERS[selectedProviderId];
  const isServerConfigured = !!webSearchProvidersConfig[selectedProviderId]?.isServerConfigured;
  const showMissingNotice = !isServerConfigured && provider.requiresApiKey;

  return (
    <div className="space-y-6 max-w-3xl">
      {showMissingNotice && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-3 text-sm text-blue-700 dark:text-blue-300">
          此功能暂时不可用，请稍后再试。
        </div>
      )}
    </div>
  );
}
