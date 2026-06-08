import type {
  ImageGenerationConfig,
  ImageGenerationOptions,
  ImageGenerationResult,
} from '../types';
import { BAILIAN_IMAGE_MODEL_ID } from '@/lib/ai/bailian-models';

interface BailianImageResponse {
  output?: {
    choices?: Array<{
      message?: {
        content?: Array<{ image?: string; text?: string }>;
      };
    }>;
  };
  code?: string;
  message?: string;
  request_id?: string;
}

const IMAGE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  '1:1': { width: 2048, height: 2048 },
  '16:9': { width: 2048, height: 1152 },
  '4:3': { width: 2048, height: 1536 },
  '3:4': { width: 1536, height: 2048 },
  '9:16': { width: 1152, height: 2048 },
};

function endpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, '')}${path}`;
}

function requireBaseUrl(baseUrl?: string): string {
  if (!baseUrl) {
    throw new Error('百炼图片生成暂时不可用，请稍后再试。');
  }
  return baseUrl;
}

function buildPrompt(options: ImageGenerationOptions): string {
  const parts = [options.prompt.trim()];
  if (options.style) parts.push(`风格：${options.style}`);
  if (options.negativePrompt) parts.push(`避免出现：${options.negativePrompt}`);
  return parts.filter(Boolean).join('\n');
}

function resolveDimensions(options: ImageGenerationOptions): { width: number; height: number } {
  if (options.width && options.height) {
    return { width: options.width, height: options.height };
  }
  if (options.aspectRatio && IMAGE_DIMENSIONS[options.aspectRatio]) {
    return IMAGE_DIMENSIONS[options.aspectRatio];
  }
  return IMAGE_DIMENSIONS['16:9'];
}

function extractImageUrl(data: BailianImageResponse): string | undefined {
  return data.output?.choices?.[0]?.message?.content?.find((item) => item.image)?.image;
}

export async function generateWithBailianImage(
  config: ImageGenerationConfig,
  options: ImageGenerationOptions,
): Promise<ImageGenerationResult> {
  const baseUrl = requireBaseUrl(config.baseUrl);
  const dimensions = resolveDimensions(options);

  const response = await fetch(endpoint(baseUrl, '/services/aigc/multimodal-generation/generation'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model || BAILIAN_IMAGE_MODEL_ID,
      input: {
        messages: [
          {
            role: 'user',
            content: [{ text: buildPrompt(options) }],
          },
        ],
      },
      parameters: {
        size: `${dimensions.width}*${dimensions.height}`,
        n: 1,
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`百炼图片生成失败（${response.status}）：${text}`);
  }

  const data = (await response.json()) as BailianImageResponse;
  if (data.code) {
    throw new Error(`百炼图片生成失败：${data.message || data.code}`);
  }

  const url = extractImageUrl(data);
  if (!url) {
    throw new Error(`百炼图片生成没有返回图片：${JSON.stringify(data)}`);
  }

  return {
    url,
    ...dimensions,
  };
}
