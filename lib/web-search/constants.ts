/**
 * Web Search Provider Constants
 */

import type { WebSearchProviderId, WebSearchProviderConfig } from './types';

/**
 * Web Search Provider Registry
 */
export const WEB_SEARCH_PROVIDERS: Record<WebSearchProviderId, WebSearchProviderConfig> = {
  tavily: {
    id: 'tavily',
    name: '智能联网检索',
    requiresApiKey: true,
    defaultBaseUrl: 'https://api.tavily.com/search',
  },
};
