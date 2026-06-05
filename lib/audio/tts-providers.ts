import type { TTSModelConfig } from './types';
import { MINIMAX_TTS_MODEL_ID, TTS_PROVIDERS } from './constants';

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
      'API Key required for MiniMax 语音合成. Set MINIMAX_API_KEY in Vercel.',
    );
  }
  return generateMinimaxTTS(config, text);
}

interface MinimaxTTSResponse {
  data?: {
    audio?: string;
    status?: number;
  };
  base_resp?: {
    status_code?: number;
    status_msg?: string;
  };
  extra_info?: {
    audio_format?: string;
  };
}

function endpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, '')}${path}`;
}

function clampSpeed(speed: number | undefined): number {
  if (!speed || Number.isNaN(speed)) return 1;
  return Math.max(0.5, Math.min(2, speed));
}

async function generateMinimaxTTS(
  config: TTSModelConfig,
  text: string,
): Promise<TTSGenerationResult> {
  const baseUrl = config.baseUrl || TTS_PROVIDERS['minimax-tts'].defaultBaseUrl!;
  const format = config.format || 'mp3';

  const response = await fetch(endpoint(baseUrl, '/t2a_v2'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.modelId || MINIMAX_TTS_MODEL_ID,
      text,
      stream: false,
      language_boost: 'auto',
      output_format: 'hex',
      voice_setting: {
        voice_id: config.voice,
        speed: clampSpeed(config.speed),
        vol: 1,
        pitch: 0,
      },
      audio_setting: {
        sample_rate: 32000,
        bitrate: 128000,
        format,
        channel: 1,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`MiniMax 语音合成失败（${response.status}）：${errorText}`);
  }

  const data = (await response.json()) as MinimaxTTSResponse;
  const statusCode = data.base_resp?.status_code;
  if (statusCode !== undefined && statusCode !== 0) {
    throw new Error(`MiniMax 语音合成失败：${data.base_resp?.status_msg || statusCode}`);
  }

  const audioHex = data.data?.audio;
  if (!audioHex) {
    throw new Error(`MiniMax 语音合成没有返回音频：${JSON.stringify(data)}`);
  }

  return {
    audio: new Uint8Array(Buffer.from(audioHex, 'hex')),
    format: data.extra_info?.audio_format || format,
  };
}

export async function getCurrentTTSConfig(): Promise<TTSModelConfig> {
  if (typeof window === 'undefined') {
    throw new Error('getCurrentTTSConfig() can only be called in browser context');
  }

  const { useSettingsStore } = await import('@/lib/store/settings');
  const { ttsVoice, ttsSpeed } = useSettingsStore.getState();

  return {
    providerId: 'minimax-tts',
    modelId: MINIMAX_TTS_MODEL_ID,
    voice: ttsVoice,
    speed: ttsSpeed,
  };
}

export { getAllTTSProviders, getTTSProvider, getTTSVoices } from './constants';
