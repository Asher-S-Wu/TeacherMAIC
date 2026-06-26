import type { TTSModelConfig } from './types';
import { DOUBAO_AUDIO_TTS_MODEL_ID } from './constants';

export interface TTSGenerationResult {
  audio: Uint8Array;
  format: string;
}

interface DoubaoTTSResponse {
  code?: number;
  message?: string;
  audio?: string;
  duration?: number;
  original_duration?: number;
  url?: string;
}

function requireEndpoint(baseUrl?: string): string {
  if (!baseUrl) {
    throw new Error('豆包语音合成暂时不可用，请稍后再试。');
  }
  return baseUrl;
}

function getAudioFormat(url?: string, requestedFormat = 'mp3'): string {
  if (!url) return requestedFormat;
  const pathname = new URL(url).pathname.toLowerCase();
  const match = pathname.match(/\.([a-z0-9_]+)$/);
  return match?.[1] || requestedFormat;
}

async function fetchAudioBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`豆包语音文件下载失败（${response.status}）`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

function createRequestId(): string {
  return crypto.randomUUID();
}

export async function generateTTS(
  config: TTSModelConfig,
  text: string,
): Promise<TTSGenerationResult> {
  if (!config.apiKey) {
    throw new Error('豆包语音合成未配置 API Key，请在 Vercel 配置 VOLCENGINE_SPEECH_API_KEY。');
  }

  const format = config.format || 'mp3';
  const response = await fetch(requireEndpoint(config.baseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': config.apiKey,
      'X-Api-Request-Id': createRequestId(),
    },
    body: JSON.stringify({
      model: config.modelId || DOUBAO_AUDIO_TTS_MODEL_ID,
      text_prompt: text,
      references: [
        {
          speaker: config.voice,
        },
      ],
      audio_config: {
        format,
        sample_rate: 24000,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`豆包语音合成失败（${response.status}）：${errorText}`);
  }

  const data = (await response.json()) as DoubaoTTSResponse;
  if (data.code && data.code !== 0) {
    throw new Error(`豆包语音合成失败：${data.message || data.code}`);
  }

  if (data.audio) {
    return {
      audio: new Uint8Array(Buffer.from(data.audio, 'base64')),
      format,
    };
  }

  if (!data.url) {
    throw new Error(`豆包语音合成没有返回音频：${JSON.stringify(data)}`);
  }

  return {
    audio: await fetchAudioBytes(data.url),
    format: getAudioFormat(data.url, format),
  };
}
