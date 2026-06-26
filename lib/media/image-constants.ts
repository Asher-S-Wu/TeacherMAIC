import type {
  ImageProviderId,
  ImageProviderConfig,
} from './types';
import {
  ARK_BASE_URL,
  DOUBAO_SEEDREAM_5_MODEL_ID,
  DOUBAO_SEEDREAM_5_MODEL_NAME,
} from '@/lib/ai/ark-models';

const SEEDREAM_5_2K_DIMENSIONS: Record<string, { width: number; height: number }> = {
  '1:1': { width: 2048, height: 2048 },
  '4:3': { width: 2304, height: 1728 },
  '3:4': { width: 1728, height: 2304 },
  '16:9': { width: 2848, height: 1600 },
  '9:16': { width: 1600, height: 2848 },
};

export const IMAGE_PROVIDERS: Record<ImageProviderId, ImageProviderConfig> = {
  'volcengine-ark-image': {
    id: 'volcengine-ark-image',
    name: '火山方舟图片生成',
    requiresApiKey: true,
    defaultBaseUrl: ARK_BASE_URL,
    models: [{ id: DOUBAO_SEEDREAM_5_MODEL_ID, name: DOUBAO_SEEDREAM_5_MODEL_NAME }],
    supportedAspectRatios: ['16:9', '4:3', '1:1', '9:16', '3:4'],
  },
};

export function aspectRatioToDimensions(
  ratio: string,
): { width: number; height: number } {
  return SEEDREAM_5_2K_DIMENSIONS[ratio] ?? SEEDREAM_5_2K_DIMENSIONS['16:9'];
}
