import type { TTSModelConfig } from './types';
import { ARK_TTS_MODEL_ID, TTS_PROVIDERS } from './constants';

export interface TTSGenerationResult {
  audio: Uint8Array;
  format: string;
}

export async function generateTTS(
  config: TTSModelConfig,
  text: string,
): Promise<TTSGenerationResult> {
  if (!config.apiKey) {
    throw new Error('API key required for 火山方舟语音合成. Set ARK_API_KEY in Vercel.');
  }
  return generateArkTTS(config, text);
}

async function generateArkTTS(
  config: TTSModelConfig,
  text: string,
): Promise<TTSGenerationResult> {
  const baseUrl = config.baseUrl || TTS_PROVIDERS['ark-tts'].defaultBaseUrl!;
  const format = config.format || 'wav';

  const response = await fetch(`${baseUrl}/audio/speech`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.modelId || ARK_TTS_MODEL_ID,
      input: text,
      voice: config.voice,
      response_format: format,
      speed: config.speed || 1,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`火山方舟语音合成失败（${response.status}）：${errorText}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await response.json();
    const audioUrl = data.url || data.audio?.url || data.data?.[0]?.url;
    if (!audioUrl) {
      throw new Error(`火山方舟语音合成没有返回音频：${JSON.stringify(data)}`);
    }
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      throw new Error(`下载火山方舟语音失败：${audioResponse.statusText}`);
    }
    return {
      audio: new Uint8Array(await audioResponse.arrayBuffer()),
      format,
    };
  }

  return {
    audio: new Uint8Array(await response.arrayBuffer()),
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
