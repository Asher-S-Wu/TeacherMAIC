import type {
  VideoGenerationConfig,
  VideoGenerationOptions,
  VideoGenerationResult,
} from './types';
import { generateWithArkVideo } from './adapters/ark-video-adapter';

export async function generateVideo(
  config: VideoGenerationConfig,
  options: VideoGenerationOptions,
): Promise<VideoGenerationResult> {
  return generateWithArkVideo(config, options);
}
