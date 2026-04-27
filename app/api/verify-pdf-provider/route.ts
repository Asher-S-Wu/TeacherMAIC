import { NextRequest } from 'next/server';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { resolvePDFApiKey, resolvePDFBaseUrl } from '@/lib/server/provider-config';
import { validateUrlForSSRF } from '@/lib/server/ssrf-guard';
import { MINERU_CLOUD_DEFAULT_BASE } from '@/lib/pdf/constants';

const log = createLogger('Verify PDF Provider');

export async function POST(req: NextRequest) {
  let providerId: string | undefined;
  try {
    const body = await req.json();
    providerId = body.providerId;
    const { apiKey, baseUrl } = body;

    if (!providerId) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Provider ID is required');
    }

    if (providerId !== 'mineru-cloud') {
      return apiError('INVALID_REQUEST', 400, 'Unsupported PDF provider verification');
    }

    const resolvedApiKey = resolvePDFApiKey(providerId, apiKey);
    if (!resolvedApiKey) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'API Key is required for MinerU Cloud');
    }

    const clientCloudBase = (baseUrl as string | undefined) || undefined;
    if (clientCloudBase && process.env.NODE_ENV === 'production') {
      const ssrfError = await validateUrlForSSRF(clientCloudBase);
      if (ssrfError) {
        return apiError('INVALID_URL', 403, ssrfError);
      }
    }

    const cloudBase = (
      clientCloudBase ||
      resolvePDFBaseUrl(providerId) ||
      MINERU_CLOUD_DEFAULT_BASE
    ).replace(/\/+$/, '');

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
    log.error(`PDF provider verification failed [provider=${providerId ?? 'unknown'}]:`, error);

    let errorMessage = 'Connection failed';
    if (error instanceof Error) {
      if (error.message.includes('ECONNREFUSED')) {
        errorMessage = 'Cannot connect to server, please check the Base URL';
      } else if (error.message.includes('ENOTFOUND')) {
        errorMessage = 'Server not found, please check the Base URL';
      } else if (error.message.includes('timeout') || error.name === 'TimeoutError') {
        errorMessage = 'Connection timed out';
      } else {
        errorMessage = error.message;
      }
    }

    return apiError('INTERNAL_ERROR', 500, errorMessage);
  }
}
