import type {
  VideoProviderId,
  VideoGenerationOptions,
  VideoProviderConfig,
} from './types';
import {
  ARK_BASE_URL,
  DOUBAO_SEEDANCE_2_MODEL_ID,
  DOUBAO_SEEDANCE_2_MODEL_NAME,
} from '@/lib/ai/ark-models';

export const VIDEO_PROVIDERS: Record<VideoProviderId, VideoProviderConfig> = {
  'volcengine-ark-video': {
    id: 'volcengine-ark-video',
    name: '火山方舟视频生成',
    requiresApiKey: true,
    defaultBaseUrl: ARK_BASE_URL,
    models: [{ id: DOUBAO_SEEDANCE_2_MODEL_ID, name: DOUBAO_SEEDANCE_2_MODEL_NAME }],
    supportedAspectRatios: ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9'],
    supportedDurations: [-1, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    supportedResolutions: ['480p', '720p', '1080p', '4k'],
    maxVideoDuration: 15,
  },
};

export function normalizeVideoOptions(
  providerId: VideoProviderId,
  options: VideoGenerationOptions,
): VideoGenerationOptions {
  const provider = VIDEO_PROVIDERS[providerId];
  if (!provider) return options;

  const normalized = { ...options };

  if (provider.supportedDurations && provider.supportedDurations.length > 0) {
    if (!normalized.duration) {
      normalized.duration = 5;
    } else if (!provider.supportedDurations.includes(normalized.duration)) {
      throw new Error(`视频生成不支持该视频时长：${normalized.duration}`);
    }
  }

  if (provider.supportedAspectRatios && provider.supportedAspectRatios.length > 0) {
    if (!normalized.aspectRatio) {
      normalized.aspectRatio = provider
        .supportedAspectRatios[0] as VideoGenerationOptions['aspectRatio'];
    } else if (!provider.supportedAspectRatios.includes(normalized.aspectRatio)) {
      throw new Error(`视频生成不支持该视频比例：${normalized.aspectRatio}`);
    }
  }

  if (provider.supportedResolutions && provider.supportedResolutions.length > 0) {
    if (!normalized.resolution) {
      normalized.resolution = '720p';
    } else if (!provider.supportedResolutions.includes(normalized.resolution)) {
      throw new Error(`视频生成不支持该视频清晰度：${normalized.resolution}`);
    }
  }

  return normalized;
}
