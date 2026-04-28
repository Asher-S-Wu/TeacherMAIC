/**
 * Video Generation API
 *
 * Generates a video from a text prompt using the server-configured provider.
 *
 * POST /api/generate/video
 *
 * Body: { prompt, duration?, aspectRatio?, resolution? }
 * Response: { success: boolean, result?: VideoGenerationResult, error?: string }
 */

import { NextRequest } from 'next/server';
import { generateVideo, normalizeVideoOptions } from '@/lib/media/video-providers';
import { resolveVideoApiKey } from '@/lib/server/provider-config';
import type { VideoProviderId, VideoGenerationOptions } from '@/lib/media/types';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';

const log = createLogger('VideoGeneration API');
const QWEN_VIDEO_PROVIDER_ID: VideoProviderId = 'qwen-video';
const QWEN_VIDEO_MODEL_ID = 'happyhorse-1.0-t2v';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as VideoGenerationOptions;

    if (!body.prompt) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing prompt');
    }

    const providerId = QWEN_VIDEO_PROVIDER_ID;

    const apiKey = resolveVideoApiKey(providerId);
    if (!apiKey) {
      return apiError(
        'MISSING_API_KEY',
        401,
        `No API key configured for video provider: ${providerId}`,
      );
    }

    const options = normalizeVideoOptions(providerId, body);

    log.info(
      `Generating video: provider=${providerId}, model=${QWEN_VIDEO_MODEL_ID}, ` +
        `prompt="${body.prompt.slice(0, 80)}...", duration=${options.duration ?? 'auto'}, ` +
        `aspect=${options.aspectRatio ?? 'auto'}, resolution=${options.resolution ?? 'auto'}`,
    );

    const result = await generateVideo(
      { providerId, apiKey, model: QWEN_VIDEO_MODEL_ID },
      options,
    );

    log.info(
      `Video generated: url=${result.url ? 'yes' : 'no'}, ${result.width}x${result.height}, ${result.duration}s`,
    );

    return apiSuccess({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('SensitiveContent') || message.includes('sensitive information')) {
      log.warn(`Video blocked by content safety filter: ${message}`);
      return apiError('CONTENT_SENSITIVE', 400, message);
    }
    log.error(
      `Video generation failed [provider=qwen-video, model=${QWEN_VIDEO_MODEL_ID}]:`,
      error,
    );
    return apiError('INTERNAL_ERROR', 500, message);
  }
}
