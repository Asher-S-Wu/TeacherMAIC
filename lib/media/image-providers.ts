import type {
  ImageProviderId,
  ImageGenerationConfig,
  ImageGenerationOptions,
  ImageGenerationResult,
  ImageProviderConfig,
} from './types';
import {
  BAILIAN_DASHSCOPE_API_BASE_URL_TEMPLATE,
  BAILIAN_IMAGE_MODEL_ID,
  BAILIAN_IMAGE_MODEL_NAME,
} from '@/lib/ai/bailian-models';
import { generateWithBailianImage } from './adapters/bailian-image-adapter';

export const IMAGE_PROVIDERS: Record<ImageProviderId, ImageProviderConfig> = {
  'bailian-image': {
    id: 'bailian-image',
    name: '百炼图片生成',
    requiresApiKey: true,
    defaultBaseUrl: BAILIAN_DASHSCOPE_API_BASE_URL_TEMPLATE,
    models: [{ id: BAILIAN_IMAGE_MODEL_ID, name: BAILIAN_IMAGE_MODEL_NAME }],
    supportedAspectRatios: ['16:9', '4:3', '1:1', '9:16', '3:4'],
  },
};

export async function generateImage(
  config: ImageGenerationConfig,
  options: ImageGenerationOptions,
): Promise<ImageGenerationResult> {
  return generateWithBailianImage(config, options);
}

export function aspectRatioToDimensions(
  ratio: string,
  maxSide = 2048,
): { width: number; height: number } {
  const [w, h] = ratio.split(':').map(Number);
  if (!w || !h) return { width: maxSide, height: Math.round((maxSide * 9) / 16) };
  if (w >= h) return { width: maxSide, height: Math.round((maxSide * h) / w) };
  return { width: Math.round((maxSide * w) / h), height: maxSide };
}
