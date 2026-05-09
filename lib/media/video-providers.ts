import type {
  VideoProviderId,
  VideoGenerationConfig,
  VideoGenerationOptions,
  VideoGenerationResult,
  VideoProviderConfig,
} from './types';
import { ARK_BASE_URL, ARK_VIDEO_MODEL_ID, ARK_VIDEO_MODEL_NAME } from '@/lib/ai/ark-models';
import { generateWithArkVideo } from './adapters/ark-video-adapter';

export const VIDEO_PROVIDERS: Record<VideoProviderId, VideoProviderConfig> = {
  'ark-video': {
    id: 'ark-video',
    name: '火山方舟视频生成',
    requiresApiKey: true,
    defaultBaseUrl: ARK_BASE_URL,
    models: [{ id: ARK_VIDEO_MODEL_ID, name: ARK_VIDEO_MODEL_NAME }],
    supportedAspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
    supportedDurations: [5, 6, 7, 8, 9, 10, 11, 12],
    supportedResolutions: ['720P', '1080P'],
    maxVideoDuration: 12,
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
      throw new Error(`Unsupported Ark video duration: ${normalized.duration}`);
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
      throw new Error(`Unsupported Ark video resolution: ${normalized.resolution}`);
    }
  }

  return normalized;
}

export async function generateVideo(
  config: VideoGenerationConfig,
  options: VideoGenerationOptions,
): Promise<VideoGenerationResult> {
  return generateWithArkVideo(config, options);
}
