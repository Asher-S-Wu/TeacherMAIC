import type {
  VideoGenerationConfig,
  VideoGenerationOptions,
  VideoGenerationResult,
} from '../types';
import { MINIMAX_API_BASE_URL, MINIMAX_VIDEO_MODEL_ID } from '@/lib/ai/minimax-models';

const POLL_INTERVAL_MS = 10_000;
const MAX_POLL_ATTEMPTS = 60;

type MinimaxVideoStatus = 'Preparing' | 'Queueing' | 'Processing' | 'Success' | 'Fail';

interface MinimaxBaseResp {
  status_code?: number;
  status_msg?: string;
}

interface MinimaxVideoSubmitResponse {
  task_id?: string;
  base_resp?: MinimaxBaseResp;
}

interface MinimaxVideoPollResponse {
  task_id?: string;
  status?: MinimaxVideoStatus;
  file_id?: string;
  video_width?: number;
  video_height?: number;
  error_message?: string;
  base_resp?: MinimaxBaseResp;
}

interface MinimaxFileRetrieveResponse {
  file?: {
    download_url?: string;
  };
  base_resp?: MinimaxBaseResp;
}

function endpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, '')}${path}`;
}

function assertSuccess(data: { base_resp?: MinimaxBaseResp }, action: string): void {
  const statusCode = data.base_resp?.status_code;
  if (statusCode !== undefined && statusCode !== 0) {
    throw new Error(`MiniMax ${action}失败：${data.base_resp?.status_msg || statusCode}`);
  }
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
  const body = data as { error_message?: string; base_resp?: MinimaxBaseResp };
  return `${prefix}：${body.error_message || body.base_resp?.status_msg || '未知错误'}`;
}

function estimateDimensions(
  resolution: VideoGenerationOptions['resolution'] = '768P',
): { width: number; height: number } {
  if (resolution === '1080P') return { width: 1920, height: 1080 };
  if (resolution === '720P') return { width: 1280, height: 720 };
  return { width: 1366, height: 768 };
}

async function submitMinimaxVideoTask(
  config: VideoGenerationConfig,
  options: VideoGenerationOptions,
): Promise<string> {
  const baseUrl = config.baseUrl || MINIMAX_API_BASE_URL;
  const response = await fetch(endpoint(baseUrl, '/video_generation'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model || MINIMAX_VIDEO_MODEL_ID,
      prompt: options.prompt,
      duration: options.duration || 6,
      resolution: options.resolution || '768P',
      prompt_optimizer: true,
    }),
  });

  const data = (await readJsonOrText(response)) as MinimaxVideoSubmitResponse;
  if (!response.ok) {
    throw new Error(errorMessage(data, `MiniMax 视频任务创建失败（${response.status}）`));
  }
  assertSuccess(data, '视频任务创建');
  if (!data.task_id) {
    throw new Error(`MiniMax 视频任务没有返回任务 ID：${JSON.stringify(data)}`);
  }
  return data.task_id;
}

async function pollMinimaxVideoTask(
  config: VideoGenerationConfig,
  taskId: string,
  options: VideoGenerationOptions,
): Promise<VideoGenerationResult | null> {
  const baseUrl = config.baseUrl || MINIMAX_API_BASE_URL;
  const url = new URL(endpoint(baseUrl, '/query/video_generation'));
  url.searchParams.set('task_id', taskId);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
    },
  });

  const data = (await readJsonOrText(response)) as MinimaxVideoPollResponse;
  if (!response.ok) {
    throw new Error(errorMessage(data, `MiniMax 视频任务查询失败（${response.status}）`));
  }
  assertSuccess(data, '视频任务查询');

  if (data.status === 'Success') {
    if (!data.file_id) {
      throw new Error(`MiniMax 视频任务成功但没有返回文件 ID：${JSON.stringify(data)}`);
    }
    const url = await retrieveMinimaxVideoUrl(config, data.file_id);
    const estimated = estimateDimensions(options.resolution || '768P');
    return {
      url,
      duration: options.duration || 6,
      width: data.video_width || estimated.width,
      height: data.video_height || estimated.height,
    };
  }

  if (data.status === 'Fail') {
    throw new Error(errorMessage(data, 'MiniMax 视频任务失败'));
  }

  return null;
}

async function retrieveMinimaxVideoUrl(
  config: VideoGenerationConfig,
  fileId: string,
): Promise<string> {
  const baseUrl = config.baseUrl || MINIMAX_API_BASE_URL;
  const url = new URL(endpoint(baseUrl, '/files/retrieve'));
  url.searchParams.set('file_id', fileId);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
    },
  });

  const data = (await readJsonOrText(response)) as MinimaxFileRetrieveResponse;
  if (!response.ok) {
    throw new Error(errorMessage(data, `MiniMax 视频文件获取失败（${response.status}）`));
  }
  assertSuccess(data, '视频文件获取');

  const downloadUrl = data.file?.download_url;
  if (!downloadUrl) {
    throw new Error(`MiniMax 视频文件没有返回下载地址：${JSON.stringify(data)}`);
  }
  return downloadUrl;
}

export async function generateWithMinimaxVideo(
  config: VideoGenerationConfig,
  options: VideoGenerationOptions,
): Promise<VideoGenerationResult> {
  const taskId = await submitMinimaxVideoTask(config, options);

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const result = await pollMinimaxVideoTask(config, taskId, options);
    if (result) return result;
  }

  throw new Error(
    `MiniMax 视频生成超时：${(MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS) / 1000}s，任务 ${taskId}`,
  );
}
