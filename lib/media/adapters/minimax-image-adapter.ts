import type {
  ImageGenerationConfig,
  ImageGenerationOptions,
  ImageGenerationResult,
} from '../types';
import { MINIMAX_API_BASE_URL, MINIMAX_IMAGE_MODEL_ID } from '@/lib/ai/minimax-models';

interface MinimaxBaseResp {
  status_code?: number;
  status_msg?: string;
}

interface MinimaxImageResponse {
  data?: {
    image_urls?: string[];
    image_base64?: string[];
  };
  base_resp?: MinimaxBaseResp;
}

const IMAGE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  '1:1': { width: 1024, height: 1024 },
  '16:9': { width: 1280, height: 720 },
  '4:3': { width: 1152, height: 864 },
  '3:4': { width: 864, height: 1152 },
  '9:16': { width: 720, height: 1280 },
};

function endpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, '')}${path}`;
}

function buildPrompt(options: ImageGenerationOptions): string {
  const parts = [options.prompt.trim()];
  if (options.style) parts.push(`风格：${options.style}`);
  if (options.negativePrompt) parts.push(`避免出现：${options.negativePrompt}`);
  if (options.aspectRatio) parts.push(`画面比例：${options.aspectRatio}`);
  return parts.filter(Boolean).join('\n');
}

function resolveDimensions(options: ImageGenerationOptions): { width: number; height: number } {
  if (options.aspectRatio && IMAGE_DIMENSIONS[options.aspectRatio]) {
    return IMAGE_DIMENSIONS[options.aspectRatio];
  }
  if (options.width && options.height) {
    return { width: options.width, height: options.height };
  }
  return IMAGE_DIMENSIONS['16:9'];
}

function assertSuccess(data: MinimaxImageResponse): void {
  const statusCode = data.base_resp?.status_code;
  if (statusCode !== undefined && statusCode !== 0) {
    throw new Error(`MiniMax 图片生成失败：${data.base_resp?.status_msg || statusCode}`);
  }
}

export async function generateWithMinimaxImage(
  config: ImageGenerationConfig,
  options: ImageGenerationOptions,
): Promise<ImageGenerationResult> {
  const baseUrl = config.baseUrl || MINIMAX_API_BASE_URL;
  const response = await fetch(endpoint(baseUrl, '/image_generation'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model || MINIMAX_IMAGE_MODEL_ID,
      prompt: buildPrompt(options),
      aspect_ratio: options.aspectRatio || '16:9',
      response_format: 'url',
      n: 1,
      prompt_optimizer: true,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`MiniMax 图片生成失败（${response.status}）：${text}`);
  }

  const data = (await response.json()) as MinimaxImageResponse;
  assertSuccess(data);

  const url = data.data?.image_urls?.[0];
  const base64 = data.data?.image_base64?.[0];
  if (!url && !base64) {
    throw new Error(`MiniMax 图片生成没有返回图片：${JSON.stringify(data)}`);
  }

  return {
    url,
    base64,
    ...resolveDimensions(options),
  };
}
