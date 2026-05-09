import type { ASRModelConfig } from './types';
import { ARK_ASR_MODEL_ID, ASR_PROVIDERS } from './constants';

export interface ASRTranscriptionResult {
  text: string;
}

interface ArkChatResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ text?: string; type?: string }>;
    };
  }>;
  error?: {
    code?: string;
    message?: string;
  };
}

export async function transcribeAudio(
  config: ASRModelConfig,
  audioBuffer: Buffer | Blob,
): Promise<ASRTranscriptionResult> {
  if (!config.apiKey) {
    throw new Error('API key required for 火山方舟语音识别. Set ARK_API_KEY in Vercel.');
  }
  return transcribeWithArkAudioUnderstanding(config, audioBuffer);
}

async function transcribeWithArkAudioUnderstanding(
  config: ASRModelConfig,
  audioBuffer: Buffer | Blob,
): Promise<ASRTranscriptionResult> {
  const baseUrl = config.baseUrl || ASR_PROVIDERS['ark-asr'].defaultBaseUrl!;
  const base64Audio =
    audioBuffer instanceof Buffer
      ? audioBuffer.toString('base64')
      : Buffer.from(await audioBuffer.arrayBuffer()).toString('base64');
  const languageHint =
    config.language && config.language !== 'auto'
      ? `识别语言提示：${config.language}。`
      : '自动判断音频语言。';

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.modelId || ARK_ASR_MODEL_ID,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `请把这段音频完整转写成纯文本。${languageHint}只输出转写内容，不要解释。`,
            },
            {
              type: 'input_audio',
              input_audio: {
                data: base64Audio,
                format: 'audio/wav',
              },
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`火山方舟语音识别失败（${response.status}）：${errorText}`);
  }

  const data = (await response.json()) as ArkChatResponse;
  if (data.error) {
    throw new Error(`火山方舟语音识别失败：${data.error.message || data.error.code || '未知错误'}`);
  }

  const content = data.choices?.[0]?.message?.content;
  if (typeof content === 'string') {
    return { text: content.trim() };
  }
  if (Array.isArray(content)) {
    const text = content
      .map((item) => item.text || '')
      .join('')
      .trim();
    if (text) return { text };
  }

  throw new Error('火山方舟语音识别没有返回转写文字');
}

export async function getCurrentASRConfig(): Promise<ASRModelConfig> {
  if (typeof window === 'undefined') {
    throw new Error('getCurrentASRConfig() can only be called in browser context');
  }

  const { useSettingsStore } = await import('@/lib/store/settings');
  const { asrLanguage } = useSettingsStore.getState();

  return {
    providerId: 'ark-asr',
    modelId: ARK_ASR_MODEL_ID,
    language: asrLanguage,
  };
}

export { getAllASRProviders, getASRProvider, getASRSupportedLanguages } from './constants';
