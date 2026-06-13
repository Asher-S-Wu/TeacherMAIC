import type {
  ImageGenerationConfig,
  ImageGenerationOptions,
  ImageGenerationResult,
} from './types';
import { generateWithZenMuxImage } from './adapters/zenmux-image-adapter';

export async function generateImage(
  config: ImageGenerationConfig,
  options: ImageGenerationOptions,
): Promise<ImageGenerationResult> {
  return generateWithZenMuxImage(config, options);
}
