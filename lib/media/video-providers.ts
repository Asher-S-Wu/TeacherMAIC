import type {
  VideoProviderId,
  VideoGenerationConfig,
  VideoGenerationOptions,
  VideoGenerationResult,
  VideoProviderConfig,
} from './types';
import {
  MINIMAX_API_BASE_URL,
  MINIMAX_VIDEO_MODEL_ID,
  MINIMAX_VIDEO_MODEL_NAME,
} from '@/lib/ai/minimax-models';
import { generateWithMinimaxVideo } from './adapters/minimax-video-adapter';

export const VIDEO_PROVIDERS: Record<VideoProviderId, VideoProviderConfig> = {
  'minimax-video': {
    id: 'minimax-video',
    name: 'MiniMax 视频生成',
    requiresApiKey: true,
    defaultBaseUrl: MINIMAX_API_BASE_URL,
    models: [{ id: MINIMAX_VIDEO_MODEL_ID, name: MINIMAX_VIDEO_MODEL_NAME }],
    supportedAspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
    supportedDurations: [6, 10],
    supportedResolutions: ['768P', '1080P'],
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
      normalized.duration = provider.supportedDurations[0];
    } else if (!provider.supportedDurations.includes(normalized.duration)) {
      throw new Error(`MiniMax 不支持该视频时长：${normalized.duration}`);
    }
  }

  if (provider.supportedAspectRatios && provider.supportedAspectRatios.length > 0) {
    if (!normalized.aspectRatio) {
      normalized.aspectRatio = provider
        .supportedAspectRatios[0] as VideoGenerationOptions['aspectRatio'];
    } else if (!provider.supportedAspectRatios.includes(normalized.aspectRatio)) {
      throw new Error(`Unsupported Ark video aspect ratio: ${normalized.aspectRatio}`);
    }
  }

  if (provider.supportedResolutions && provider.supportedResolutions.length > 0) {
    if (!normalized.resolution) {
      normalized.resolution = provider.supportedResolutions[0];
    } else if (!provider.supportedResolutions.includes(normalized.resolution)) {
      throw new Error(`MiniMax 不支持该视频清晰度：${normalized.resolution}`);
    }
  }

  return normalized;
}

export async function generateVideo(
  config: VideoGenerationConfig,
  options: VideoGenerationOptions,
): Promise<VideoGenerationResult> {
  return generateWithMinimaxVideo(config, options);
}
