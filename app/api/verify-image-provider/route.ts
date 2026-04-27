/**
 * Verify Image Provider API
 *
 * Lightweight endpoint that validates provider credentials without generating images.
 *
 * POST /api/verify-image-provider
 *
 * Headers:
 *   x-image-provider: ImageProviderId
 *   x-api-key: string (optional, server fallback)
 *
 * Response: { success: boolean, message: string }
 */

import { NextRequest } from 'next/server';
import { testImageConnectivity } from '@/lib/media/image-providers';
import { resolveImageApiKey } from '@/lib/server/provider-config';
import type { ImageProviderId } from '@/lib/media/types';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';

const log = createLogger('VerifyImageProvider');

export async function POST(request: NextRequest) {
  try {
    const requestedProviderId = request.headers.get('x-image-provider') || 'qwen-image';
    if (requestedProviderId !== 'qwen-image') {
      return apiError('INVALID_REQUEST', 400, 'Only qwen-image is supported');
    }
    const providerId: ImageProviderId = 'qwen-image';
    const model = 'qwen-image-2.0-pro';
    const clientApiKey = request.headers.get('x-api-key') || undefined;

    const apiKey = resolveImageApiKey(providerId, clientApiKey);

    if (!apiKey) {
      return apiError('MISSING_API_KEY', 400, 'No API key configured');
    }

    const result = await testImageConnectivity({
      providerId,
      apiKey,
      model,
    });

    if (!result.success) {
      return apiError('UPSTREAM_ERROR', 500, result.message);
    }

    return apiSuccess({ message: result.message });
  } catch (err) {
    log.error(
      `Image provider verification failed [provider=${request.headers.get('x-image-provider') ?? 'qwen-image'}]:`,
      err,
    );
    return apiError('INTERNAL_ERROR', 500, `Connectivity test error: ${err}`);
  }
}
