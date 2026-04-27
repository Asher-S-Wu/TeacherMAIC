/**
 * Qwen TTS provider implementation.
 */

import type { TTSModelConfig } from './types';
import { QWEN_TTS_MODEL_ID, TTS_PROVIDERS } from './constants';

export interface TTSGenerationResult {
  audio: Uint8Array;
  format: string;
}

export async function generateTTS(
  config: TTSModelConfig,
  text: string,
): Promise<TTSGenerationResult> {
  if (!config.apiKey) {
    throw new Error('API key required for Qwen TTS. Set QWEN_API_KEY in Vercel.');
  }
  return generateQwenTTS(config, text);
}

async function generateQwenTTS(
  config: TTSModelConfig,
  text: string,
): Promise<TTSGenerationResult> {
  const baseUrl = TTS_PROVIDERS['qwen-tts'].defaultBaseUrl!;
  const rate = Math.round(((config.speed || 1.0) - 1.0) * 500);

  const response = await fetch(`${baseUrl}/services/aigc/multimodal-generation/generation`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      model: QWEN_TTS_MODEL_ID,
      input: {
        text,
        voice: config.voice,
        language_type: 'Chinese',
      },
      parameters: {
        rate,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`Qwen TTS API error: ${errorText}`);
  }

  const data = await response.json();
  if (!data.output?.audio?.url) {
    throw new Error(`Qwen TTS error: No audio URL in response. Response: ${JSON.stringify(data)}`);
  }

  const audioResponse = await fetch(data.output.audio.url);
  if (!audioResponse.ok) {
    throw new Error(`Failed to download audio from Qwen TTS: ${audioResponse.statusText}`);
  }

  const arrayBuffer = await audioResponse.arrayBuffer();
  return {
    audio: new Uint8Array(arrayBuffer),
    format: 'wav',
  };
}

export async function getCurrentTTSConfig(): Promise<TTSModelConfig> {
  if (typeof window === 'undefined') {
    throw new Error('getCurrentTTSConfig() can only be called in browser context');
  }

  const { useSettingsStore } = await import('@/lib/store/settings');
  const { ttsProviderId, ttsVoice, ttsSpeed, ttsProvidersConfig } = useSettingsStore.getState();
  const providerConfig = ttsProvidersConfig?.[ttsProviderId];

  return {
    providerId: 'qwen-tts',
    modelId: QWEN_TTS_MODEL_ID,
    apiKey: providerConfig?.apiKey,
    voice: ttsVoice,
    speed: ttsSpeed,
  };
}

export { getAllTTSProviders, getTTSProvider, getTTSVoices } from './constants';
