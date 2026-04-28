/**
 * Qwen ASR provider implementation.
 */

import type { ASRModelConfig } from './types';
import { ASR_PROVIDERS, QWEN_ASR_MODEL_ID } from './constants';

export interface ASRTranscriptionResult {
  text: string;
}

export async function transcribeAudio(
  config: ASRModelConfig,
  audioBuffer: Buffer | Blob,
): Promise<ASRTranscriptionResult> {
  if (!config.apiKey) {
    throw new Error('API key required for Qwen ASR. Set QWEN_API_KEY in Vercel.');
  }
  return transcribeQwenASR(config, audioBuffer);
}

async function transcribeQwenASR(
  config: ASRModelConfig,
  audioBuffer: Buffer | Blob,
): Promise<ASRTranscriptionResult> {
  const baseUrl = ASR_PROVIDERS['qwen-asr'].defaultBaseUrl!;

  let base64Audio: string;
  if (audioBuffer instanceof Buffer) {
    base64Audio = audioBuffer.toString('base64');
  } else if (audioBuffer instanceof Blob) {
    const arrayBuffer = await audioBuffer.arrayBuffer();
    base64Audio = Buffer.from(arrayBuffer).toString('base64');
  } else {
    throw new Error('Invalid audio buffer type');
  }

  const requestBody: Record<string, unknown> = {
    model: QWEN_ASR_MODEL_ID,
    input: {
      messages: [
        {
          role: 'user',
          content: [
            {
              audio: `data:audio/wav;base64,${base64Audio}`,
            },
          ],
        },
      ],
    },
  };

  if (config.language && config.language !== 'auto') {
    requestBody.parameters = {
      asr_options: {
        language: config.language,
      },
    };
  }

  const response = await fetch(`${baseUrl}/services/aigc/multimodal-generation/generation`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json; charset=utf-8',
      'X-DashScope-Audio-Format': 'wav',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    if (errorText.includes('audio is empty') || errorText.includes('InvalidParameter')) {
      return { text: '' };
    }
    throw new Error(`Qwen ASR API error: ${errorText}`);
  }

  const data = await response.json();
  const messageContent = data.output?.choices?.[0]?.message?.content;
  if (!Array.isArray(messageContent) || messageContent.length === 0) {
    return { text: '' };
  }

  return { text: messageContent[0]?.text || '' };
}

export async function getCurrentASRConfig(): Promise<ASRModelConfig> {
  if (typeof window === 'undefined') {
    throw new Error('getCurrentASRConfig() can only be called in browser context');
  }

  const { useSettingsStore } = await import('@/lib/store/settings');
  const { asrLanguage } = useSettingsStore.getState();

  return {
    providerId: 'qwen-asr',
    modelId: QWEN_ASR_MODEL_ID,
    language: asrLanguage,
  };
}

export { getAllASRProviders, getASRProvider, getASRSupportedLanguages } from './constants';
