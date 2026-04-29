/**
 * Qwen Video / HappyHorse text-to-video adapter.
 *
 * Uses DashScope's async task flow:
 * submit task -> poll task status -> return video URL.
 */

import type {
  VideoGenerationConfig,
  VideoGenerationOptions,
  VideoGenerationResult,
} from '../types';

const DEFAULT_MODEL = 'happyhorse-1.0-t2v';
const DEFAULT_BASE_URL = 'https://dashscope-intl.aliyuncs.com';
const POLL_INTERVAL_MS = 15_000;
const MAX_POLL_ATTEMPTS = 40;

type QwenTaskStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED' | 'UNKNOWN';

interface QwenVideoSubmitResponse {
  output?: {
    task_id?: string;
    task_status?: QwenTaskStatus;
  };
  code?: string;
  message?: string;
}

interface QwenVideoPollResponse {
  output?: {
    task_id?: string;
    task_status?: QwenTaskStatus;
    video_url?: string;
    code?: string;
    message?: string;
  };
  usage?: {
    duration?: number;
    output_video_duration?: number;
    SR?: number;
    ratio?: string;
  };
  code?: string;
  message?: string;
}

function getEndpoint(path: string): string {
  return `${DEFAULT_BASE_URL}${path}`;
}

function estimateDimensions(
  ratio: VideoGenerationOptions['aspectRatio'] = '16:9',
  resolution: VideoGenerationOptions['resolution'] = '720P',
): { width: number; height: number } {
  const base = resolution === '1080P' ? 1080 : 720;
  const [w, h] = ratio.split(':').map(Number);
  if (!w || !h) return { width: 1280, height: 720 };
  if (w >= h) return { width: Math.round((base * w) / h), height: base };
  return { width: base, height: Math.round((base * h) / w) };
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

function getApiErrorMessage(data: unknown, prefix: string): string {
  if (typeof data === 'string') return `${prefix}: ${data}`;
  const body = data as { code?: string; message?: string; output?: { code?: string; message?: string } };
  const code = body.output?.code || body.code;
  const message = body.output?.message || body.message;
  return `${prefix}: ${[code, message].filter(Boolean).join(' - ') || 'Unknown error'}`;
}

async function submitQwenVideoTask(
  config: VideoGenerationConfig,
  options: VideoGenerationOptions,
): Promise<string> {
  const response = await fetch(
    getEndpoint('/api/v1/services/aigc/video-generation/video-synthesis'),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model || DEFAULT_MODEL,
        input: {
          prompt: options.prompt,
        },
        parameters: {
          resolution: options.resolution || '720P',
          ratio: options.aspectRatio || '16:9',
          duration: options.duration || 5,
          watermark: false,
        },
      }),
    },
  );

  const data = (await readJsonOrText(response)) as QwenVideoSubmitResponse;
  if (!response.ok) {
    throw new Error(getApiErrorMessage(data, `Qwen Video task submission failed (${response.status})`));
  }
  if (data.code || data.message) {
    throw new Error(getApiErrorMessage(data, 'Qwen Video task submission failed'));
  }
  if (!data.output?.task_id) {
    throw new Error('Qwen Video returned empty task ID');
  }

  return data.output.task_id;
}

async function pollQwenVideoTask(
  config: VideoGenerationConfig,
  taskId: string,
  options: VideoGenerationOptions,
): Promise<VideoGenerationResult | null> {
  const response = await fetch(getEndpoint(`/api/v1/tasks/${encodeURIComponent(taskId)}`), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
    },
  });

  const data = (await readJsonOrText(response)) as QwenVideoPollResponse;
  if (!response.ok) {
    throw new Error(getApiErrorMessage(data, `Qwen Video poll failed (${response.status})`));
  }

  const status = data.output?.task_status;
  if (status === 'SUCCEEDED') {
    if (!data.output?.video_url) {
      throw new Error('Qwen Video task succeeded but no video URL returned');
    }
    const ratio =
      (data.usage?.ratio as VideoGenerationOptions['aspectRatio'] | undefined) ||
      options.aspectRatio ||
      '16:9';
    const resolution =
      data.usage?.SR === 1080 ? '1080P' : options.resolution || '720P';
    const dims = estimateDimensions(ratio, resolution);

    return {
      url: data.output.video_url,
      duration: data.usage?.output_video_duration || data.usage?.duration || options.duration || 5,
      width: dims.width,
      height: dims.height,
    };
  }

  if (status === 'FAILED' || status === 'CANCELED' || status === 'UNKNOWN') {
    throw new Error(getApiErrorMessage(data, `Qwen Video task ${status || 'failed'}`));
  }

  return null;
}

export async function generateWithQwenVideo(
  config: VideoGenerationConfig,
  options: VideoGenerationOptions,
): Promise<VideoGenerationResult> {
  const taskId = await submitQwenVideoTask(config, options);

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const result = await pollQwenVideoTask(config, taskId, options);
    if (result) return result;
  }

  throw new Error(
    `Qwen Video generation timed out after ${(MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS) / 1000}s (task: ${taskId})`,
  );
}
