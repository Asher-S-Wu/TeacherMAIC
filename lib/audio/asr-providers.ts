import type { ASRModelConfig } from './types';
import {
  DOUBAO_AUC_ASR_MODEL_ID,
  DOUBAO_AUC_ASR_QUERY_ENDPOINT,
  DOUBAO_AUC_ASR_RESOURCE_ID,
  DOUBAO_AUC_ASR_SUBMIT_ENDPOINT,
} from '@/lib/ai/doubao-audio-models';

export interface ASRTranscriptionResult {
  text: string;
}

export interface ASRTranscriptionInput {
  audioUrl: string;
  format: string;
}

type AUCStatus = 'success' | 'processing' | 'failed';

type AUCResponseBody = {
  result?: {
    text?: string;
    utterances?: Array<{ text?: string }>;
  };
  message?: string;
  code?: string | number;
  error?: string;
};

const AUC_SUCCESS_CODE = '20000000';
const AUC_PROCESSING_CODES = new Set(['20000001', '20000002']);
const AUC_POLL_INTERVAL_MS = 1500;
const AUC_TIMEOUT_MS = 120000;

function requireApiKey(apiKey?: string): string {
  if (!apiKey) {
    throw new Error('豆包录音文件识别未配置 API Key，请在 Vercel 配置 VOLCENGINE_SPEECH_API_KEY。');
  }
  return apiKey;
}

function resolveSubmitEndpoint(baseUrl?: string): string {
  if (!baseUrl) return DOUBAO_AUC_ASR_SUBMIT_ENDPOINT;
  if (baseUrl.includes('/query')) return baseUrl.replace('/query', '/submit');
  if (baseUrl.includes('/submit')) return baseUrl;
  return DOUBAO_AUC_ASR_SUBMIT_ENDPOINT;
}

function resolveQueryEndpoint(baseUrl?: string): string {
  if (!baseUrl) return DOUBAO_AUC_ASR_QUERY_ENDPOINT;
  if (baseUrl.includes('/submit')) return baseUrl.replace('/submit', '/query');
  if (baseUrl.includes('/query')) return baseUrl;
  return DOUBAO_AUC_ASR_QUERY_ENDPOINT;
}

function buildHeaders(config: ASRModelConfig, taskId: string, includeSequence: boolean): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'X-Api-Key': requireApiKey(config.apiKey),
    'X-Api-Resource-Id': config.modelId || DOUBAO_AUC_ASR_RESOURCE_ID,
    'X-Api-Request-Id': taskId,
    ...(includeSequence ? { 'X-Api-Sequence': '-1' } : {}),
  };
}

function readStatus(response: Response, body?: AUCResponseBody): { status: AUCStatus; code: string; message: string } {
  const code = response.headers.get('X-Api-Status-Code') || String(body?.code || '');
  const message = response.headers.get('X-Api-Message') || body?.message || body?.error || response.statusText;

  if (code === AUC_SUCCESS_CODE) return { status: 'success', code, message };
  if (AUC_PROCESSING_CODES.has(code)) return { status: 'processing', code, message };
  return { status: 'failed', code: code || String(response.status), message };
}

function extractText(body: AUCResponseBody): string {
  const text = body.result?.text?.trim();
  if (text) return text;

  return (body.result?.utterances || [])
    .map((utterance) => utterance.text || '')
    .join('')
    .trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseJsonResponse(response: Response): Promise<AUCResponseBody> {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as AUCResponseBody;
  } catch {
    throw new Error(`豆包录音文件识别返回了非 JSON 内容：${text.slice(0, 200)}`);
  }
}

async function submitTask(
  config: ASRModelConfig,
  input: ASRTranscriptionInput,
  taskId: string,
): Promise<void> {
  const response = await fetch(resolveSubmitEndpoint(config.baseUrl), {
    method: 'POST',
    headers: buildHeaders(config, taskId, true),
    body: JSON.stringify({
      user: {
        uid: config.metadataUserId || 'anonymous',
      },
      audio: {
        url: input.audioUrl,
        format: input.format,
        ...(config.language && config.language !== 'auto' ? { language: config.language } : {}),
      },
      request: {
        model_name: 'bigmodel',
        enable_itn: true,
        enable_punc: true,
        show_utterances: true,
      },
    }),
  });

  const body = await parseJsonResponse(response);
  const status = readStatus(response, body);
  if (!response.ok || status.status !== 'success') {
    throw new Error(`豆包录音文件识别任务提交失败（${status.code}）：${status.message}`);
  }
}

async function queryTask(config: ASRModelConfig, taskId: string): Promise<{ done: boolean; text?: string }> {
  const response = await fetch(resolveQueryEndpoint(config.baseUrl), {
    method: 'POST',
    headers: buildHeaders(config, taskId, false),
    body: JSON.stringify({}),
  });

  const body = await parseJsonResponse(response);
  const status = readStatus(response, body);

  if (status.status === 'processing') {
    return { done: false };
  }

  if (!response.ok || status.status !== 'success') {
    throw new Error(`豆包录音文件识别结果查询失败（${status.code}）：${status.message}`);
  }

  const text = extractText(body);
  if (!text) {
    throw new Error(`豆包录音文件识别没有返回转写文字：${JSON.stringify(body)}`);
  }
  return { done: true, text };
}

export async function transcribeAudio(
  config: ASRModelConfig,
  input: ASRTranscriptionInput,
): Promise<ASRTranscriptionResult> {
  const taskId = crypto.randomUUID();
  const startedAt = Date.now();

  await submitTask(
    {
      ...config,
      modelId: config.modelId || DOUBAO_AUC_ASR_MODEL_ID,
    },
    input,
    taskId,
  );

  while (Date.now() - startedAt < AUC_TIMEOUT_MS) {
    await sleep(AUC_POLL_INTERVAL_MS);
    const result = await queryTask(config, taskId);
    if (result.done) {
      return { text: result.text || '' };
    }
  }

  throw new Error('豆包录音文件识别超时，请稍后重试。');
}
