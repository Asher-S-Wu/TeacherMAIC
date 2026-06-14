import type { TTSModelConfig } from './types';
import { BAILIAN_TTS_MODEL_ID } from './constants';

export interface TTSGenerationResult {
  audio: Uint8Array;
  format: string;
}

interface BailianTTSResponse {
  output?: {
    audio?: {
      url?: string;
      data?: string;
    };
  };
  request_id?: string;
  code?: string;
  message?: string;
}

function endpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, '')}${path}`;
}

function requireBaseUrl(baseUrl?: string): string {
  if (!baseUrl) {
    throw new Error('百炼语音合成暂时不可用，请稍后再试。');
  }
  return baseUrl;
}

function getAudioFormat(url?: string, requestedFormat = 'wav'): string {
  if (!url) return requestedFormat;
  const pathname = new URL(url).pathname.toLowerCase();
  const match = pathname.match(/\.([a-z0-9]+)$/);
  return match?.[1] || requestedFormat;
}

async function fetchAudioBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`百炼语音文件下载失败（${response.status}）`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

export async function generateTTS(
  config: TTSModelConfig,
  text: string,
): Promise<TTSGenerationResult> {
  if (!config.apiKey) {
    throw new Error('百炼语音合成未配置 API Key，请在 Vercel 配置 DASHSCOPE_API_KEY。');
  }

  const baseUrl = requireBaseUrl(config.baseUrl);
  const response = await fetch(endpoint(baseUrl, '/services/aigc/multimodal-generation/generation'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.modelId || BAILIAN_TTS_MODEL_ID,
      input: {
        text,
        voice: config.voice,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`百炼语音合成失败（${response.status}）：${errorText}`);
  }

  const data = (await response.json()) as BailianTTSResponse;
  if (data.code) {
    throw new Error(`百炼语音合成失败：${data.message || data.code}`);
  }

  const audioUrl = data.output?.audio?.url;
  const audioData = data.output?.audio?.data;
  if (audioData) {
    return {
      audio: new Uint8Array(Buffer.from(audioData, 'base64')),
      format: config.format || 'wav',
    };
  }

  if (!audioUrl) {
    throw new Error(`百炼语音合成没有返回音频：${JSON.stringify(data)}`);
  }

  return {
    audio: await fetchAudioBytes(audioUrl),
    format: getAudioFormat(audioUrl, config.format || 'wav'),
  };
}
