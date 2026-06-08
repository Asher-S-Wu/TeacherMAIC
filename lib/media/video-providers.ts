import type {
  VideoProviderId,
  VideoGenerationConfig,
  VideoGenerationOptions,
  VideoGenerationResult,
  VideoProviderConfig,
} from './types';
import {
  BAILIAN_DASHSCOPE_API_BASE_URL_TEMPLATE,
  BAILIAN_VIDEO_MODEL_ID,
  BAILIAN_VIDEO_MODEL_NAME,
} from '@/lib/ai/bailian-models';
import { generateWithBailianVideo } from './adapters/bailian-video-adapter';

export const VIDEO_PROVIDERS: Record<VideoProviderId, VideoProviderConfig> = {
  'bailian-video': {
    id: 'bailian-video',
    name: '百炼视频生成',
    requiresApiKey: true,
    defaultBaseUrl: BAILIAN_DASHSCOPE_API_BASE_URL_TEMPLATE,
    models: [{ id: BAILIAN_VIDEO_MODEL_ID, name: BAILIAN_VIDEO_MODEL_NAME }],
    supportedAspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
    supportedDurations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    supportedResolutions: ['720P', '1080P'],
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
      throw new Error(`百炼视频生成不支持该视频时长：${normalized.duration}`);
    }
  }

  if (provider.supportedAspectRatios && provider.supportedAspectRatios.length > 0) {
    if (!normalized.aspectRatio) {
      normalized.aspectRatio = provider
        .supportedAspectRatios[0] as VideoGenerationOptions['aspectRatio'];
    } else if (!provider.supportedAspectRatios.includes(normalized.aspectRatio)) {
      throw new Error(`百炼视频生成不支持该视频比例：${normalized.aspectRatio}`);
    }
  }

  if (provider.supportedResolutions && provider.supportedResolutions.length > 0) {
    if (!normalized.resolution) {
      normalized.resolution = '1080P';
    } else if (!provider.supportedResolutions.includes(normalized.resolution)) {
      throw new Error(`百炼视频生成不支持该视频清晰度：${normalized.resolution}`);
    }
  }

  return normalized;
}

export async function generateVideo(
  config: VideoGenerationConfig,
  options: VideoGenerationOptions,
): Promise<VideoGenerationResult> {
  return generateWithBailianVideo(config, options);
}
