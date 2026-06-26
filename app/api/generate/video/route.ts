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
import { generateVideo } from '@/lib/media/video-providers';
import { normalizeVideoOptions } from '@/lib/media/video-constants';
import { resolveVideoApiKey, resolveVideoBaseUrl } from '@/lib/server/provider-config';
import type { VideoProviderId, VideoGenerationOptions } from '@/lib/media/types';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { requireCurrentUser } from '@/lib/server/auth';
import { saveBufferForUser, saveRemoteFileForUser } from '@/lib/server/file-storage';
import { DOUBAO_SEEDANCE_2_MODEL_ID } from '@/lib/ai/ark-models';

const log = createLogger('VideoGeneration API');
const ARK_VIDEO_PROVIDER_ID: VideoProviderId = 'volcengine-ark-video';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as VideoGenerationOptions;
    const user = await requireCurrentUser();

    if (!body.prompt) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing prompt');
    }

    const providerId = ARK_VIDEO_PROVIDER_ID;

    const apiKey = resolveVideoApiKey(providerId);
    const baseUrl = resolveVideoBaseUrl(providerId);
    if (!apiKey) {
      return apiError(
        'MISSING_API_KEY',
        401,
        '视频生成暂时不可用，请稍后再试。',
      );
    }

    const options = normalizeVideoOptions(providerId, body);

    log.info(
      `Generating video: provider=${providerId}, model=${DOUBAO_SEEDANCE_2_MODEL_ID}, ` +
        `prompt="${body.prompt.slice(0, 80)}...", duration=${options.duration ?? 'auto'}, ` +
        `aspect=${options.aspectRatio ?? 'auto'}, resolution=${options.resolution ?? 'auto'}`,
    );

    const result = await generateVideo(
      { providerId, apiKey, baseUrl, model: DOUBAO_SEEDANCE_2_MODEL_ID },
      options,
    );

    log.info(
      `Video generated: url=${result.url ? 'yes' : 'no'}, base64=${result.base64 ? 'yes' : 'no'}, ${result.width}x${result.height}, ${result.duration}s`,
    );

    const file = result.base64
      ? await saveBufferForUser(
          user._id,
          Buffer.from(result.base64, 'base64'),
          `generated-video-${Date.now()}.mp4`,
          'video/mp4',
          'video',
          { mediaType: 'video' },
        )
      : result.url
        ? await saveRemoteFileForUser(
            user._id,
            result.url,
            `generated-video-${Date.now()}.mp4`,
            'video/mp4',
            'video',
            { mediaType: 'video' },
          )
        : null;

    if (!file) {
      return apiError('GENERATION_FAILED', 500, '视频生成没有返回文件。');
    }
    const posterFile = result.poster
      ? await saveRemoteFileForUser(
          user._id,
          result.poster,
          `generated-video-poster-${Date.now()}.png`,
          'image/png',
          'poster',
          { mediaType: 'poster' },
        )
      : undefined;

    return apiSuccess({
      result: {
        ...result,
        url: file.url,
        poster: posterFile?.url,
        file,
        posterFile,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('SensitiveContent') || message.includes('sensitive information')) {
      log.warn(`Video blocked by content safety filter: ${message}`);
      return apiError('CONTENT_SENSITIVE', 400, '抱歉，该内容触发了安全检查。');
    }
    log.error(
      `Video generation failed [provider=volcengine-ark-video, model=${DOUBAO_SEEDANCE_2_MODEL_ID}]:`,
      error,
    );
    return apiError('INTERNAL_ERROR', 500, '视频生成失败，请稍后再试。');
  }
}
