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
      return apiError('MISSING_REQUIRED_FIELD', 400, 'PDF 解析暂时不可用，请稍后再试。');
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
        'PDF 解析服务连接失败，请稍后再试。',
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
        errorMessage = 'PDF 解析服务连接失败，请稍后再试。';
      } else if (error.message.includes('ENOTFOUND')) {
        errorMessage = 'PDF 解析服务连接失败，请稍后再试。';
      } else if (error.message.includes('timeout') || error.name === 'TimeoutError') {
        errorMessage = '连接超时，请稍后再试。';
      } else {
        errorMessage = '连接失败，请稍后再试。';
      }
    }

    return apiError('INTERNAL_ERROR', 500, errorMessage);
  }
}
