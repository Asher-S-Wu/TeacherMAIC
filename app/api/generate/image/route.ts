/**
 * Image Generation API
 *
 * Generates an image from a text prompt using the server-configured provider.
 * Called by the client during media generation after slides are produced.
 *
 * POST /api/generate/image
 *
 * Body: { prompt, negativePrompt?, width?, height?, aspectRatio?, style? }
 * Response: { success: boolean, result?: ImageGenerationResult, error?: string }
 */

import { NextRequest } from 'next/server';
import { generateImage, aspectRatioToDimensions } from '@/lib/media/image-providers';
import { resolveImageApiKey } from '@/lib/server/provider-config';
import type { ImageProviderId, ImageGenerationOptions } from '@/lib/media/types';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { requireCurrentUser } from '@/lib/server/auth';
import { saveBufferForUser, saveRemoteFileForUser } from '@/lib/server/file-storage';
import { MINIMAX_IMAGE_MODEL_ID } from '@/lib/ai/minimax-models';

const log = createLogger('ImageGeneration API');

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ImageGenerationOptions;
    const user = await requireCurrentUser();

    if (!body.prompt) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing prompt');
    }

    const providerId: ImageProviderId = 'minimax-image';
    const model = MINIMAX_IMAGE_MODEL_ID;

    const apiKey = resolveImageApiKey(providerId);
    if (!apiKey) {
      return apiError(
        'MISSING_API_KEY',
        401,
        '图片生成暂时不可用，请稍后再试。',
      );
    }

    // Resolve dimensions from aspect ratio if not explicitly set
    if (!body.width && !body.height && body.aspectRatio) {
      const dims = aspectRatioToDimensions(body.aspectRatio);
      body.width = dims.width;
      body.height = dims.height;
    }

    log.info(
      `Generating image: provider=${providerId}, model=${model}, ` +
        `prompt="${body.prompt.slice(0, 80)}...", size=${body.width ?? 'auto'}x${body.height ?? 'auto'}`,
    );

    const result = await generateImage({ providerId, apiKey, model }, body);

    const filename = `generated-image-${Date.now()}.png`;
    const file = result.base64
      ? await saveBufferForUser(
          user._id,
          Buffer.from(result.base64, 'base64'),
          filename,
          'image/png',
          'media',
          { mediaType: 'image' },
        )
      : result.url
        ? await saveRemoteFileForUser(user._id, result.url, filename, 'image/png', 'media', {
            mediaType: 'image',
          })
        : null;

    if (!file) {
      return apiError('GENERATION_FAILED', 500, '图片生成没有返回文件。');
    }

    return apiSuccess({ result: { ...result, base64: undefined, url: file.url, file } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('SensitiveContent') || message.includes('sensitive information')) {
      log.warn(`Image blocked by content safety filter: ${message}`);
      return apiError('CONTENT_SENSITIVE', 400, '抱歉，该内容触发了安全检查。');
    }
    log.error(
      `Image generation failed [provider=minimax-image, model=${MINIMAX_IMAGE_MODEL_ID}]:`,
      error,
    );
    return apiError('INTERNAL_ERROR', 500, '图片生成失败，请稍后再试。');
  }
}
