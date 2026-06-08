import type {
  VideoGenerationConfig,
  VideoGenerationOptions,
  VideoGenerationResult,
} from '../types';
import { BAILIAN_VIDEO_MODEL_ID } from '@/lib/ai/bailian-models';

const POLL_INTERVAL_MS = 15_000;
const MAX_POLL_ATTEMPTS = 80;

type BailianVideoStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED' | 'UNKNOWN';

interface BailianVideoResponse {
  output?: {
    task_id?: string;
    task_status?: BailianVideoStatus;
    video_url?: string;
    code?: string;
    message?: string;
  };
  usage?: {
    duration?: number;
    output_video_duration?: number;
    ratio?: string;
    SR?: number;
  };
  code?: string;
  message?: string;
  request_id?: string;
}

const VIDEO_DIMENSIONS: Record<string, Record<string, { width: number; height: number }>> = {
  '720P': {
    '16:9': { width: 1280, height: 720 },
    '9:16': { width: 720, height: 1280 },
    '1:1': { width: 960, height: 960 },
    '4:3': { width: 1104, height: 832 },
    '3:4': { width: 832, height: 1104 },
  },
  '1080P': {
    '16:9': { width: 1920, height: 1080 },
    '9:16': { width: 1080, height: 1920 },
    '1:1': { width: 1440, height: 1440 },
    '4:3': { width: 1648, height: 1248 },
    '3:4': { width: 1248, height: 1648 },
  },
};

function endpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, '')}${path}`;
}

function requireBaseUrl(baseUrl?: string): string {
  if (!baseUrl) {
    throw new Error('百炼视频生成暂时不可用，请稍后再试。');
  }
  return baseUrl;
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
  const body = data as BailianVideoResponse;
  return `${prefix}：${body.output?.message || body.message || body.output?.code || body.code || '未知错误'}`;
}

function estimateDimensions(options: VideoGenerationOptions): { width: number; height: number } {
  const resolution = options.resolution || '1080P';
  const ratio = options.aspectRatio || '16:9';
  return VIDEO_DIMENSIONS[resolution]?.[ratio] || VIDEO_DIMENSIONS['1080P']['16:9'];
}

async function submitBailianVideoTask(
  config: VideoGenerationConfig,
  options: VideoGenerationOptions,
): Promise<string> {
  const baseUrl = requireBaseUrl(config.baseUrl);
  const response = await fetch(endpoint(baseUrl, '/services/aigc/video-generation/video-synthesis'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
      'X-DashScope-Async': 'enable',
    },
    body: JSON.stringify({
      model: config.model || BAILIAN_VIDEO_MODEL_ID,
      input: {
        prompt: options.prompt,
      },
      parameters: {
        duration: options.duration || 5,
        ratio: options.aspectRatio || '16:9',
        resolution: options.resolution || '1080P',
      },
    }),
  });

  const data = (await readJsonOrText(response)) as BailianVideoResponse;
  if (!response.ok) {
    throw new Error(errorMessage(data, `百炼视频任务创建失败（${response.status}）`));
  }
  if (data.code) {
    throw new Error(errorMessage(data, '百炼视频任务创建失败'));
  }
  const taskId = data.output?.task_id;
  if (!taskId) {
    throw new Error(`百炼视频任务没有返回任务 ID：${JSON.stringify(data)}`);
  }
  return taskId;
}

async function pollBailianVideoTask(
  config: VideoGenerationConfig,
  taskId: string,
  options: VideoGenerationOptions,
): Promise<VideoGenerationResult | null> {
  const baseUrl = requireBaseUrl(config.baseUrl);
  const response = await fetch(endpoint(baseUrl, `/tasks/${encodeURIComponent(taskId)}`), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
    },
  });

  const data = (await readJsonOrText(response)) as BailianVideoResponse;
  if (!response.ok) {
    throw new Error(errorMessage(data, `百炼视频任务查询失败（${response.status}）`));
  }
  if (data.code) {
    throw new Error(errorMessage(data, '百炼视频任务查询失败'));
  }

  const status = data.output?.task_status;
  if (status === 'SUCCEEDED') {
    const url = data.output?.video_url;
    if (!url) {
      throw new Error(`百炼视频任务成功但没有返回视频地址：${JSON.stringify(data)}`);
    }
    const estimated = estimateDimensions(options);
    return {
      url,
      duration: data.usage?.output_video_duration || data.usage?.duration || options.duration || 5,
      width: estimated.width,
      height: estimated.height,
    };
  }

  if (status === 'FAILED' || status === 'CANCELED' || status === 'UNKNOWN') {
    throw new Error(errorMessage(data, '百炼视频任务失败'));
  }

  return null;
}

export async function generateWithBailianVideo(
  config: VideoGenerationConfig,
  options: VideoGenerationOptions,
): Promise<VideoGenerationResult> {
  const taskId = await submitBailianVideoTask(config, options);

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const result = await pollBailianVideoTask(config, taskId, options);
    if (result) return result;
  }

  throw new Error(
    `百炼视频生成超时：${(MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS) / 1000}s，任务 ${taskId}`,
  );
}
