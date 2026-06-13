import { proxyFetch } from '@/lib/server/proxy-fetch';
import type {
  VideoGenerationConfig,
  VideoGenerationOptions,
  VideoGenerationResult,
} from '../types';
import {
  DOUBAO_SEEDANCE_2_MODEL,
  DOUBAO_SEEDANCE_2_MODEL_ID,
  DOUBAO_SEEDANCE_2_PROVIDER,
  ZENMUX_VERTEX_BASE_URL,
} from '@/lib/ai/zenmux-models';

const POLL_INTERVAL_MS = 15_000;
const MAX_POLL_ATTEMPTS = 80;

const VIDEO_DIMENSIONS: Record<string, Record<string, { width: number; height: number }>> = {
  '720p': {
    '16:9': { width: 1280, height: 720 },
    '9:16': { width: 720, height: 1280 },
    '1:1': { width: 960, height: 960 },
    '4:3': { width: 1104, height: 832 },
    '3:4': { width: 832, height: 1104 },
  },
  '1080p': {
    '16:9': { width: 1920, height: 1080 },
    '9:16': { width: 1080, height: 1920 },
    '1:1': { width: 1440, height: 1440 },
    '4:3': { width: 1648, height: 1248 },
    '3:4': { width: 1248, height: 1648 },
  },
};

interface VertexVideoOperationResponse {
  name?: string;
  done?: boolean;
  error?: { message?: string; code?: number };
  response?: {
    videos?: Array<{
      gcsUri?: string;
      bytesBase64Encoded?: string;
      mimeType?: string;
    }>;
    generatedVideos?: Array<{
      video?: { uri?: string; bytesBase64Encoded?: string; mimeType?: string };
    }>;
    raiMediaFilteredCount?: number;
    raiMediaFilteredReasons?: string[];
  };
}

function requireBaseUrl(baseUrl?: string): string {
  return (baseUrl || ZENMUX_VERTEX_BASE_URL).replace(/\/$/, '');
}

function predictLongRunningUrl(baseUrl: string): string {
  return `${baseUrl}/v1/publishers/${DOUBAO_SEEDANCE_2_PROVIDER}/models/${DOUBAO_SEEDANCE_2_MODEL}:predictLongRunning`;
}

function fetchPredictOperationUrl(baseUrl: string): string {
  return `${baseUrl}/v1/publishers/${DOUBAO_SEEDANCE_2_PROVIDER}/models/${DOUBAO_SEEDANCE_2_MODEL}:fetchPredictOperation`;
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
  const body = data as VertexVideoOperationResponse;
  return `${prefix}：${body.error?.message || JSON.stringify(data)}`;
}

function estimateDimensions(options: VideoGenerationOptions): { width: number; height: number } {
  const resolution = options.resolution || '1080p';
  const ratio = options.aspectRatio || '16:9';
  return VIDEO_DIMENSIONS[resolution]?.[ratio] || VIDEO_DIMENSIONS['1080p']['16:9'];
}

function parseInlineVideo(
  value: string,
): { url?: string; base64?: string; mimeType: string } {
  if (value.startsWith('data:')) {
    const match = value.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      throw new Error('视频生成返回了无效的内联数据。');
    }
    return { base64: match[2], mimeType: match[1] };
  }
  return { url: value, mimeType: 'video/mp4' };
}

function buildVideoResult(
  source: string,
  options: VideoGenerationOptions,
): VideoGenerationResult {
  const parsed = parseInlineVideo(source);
  const estimated = estimateDimensions(options);
  return {
    ...parsed,
    duration: options.duration || 8,
    width: estimated.width,
    height: estimated.height,
  };
}

async function submitZenMuxVideoTask(
  config: VideoGenerationConfig,
  options: VideoGenerationOptions,
): Promise<string> {
  const baseUrl = requireBaseUrl(config.baseUrl);
  const response = await proxyFetch(predictLongRunningUrl(baseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      instances: [{ prompt: options.prompt }],
      parameters: {
        aspectRatio: options.aspectRatio || '16:9',
        resolution: options.resolution || '1080p',
        durationSeconds: options.duration || 8,
        generateAudio: true,
      },
    }),
  });

  const data = (await readJsonOrText(response)) as VertexVideoOperationResponse;
  if (!response.ok) {
    throw new Error(errorMessage(data, `视频任务创建失败（${response.status}）`));
  }

  const operationName = data.name;
  if (!operationName) {
    throw new Error(`视频任务没有返回任务 ID：${JSON.stringify(data)}`);
  }

  return operationName;
}

async function pollZenMuxVideoTask(
  config: VideoGenerationConfig,
  operationName: string,
  options: VideoGenerationOptions,
): Promise<VideoGenerationResult | null> {
  const baseUrl = requireBaseUrl(config.baseUrl);
  const response = await proxyFetch(fetchPredictOperationUrl(baseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({ operationName }),
  });

  const data = (await readJsonOrText(response)) as VertexVideoOperationResponse;
  if (!response.ok) {
    throw new Error(errorMessage(data, `视频任务查询失败（${response.status}）`));
  }

  if (data.error) {
    throw new Error(errorMessage(data, '视频任务失败'));
  }

  if (data.response?.raiMediaFilteredCount && data.response.raiMediaFilteredCount > 0) {
    const reasons = data.response.raiMediaFilteredReasons?.join('；') || '内容审核未通过';
    throw new Error(`视频生成失败：${reasons}`);
  }

  if (data.done) {
    const directVideo = data.response?.videos?.[0];
    if (directVideo?.gcsUri) {
      return buildVideoResult(directVideo.gcsUri, options);
    }
    if (directVideo?.bytesBase64Encoded) {
      return {
        base64: directVideo.bytesBase64Encoded,
        duration: options.duration || 8,
        ...estimateDimensions(options),
      };
    }

    const generatedVideo = data.response?.generatedVideos?.[0]?.video;
    if (generatedVideo?.uri) {
      return buildVideoResult(generatedVideo.uri, options);
    }
    if (generatedVideo?.bytesBase64Encoded) {
      return {
        base64: generatedVideo.bytesBase64Encoded,
        duration: options.duration || 8,
        ...estimateDimensions(options),
      };
    }

    throw new Error(`视频任务成功但没有返回视频地址：${JSON.stringify(data)}`);
  }

  return null;
}

export async function generateWithZenMuxVideo(
  config: VideoGenerationConfig,
  options: VideoGenerationOptions,
): Promise<VideoGenerationResult> {
  const taskId = await submitZenMuxVideoTask(
    { ...config, model: config.model || DOUBAO_SEEDANCE_2_MODEL_ID },
    options,
  );

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const result = await pollZenMuxVideoTask(config, taskId, options);
    if (result) return result;
  }

  throw new Error(
    `视频生成超时：${(MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS) / 1000}s，任务 ${taskId}`,
  );
}
