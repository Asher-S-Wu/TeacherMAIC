import type {
  ImageProviderId,
  ImageProviderConfig,
} from './types';
import {
  ZENMUX_BASE_URL,
  GPT_IMAGE_2_MODEL_ID,
  GPT_IMAGE_2_MODEL_NAME,
} from '@/lib/ai/zenmux-models';

export const IMAGE_PROVIDERS: Record<ImageProviderId, ImageProviderConfig> = {
  'zenmux-image': {
    id: 'zenmux-image',
    name: 'ZenMux 图片生成',
    requiresApiKey: true,
    defaultBaseUrl: ZENMUX_BASE_URL,
    models: [{ id: GPT_IMAGE_2_MODEL_ID, name: GPT_IMAGE_2_MODEL_NAME }],
    supportedAspectRatios: ['16:9', '4:3', '1:1', '9:16', '3:4'],
  },
};

export function aspectRatioToDimensions(
  ratio: string,
  maxSide = 2048,
): { width: number; height: number } {
  const [w, h] = ratio.split(':').map(Number);
  if (!w || !h) return { width: maxSide, height: Math.round((maxSide * 9) / 16) };
  if (w >= h) return { width: maxSide, height: Math.round((maxSide * h) / w) };
  return { width: Math.round((maxSide * w) / h), height: maxSide };
}
