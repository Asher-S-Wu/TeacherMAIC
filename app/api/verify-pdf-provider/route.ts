import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { resolvePDFApiKey } from '@/lib/server/provider-config';
import { MINERU_CLOUD_DEFAULT_BASE } from '@/lib/pdf/constants';

const log = createLogger('Verify PDF Provider');

export async function POST() {
  const providerId = 'mineru-cloud';
  try {
    const resolvedApiKey = resolvePDFApiKey(providerId);
    if (!resolvedApiKey) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'API Key is required for MinerU Cloud');
    }

    const cloudBase = MINERU_CLOUD_DEFAULT_BASE.replace(/\/+$/, '');

    const response = await fetch(`${cloudBase}/extract-results/batch/test-connection`, {
      headers: {
        Authorization: `Bearer ${resolvedApiKey}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (response.status === 401 || response.status === 403) {
      const text = await response.text().catch(() => '');
      return apiError(
        'INTERNAL_ERROR',
        500,
        `Authentication failed: ${text || response.statusText}`,
      );
    }

    return apiSuccess({
      message: 'Connection successful',
      status: response.status,
    });
  } catch (error) {
    log.error(`PDF provider verification failed [provider=${providerId}]:`, error);

    let errorMessage = 'Connection failed';
    if (error instanceof Error) {
      if (error.message.includes('ECONNREFUSED')) {
        errorMessage = 'Cannot connect to MinerU Cloud';
      } else if (error.message.includes('ENOTFOUND')) {
        errorMessage = 'MinerU Cloud server not found';
      } else if (error.message.includes('timeout') || error.name === 'TimeoutError') {
        errorMessage = 'Connection timed out';
      } else {
        errorMessage = error.message;
      }
    }

    return apiError('INTERNAL_ERROR', 500, errorMessage);
  }
}
