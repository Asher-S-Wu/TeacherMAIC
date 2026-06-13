import type {
  VideoProviderId,
  VideoGenerationConfig,
  VideoGenerationOptions,
  VideoGenerationResult,
  VideoProviderConfig,
} from './types';
import {
  ZENMUX_VERTEX_BASE_URL,
  DOUBAO_SEEDANCE_2_MODEL_ID,
  DOUBAO_SEEDANCE_2_MODEL_NAME,
} from '@/lib/ai/zenmux-models';
import { generateWithZenMuxVideo } from './adapters/zenmux-video-adapter';

export const VIDEO_PROVIDERS: Record<VideoProviderId, VideoProviderConfig> = {
  'zenmux-video': {
    id: 'zenmux-video',
    name: 'ZenMux 视频生成',
    requiresApiKey: true,
    defaultBaseUrl: ZENMUX_VERTEX_BASE_URL,
    models: [{ id: DOUBAO_SEEDANCE_2_MODEL_ID, name: DOUBAO_SEEDANCE_2_MODEL_NAME }],
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
    supportedDurations: [5, 8, 10],
    supportedResolutions: ['720p', '1080p'],
    maxVideoDuration: 10,
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
      normalized.duration = 8;
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
      normalized.resolution = '1080p';
    } else if (!provider.supportedResolutions.includes(normalized.resolution)) {
      throw new Error(`视频生成不支持该视频清晰度：${normalized.resolution}`);
    }
  }

  return normalized;
}

export async function generateVideo(
  config: VideoGenerationConfig,
  options: VideoGenerationOptions,
): Promise<VideoGenerationResult> {
  return generateWithZenMuxVideo(config, options);
}
