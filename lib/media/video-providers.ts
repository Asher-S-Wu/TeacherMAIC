import type {
  VideoGenerationConfig,
  VideoGenerationOptions,
  VideoGenerationResult,
} from './types';
import { generateWithZenMuxVideo } from './adapters/zenmux-video-adapter';

export async function generateVideo(
  config: VideoGenerationConfig,
  options: VideoGenerationOptions,
): Promise<VideoGenerationResult> {
  return generateWithZenMuxVideo(config, options);
}
