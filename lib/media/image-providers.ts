import type {
  ImageGenerationConfig,
  ImageGenerationOptions,
  ImageGenerationResult,
} from './types';
import { generateWithArkImage } from './adapters/ark-image-adapter';

export async function generateImage(
  config: ImageGenerationConfig,
  options: ImageGenerationOptions,
): Promise<ImageGenerationResult> {
  return generateWithArkImage(config, options);
}
