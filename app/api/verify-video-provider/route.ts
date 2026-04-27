/**
 * Verify Video Provider API
 *
 * Lightweight endpoint that validates provider credentials without generating video.
 *
 * POST /api/verify-video-provider
 *
 * Headers:
 *   x-video-provider: VideoProviderId
 *   x-api-key: string (optional, server fallback)
 *
 * Response: { success: boolean, message: string }
 */

import { NextRequest } from 'next/server';
import { testVideoConnectivity } from '@/lib/media/video-providers';
import { resolveVideoApiKey } from '@/lib/server/provider-config';
import type { VideoProviderId } from '@/lib/media/types';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';

const log = createLogger('VerifyVideoProvider');
const QWEN_VIDEO_PROVIDER_ID: VideoProviderId = 'qwen-video';
const QWEN_VIDEO_MODEL_ID = 'happyhorse-1.0-t2v';

export async function POST(request: NextRequest) {
  try {
    const requestedProviderId = request.headers.get('x-video-provider') || QWEN_VIDEO_PROVIDER_ID;
    if (requestedProviderId !== QWEN_VIDEO_PROVIDER_ID) {
      return apiError('INVALID_REQUEST', 400, 'Only qwen-video is supported');
    }
    const providerId = QWEN_VIDEO_PROVIDER_ID;
    const requestedModel = request.headers.get('x-video-model') || QWEN_VIDEO_MODEL_ID;
    const clientApiKey = request.headers.get('x-api-key') || undefined;

    if (requestedModel !== QWEN_VIDEO_MODEL_ID) {
      return apiError('INVALID_REQUEST', 400, 'Only happyhorse-1.0-t2v is supported');
    }

    const apiKey = resolveVideoApiKey(providerId, clientApiKey);

    if (!apiKey) {
      return apiError('MISSING_API_KEY', 400, 'No API key configured');
    }

    const result = await testVideoConnectivity({
      providerId,
      apiKey,
      model: QWEN_VIDEO_MODEL_ID,
    });

    if (!result.success) {
      return apiError('UPSTREAM_ERROR', 500, result.message);
    }

    return apiSuccess({ message: result.message });
  } catch (err) {
    log.error(
      `Video provider verification failed [provider=${request.headers.get('x-video-provider') ?? 'qwen-video'}]:`,
      err,
    );
    return apiError('INTERNAL_ERROR', 500, `Connectivity test error: ${err}`);
  }
}
