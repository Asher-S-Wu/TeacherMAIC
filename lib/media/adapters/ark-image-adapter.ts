import type {
  ImageGenerationConfig,
  ImageGenerationOptions,
  ImageGenerationResult,
} from '../types';
import {
  ARK_BASE_URL,
  DOUBAO_SEEDREAM_5_MODEL_ID,
} from '@/lib/ai/ark-models';

const SEEDREAM_5_DIMENSIONS: Record<string, { width: number; height: number }> = {
  '1:1': { width: 2048, height: 2048 },
  '4:3': { width: 2304, height: 1728 },
  '3:4': { width: 1728, height: 2304 },
  '16:9': { width: 2848, height: 1600 },
  '9:16': { width: 1600, height: 2848 },
};

interface ArkImageResponse {
  data?: Array<{
    b64_json?: string;
    url?: string;
    size?: string;
    error?: {
      code?: string;
      message?: string;
    };
  }>;
  error?: {
    code?: string;
    message?: string;
  };
}

function requireBaseUrl(baseUrl?: string): string {
  return (baseUrl || ARK_BASE_URL).replace(/\/$/, '');
}

function buildEndpoint(baseUrl?: string): string {
  return `${requireBaseUrl(baseUrl)}/images/generations`;
}

function buildPrompt(options: ImageGenerationOptions): string {
  const parts = [options.prompt.trim()];
  if (options.style) parts.push(`风格：${options.style}`);
  if (options.negativePrompt) parts.push(`避免出现：${options.negativePrompt}`);
  return parts.filter(Boolean).join('\n');
}

function resolveDimensions(options: ImageGenerationOptions): { width: number; height: number } {
  if (options.width && options.height) {
    return {
      width: options.width,
      height: options.height,
    };
  }

  return SEEDREAM_5_DIMENSIONS[options.aspectRatio || '16:9'] ?? SEEDREAM_5_DIMENSIONS['16:9'];
}

function parseSize(size: string | undefined): { width: number; height: number } | null {
  if (!size) return null;
  const match = size.match(/^(\d+)\s*[x×]\s*(\d+)$/i);
  if (!match) return null;
  return {
    width: Number(match[1]),
    height: Number(match[2]),
  };
}

async function readJsonOrText(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function describeError(data: unknown): string {
  if (typeof data === 'string') return data;
  const body = data as ArkImageResponse;
  return (
    body.error?.message ||
    body.data?.find((item) => item.error)?.error?.message ||
    JSON.stringify(data)
  );
}

export async function generateWithArkImage(
  config: ImageGenerationConfig,
  options: ImageGenerationOptions,
): Promise<ImageGenerationResult> {
  const dimensions = resolveDimensions(options);
  const response = await fetch(buildEndpoint(config.baseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model || DOUBAO_SEEDREAM_5_MODEL_ID,
      prompt: buildPrompt(options),
      size: `${dimensions.width}x${dimensions.height}`,
      response_format: 'b64_json',
      watermark: false,
      sequential_image_generation: 'disabled',
    }),
  });

  const data = (await readJsonOrText(response)) as ArkImageResponse | string;
  if (!response.ok) {
    throw new Error(`图片生成失败（${response.status}）：${describeError(data)}`);
  }

  if (typeof data === 'string' || data.error) {
    throw new Error(`图片生成失败：${describeError(data)}`);
  }

  const generated = data.data?.find((item) => item.b64_json || item.url);
  if (!generated) {
    throw new Error(`图片生成没有返回图片数据：${describeError(data)}`);
  }

  if (generated.error) {
    throw new Error(
      `图片生成失败：${generated.error.message || generated.error.code || '未知错误'}`,
    );
  }

  const returnedDimensions = parseSize(generated.size) || dimensions;
  return {
    base64: generated.b64_json,
    url: generated.url,
    width: returnedDimensions.width,
    height: returnedDimensions.height,
  };
}
