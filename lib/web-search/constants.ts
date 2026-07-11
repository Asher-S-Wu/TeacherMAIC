/**
 * Web Search Provider Constants
 */

import type { WebSearchProviderId, WebSearchProviderConfig } from './types';

/**
 * Web Search Provider Registry
 */
export const WEB_SEARCH_PROVIDERS: Record<WebSearchProviderId, WebSearchProviderConfig> = {
  firecrawl: {
    id: 'firecrawl',
    name: 'Firecrawl 联网检索',
    requiresApiKey: true,
    defaultBaseUrl: 'https://api.firecrawl.dev/v2/search',
  },
};
