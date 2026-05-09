import type {
  VideoGenerationConfig,
  VideoGenerationOptions,
  VideoGenerationResult,
} from '../types';
import { ARK_BASE_URL, ARK_VIDEO_MODEL_ID } from '@/lib/ai/ark-models';

const POLL_INTERVAL_MS = 15_000;
const MAX_POLL_ATTEMPTS = 40;

type ArkVideoStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'expired';

interface ArkVideoSubmitResponse {
  id?: string;
  error?: {
    code?: string;
    message?: string;
  } | null;
}

interface ArkVideoPollResponse {
  id?: string;
  model?: string;
  status?: ArkVideoStatus;
  error?: {
    code?: string;
    message?: string;
  } | null;
  content?: {
    video_url?: string;
    last_frame_url?: string;
  };
  duration?: number;
  ratio?: string;
  resolution?: string;
}

function endpoint(baseUrl: string, path: string): string {
  return `${baseUrl}${path}`;
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

function errorMessage(data: unknown, prefix: string): string {
  if (typeof data === 'string') return `${prefix}: ${data}`;
  const body = data as { error?: { code?: string; message?: string }; code?: string; message?: string };
  const code = body.error?.code || body.code;
  const message = body.error?.message || body.message;
  return `${prefix}: ${[code, message].filter(Boolean).join(' - ') || '未知错误'}`;
}

async function submitArkVideoTask(
  config: VideoGenerationConfig,
  options: VideoGenerationOptions,
): Promise<string> {
  const baseUrl = config.baseUrl || ARK_BASE_URL;
  const response = await fetch(endpoint(baseUrl, '/contents/generations/tasks'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model || ARK_VIDEO_MODEL_ID,
      content: [
        {
          type: 'text',
          text: options.prompt,
        },
      ],
      resolution: (options.resolution || '720P').toLowerCase(),
      ratio: options.aspectRatio || '16:9',
      duration: options.duration || 5,
      watermark: false,
    }),
  });

  const data = (await readJsonOrText(response)) as ArkVideoSubmitResponse;
  if (!response.ok) {
    throw new Error(errorMessage(data, `火山方舟视频任务创建失败（${response.status}）`));
  }
  if (data.error) {
    throw new Error(errorMessage(data, '火山方舟视频任务创建失败'));
  }
  if (!data.id) {
    throw new Error(`火山方舟视频任务没有返回任务 ID：${JSON.stringify(data)}`);
  }
  return data.id;
}

async function pollArkVideoTask(
  config: VideoGenerationConfig,
  taskId: string,
  options: VideoGenerationOptions,
): Promise<VideoGenerationResult | null> {
  const baseUrl = config.baseUrl || ARK_BASE_URL;
  const response = await fetch(
    endpoint(baseUrl, `/contents/generations/tasks/${encodeURIComponent(taskId)}`),
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
    },
  );

  const data = (await readJsonOrText(response)) as ArkVideoPollResponse;
  if (!response.ok) {
    throw new Error(errorMessage(data, `火山方舟视频任务查询失败（${response.status}）`));
  }
  if (data.error) {
    throw new Error(errorMessage(data, '火山方舟视频任务查询失败'));
  }

  if (data.status === 'succeeded') {
    if (!data.content?.video_url) {
      throw new Error(`火山方舟视频任务成功但没有返回视频：${JSON.stringify(data)}`);
    }
    const dims = estimateDimensions(
      (data.ratio as VideoGenerationOptions['aspectRatio']) || options.aspectRatio || '16:9',
      data.resolution === '1080p' ? '1080P' : options.resolution || '720P',
    );
    return {
      url: data.content.video_url,
      duration: data.duration || options.duration || 5,
      width: dims.width,
      height: dims.height,
      poster: data.content.last_frame_url,
    };
  }

  if (data.status === 'failed' || data.status === 'cancelled' || data.status === 'expired') {
    throw new Error(errorMessage(data, `火山方舟视频任务${data.status}`));
  }

  return null;
}

export async function generateWithArkVideo(
  config: VideoGenerationConfig,
  options: VideoGenerationOptions,
): Promise<VideoGenerationResult> {
  const taskId = await submitArkVideoTask(config, options);

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const result = await pollArkVideoTask(config, taskId, options);
    if (result) return result;
  }

  throw new Error(
    `火山方舟视频生成超时：${(MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS) / 1000}s，任务 ${taskId}`,
  );
}
