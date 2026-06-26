import { proxyFetch } from '@/lib/server/proxy-fetch';
import type {
  VideoGenerationConfig,
  VideoGenerationOptions,
  VideoGenerationResult,
} from '../types';
import {
  ARK_BASE_URL,
  DOUBAO_SEEDANCE_2_MODEL_ID,
} from '@/lib/ai/ark-models';

const POLL_INTERVAL_MS = 15_000;
const MAX_POLL_ATTEMPTS = 80;

const VIDEO_DIMENSIONS: Record<string, Record<string, { width: number; height: number }>> = {
  '480p': {
    '16:9': { width: 864, height: 496 },
    '4:3': { width: 752, height: 560 },
    '1:1': { width: 640, height: 640 },
    '3:4': { width: 560, height: 752 },
    '9:16': { width: 496, height: 864 },
    '21:9': { width: 992, height: 432 },
  },
  '720p': {
    '16:9': { width: 1280, height: 720 },
    '4:3': { width: 1112, height: 834 },
    '1:1': { width: 960, height: 960 },
    '3:4': { width: 834, height: 1112 },
    '9:16': { width: 720, height: 1280 },
    '21:9': { width: 1470, height: 630 },
  },
  '1080p': {
    '16:9': { width: 1920, height: 1080 },
    '4:3': { width: 1664, height: 1248 },
    '1:1': { width: 1440, height: 1440 },
    '3:4': { width: 1248, height: 1664 },
    '9:16': { width: 1080, height: 1920 },
    '21:9': { width: 2206, height: 946 },
  },
  '4k': {
    '16:9': { width: 3840, height: 2160 },
    '4:3': { width: 3326, height: 2494 },
    '1:1': { width: 2880, height: 2880 },
    '3:4': { width: 2494, height: 3326 },
    '9:16': { width: 2160, height: 3840 },
    '21:9': { width: 4398, height: 1886 },
  },
};

type ArkVideoTaskStatus = 'queued' | 'running' | 'cancelled' | 'succeeded' | 'failed' | 'expired';

interface ArkVideoTaskResponse {
  id?: string;
  status?: ArkVideoTaskStatus;
  error?: { code?: string; message?: string } | null;
  content?: {
    video_url?: string;
    last_frame_url?: string;
  };
  duration?: number;
  resolution?: string;
  ratio?: string;
}

function requireBaseUrl(baseUrl?: string): string {
  return (baseUrl || ARK_BASE_URL).replace(/\/$/, '');
}

function tasksUrl(baseUrl: string): string {
  return `${baseUrl}/contents/generations/tasks`;
}

function taskUrl(baseUrl: string, taskId: string): string {
  return `${tasksUrl(baseUrl)}/${encodeURIComponent(taskId)}`;
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
  if (typeof data === 'string') return `${prefix}：${data}`;
  const body = data as ArkVideoTaskResponse;
  return `${prefix}：${body.error?.message || JSON.stringify(data)}`;
}

function estimateDimensions(options: VideoGenerationOptions): { width: number; height: number } {
  const resolution = options.resolution || '720p';
  const ratio = options.aspectRatio || '16:9';
  return VIDEO_DIMENSIONS[resolution]?.[ratio] || VIDEO_DIMENSIONS['720p']['16:9'];
}

async function submitArkVideoTask(
  config: VideoGenerationConfig,
  options: VideoGenerationOptions,
): Promise<string> {
  const baseUrl = requireBaseUrl(config.baseUrl);
  const response = await proxyFetch(tasksUrl(baseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model || DOUBAO_SEEDANCE_2_MODEL_ID,
      content: [
        {
          type: 'text',
          text: options.prompt,
        },
      ],
      resolution: options.resolution || '720p',
      ratio: options.aspectRatio || '16:9',
      duration: options.duration ?? 5,
      generate_audio: true,
      watermark: false,
    }),
  });

  const data = (await readJsonOrText(response)) as ArkVideoTaskResponse;
  if (!response.ok) {
    throw new Error(errorMessage(data, `视频任务创建失败（${response.status}）`));
  }

  if (!data.id) {
    throw new Error(`视频任务没有返回任务 ID：${JSON.stringify(data)}`);
  }

  return data.id;
}

async function pollArkVideoTask(
  config: VideoGenerationConfig,
  taskId: string,
  options: VideoGenerationOptions,
): Promise<VideoGenerationResult | null> {
  const baseUrl = requireBaseUrl(config.baseUrl);
  const response = await proxyFetch(taskUrl(baseUrl, taskId), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
    },
  });

  const data = (await readJsonOrText(response)) as ArkVideoTaskResponse;
  if (!response.ok) {
    throw new Error(errorMessage(data, `视频任务查询失败（${response.status}）`));
  }

  if (data.status === 'queued' || data.status === 'running') {
    return null;
  }

  if (data.status === 'succeeded') {
    if (!data.content?.video_url) {
      throw new Error(`视频任务成功但没有返回视频地址：${JSON.stringify(data)}`);
    }
    const estimated = estimateDimensions(options);
    return {
      url: data.content.video_url,
      duration: data.duration ?? options.duration ?? 5,
      width: estimated.width,
      height: estimated.height,
    };
  }

  if (data.status === 'failed') {
    throw new Error(errorMessage(data, '视频任务失败'));
  }

  if (data.status === 'expired') {
    throw new Error('视频任务已超时。');
  }

  if (data.status === 'cancelled') {
    throw new Error('视频任务已取消。');
  }

  throw new Error(`视频任务返回了未知状态：${JSON.stringify(data)}`);
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
    `视频生成超时：${(MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS) / 1000}s，任务 ${taskId}`,
  );
}
