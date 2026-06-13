import OpenAI from 'openai';
import type {
  ImageGenerationConfig,
  ImageGenerationOptions,
  ImageGenerationResult,
} from '../types';
import { GPT_IMAGE_2_MODEL_ID } from '@/lib/ai/zenmux-models';

const IMAGE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  '1:1': { width: 2048, height: 2048 },
  '16:9': { width: 2048, height: 1152 },
  '4:3': { width: 2048, height: 1536 },
  '3:4': { width: 1536, height: 2048 },
  '9:16': { width: 1152, height: 2048 },
};

function requireBaseUrl(baseUrl?: string): string {
  if (!baseUrl) {
    throw new Error('图片生成暂时不可用，请稍后再试。');
  }
  return baseUrl;
}

function buildPrompt(options: ImageGenerationOptions): string {
  const parts = [options.prompt.trim()];
  if (options.style) parts.push(`风格：${options.style}`);
  if (options.negativePrompt) parts.push(`避免出现：${options.negativePrompt}`);
  return parts.filter(Boolean).join('\n');
}

function alignToMultipleOf16(value: number): number {
  return Math.max(16, Math.floor(value / 16) * 16);
}

function resolveDimensions(options: ImageGenerationOptions): { width: number; height: number } {
  let width: number;
  let height: number;

  if (options.width && options.height) {
    width = options.width;
    height = options.height;
  } else if (options.aspectRatio && IMAGE_DIMENSIONS[options.aspectRatio]) {
    ({ width, height } = IMAGE_DIMENSIONS[options.aspectRatio]);
  } else {
    ({ width, height } = IMAGE_DIMENSIONS['16:9']);
  }

  return {
    width: alignToMultipleOf16(width),
    height: alignToMultipleOf16(height),
  };
}

export async function generateWithZenMuxImage(
  config: ImageGenerationConfig,
  options: ImageGenerationOptions,
): Promise<ImageGenerationResult> {
  const baseUrl = requireBaseUrl(config.baseUrl);
  const dimensions = resolveDimensions(options);

  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: baseUrl.replace(/\/$/, ''),
  });

  const response = await client.images.generate({
    model: config.model || GPT_IMAGE_2_MODEL_ID,
    prompt: buildPrompt(options),
    n: 1,
    size: `${dimensions.width}x${dimensions.height}`,
  });

  const base64 = response.data?.[0]?.b64_json;
  if (!base64) {
    throw new Error('图片生成没有返回图片数据。');
  }

  return {
    base64,
    width: dimensions.width,
    height: dimensions.height,
  };
}
