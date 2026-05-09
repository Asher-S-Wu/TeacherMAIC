import type {
  ImageGenerationConfig,
  ImageGenerationOptions,
  ImageGenerationResult,
} from '../types';
import { ARK_BASE_URL, ARK_IMAGE_MODEL_ID } from '@/lib/ai/ark-models';

function resolveArkImageSize(options: ImageGenerationOptions): string {
  const width = options.width || 2048;
  const height = options.height || 1152;
  return `${width}x${height}`;
}

function buildPrompt(options: ImageGenerationOptions): string {
  const parts = [options.prompt.trim()];
  if (options.style) parts.push(`风格：${options.style}`);
  if (options.negativePrompt) parts.push(`避免出现：${options.negativePrompt}`);
  if (options.aspectRatio) parts.push(`画面比例：${options.aspectRatio}`);
  return parts.filter(Boolean).join('\n');
}

export async function generateWithArkImage(
  config: ImageGenerationConfig,
  options: ImageGenerationOptions,
): Promise<ImageGenerationResult> {
  const baseUrl = config.baseUrl || ARK_BASE_URL;
  const response = await fetch(`${baseUrl}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model || ARK_IMAGE_MODEL_ID,
      prompt: buildPrompt(options),
      size: resolveArkImageSize(options),
      response_format: 'url',
      output_format: 'png',
      watermark: false,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`火山方舟图片生成失败（${response.status}）：${text}`);
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(`火山方舟图片生成失败：${data.error.message || data.error.code || '未知错误'}`);
  }

  const item = data.data?.[0];
  const url = item?.url;
  const base64 = item?.b64_json;
  if (!url && !base64) {
    throw new Error(`火山方舟图片生成没有返回图片：${JSON.stringify(data)}`);
  }

  const [returnedWidth, returnedHeight] =
    typeof item?.size === 'string'
      ? item.size.split('x').map((value: string) => Number(value))
      : [];

  return {
    url,
    base64,
    width: returnedWidth || options.width || 2048,
    height: returnedHeight || options.height || 1152,
  };
}
