import type { TTSModelConfig } from './types';
import { ARK_TTS_MODEL_ID, TTS_PROVIDERS } from './constants';
import { randomUUID } from 'crypto';

export interface TTSGenerationResult {
  audio: Uint8Array;
  format: string;
}

export async function generateTTS(
  config: TTSModelConfig,
  text: string,
): Promise<TTSGenerationResult> {
  if (!config.apiKey) {
    throw new Error(
      'API Key required for 豆包语音合成. Set VOLCENGINE_TTS_API_KEY in Vercel.',
    );
  }
  return generateDoubaoSpeechTTS(config, text);
}

async function generateDoubaoSpeechTTS(
  config: TTSModelConfig,
  text: string,
): Promise<TTSGenerationResult> {
  const endpoint = config.baseUrl || TTS_PROVIDERS['ark-tts'].defaultBaseUrl!;
  const format = config.format || 'mp3';
  const speechRate = Math.max(-50, Math.min(100, Math.round(((config.speed || 1) - 1) * 100)));

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': config.apiKey!,
      'X-Api-Resource-Id': config.resourceId || config.modelId || ARK_TTS_MODEL_ID,
      'X-Api-Request-Id': randomUUID(),
    },
    body: JSON.stringify({
      user: { uid: 'teachermaic' },
      req_params: {
        text,
        speaker: config.voice,
        audio_params: {
          format,
          sample_rate: 24000,
          speech_rate: speechRate,
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`豆包语音合成失败（${response.status}）：${errorText}`);
  }

  const bodyText = await response.text();
  const audioChunks: Buffer[] = [];

  for (const line of bodyText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let data: { code?: number; message?: string; data?: string };
    try {
      data = JSON.parse(trimmed) as { code?: number; message?: string; data?: string };
    } catch {
      throw new Error(`豆包语音合成返回了无法解析的数据：${trimmed.slice(0, 200)}`);
    }

    if (data.code && data.code !== 0 && data.code !== 20000000) {
      throw new Error(`豆包语音合成失败（${data.code}）：${data.message || '未知错误'}`);
    }
    if (data.data) {
      audioChunks.push(Buffer.from(data.data, 'base64'));
    }
  }

  if (audioChunks.length === 0) {
    throw new Error(`豆包语音合成没有返回音频：${bodyText.slice(0, 500)}`);
  }

  return {
    audio: new Uint8Array(Buffer.concat(audioChunks)),
    format,
  };
}

export async function getCurrentTTSConfig(): Promise<TTSModelConfig> {
  if (typeof window === 'undefined') {
    throw new Error('getCurrentTTSConfig() can only be called in browser context');
  }

  const { useSettingsStore } = await import('@/lib/store/settings');
  const { ttsVoice, ttsSpeed } = useSettingsStore.getState();

  return {
    providerId: 'ark-tts',
    modelId: ARK_TTS_MODEL_ID,
    voice: ttsVoice,
    speed: ttsSpeed,
  };
}

export { getAllTTSProviders, getTTSProvider, getTTSVoices } from './constants';
