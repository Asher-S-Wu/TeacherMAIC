/**
 * PDF Provider Constants
 * Separated from pdf-providers.ts to keep client components free of server parser imports
 */

import type { PDFProviderId, PDFProviderConfig } from './types';

export const MINERU_CLOUD_DEFAULT_BASE = 'https://mineru.net/api/v4';

/**
 * PDF Provider Registry
 */
export const PDF_PROVIDERS: Record<PDFProviderId, PDFProviderConfig> = {
  'mineru-cloud': {
    id: 'mineru-cloud',
    name: 'MinerU (Cloud)',
    requiresApiKey: true,
    icon: '/logos/mineru.png',
    features: ['text', 'images', 'tables', 'formulas', 'layout-analysis'],
  },
};
