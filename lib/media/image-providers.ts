import type {
  ImageProviderId,
  ImageGenerationConfig,
  ImageGenerationOptions,
  ImageGenerationResult,
  ImageProviderConfig,
} from './types';
import { ARK_IMAGE_MODEL_ID, ARK_IMAGE_MODEL_NAME, ARK_BASE_URL } from '@/lib/ai/ark-models';
import { generateWithArkImage } from './adapters/ark-image-adapter';

export const IMAGE_PROVIDERS: Record<ImageProviderId, ImageProviderConfig> = {
  'ark-image': {
    id: 'ark-image',
    name: '火山方舟图片生成',
    requiresApiKey: true,
    defaultBaseUrl: ARK_BASE_URL,
    models: [{ id: ARK_IMAGE_MODEL_ID, name: ARK_IMAGE_MODEL_NAME }],
    supportedAspectRatios: ['16:9', '4:3', '1:1', '9:16', '3:4'],
  },
};

export async function generateImage(
  config: ImageGenerationConfig,
  options: ImageGenerationOptions,
): Promise<ImageGenerationResult> {
  return generateWithArkImage(config, options);
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
