import type { ASRModelConfig } from './types';
import { BAILIAN_ASR_MODEL_ID } from './constants';

export interface ASRTranscriptionResult {
  text: string;
}

const MAX_QWEN_ASR_AUDIO_BYTES = 10 * 1024 * 1024;

type OpenAIASRResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  code?: string;
  message?: string;
};

async function toBuffer(audioBuffer: Buffer | Blob): Promise<Buffer> {
  return audioBuffer instanceof Blob
    ? Buffer.from(await audioBuffer.arrayBuffer())
    : audioBuffer;
}

function endpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/chat/completions`;
}

function requireBaseUrl(baseUrl?: string): string {
  if (!baseUrl) {
    throw new Error('百炼语音识别暂时不可用，请稍后再试。');
  }
  return baseUrl;
}

function resolveMimeType(config: ASRModelConfig): string {
  return config.mimeType || 'audio/wav';
}

function buildAudioDataUri(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

function extractText(data: OpenAIASRResponse): string {
  const content = data.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => part.text || '')
      .join('')
      .trim();
  }
  return '';
}

export async function transcribeAudio(
  config: ASRModelConfig,
  audioBuffer: Buffer | Blob,
): Promise<ASRTranscriptionResult> {
  if (!config.apiKey) {
    throw new Error('百炼语音识别未配置 API Key，请在 Vercel 配置 DASHSCOPE_API_KEY。');
  }

  const buffer = await toBuffer(audioBuffer);
  if (buffer.length > MAX_QWEN_ASR_AUDIO_BYTES) {
    throw new Error('百炼语音识别单次音频不能超过 10MB。');
  }

  const mimeType = resolveMimeType(config);
  const baseUrl = requireBaseUrl(config.baseUrl);

  const response = await fetch(endpoint(baseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.modelId || BAILIAN_ASR_MODEL_ID,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'input_audio',
              input_audio: {
                data: buildAudioDataUri(buffer, mimeType),
              },
            },
          ],
        },
      ],
      asr_options: {
        enable_itn: false,
        ...(config.language && config.language !== 'auto' ? { language: config.language } : {}),
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`百炼语音识别失败（${response.status}）：${errorText}`);
  }

  const data = (await response.json()) as OpenAIASRResponse;
  if (data.code) {
    throw new Error(`百炼语音识别失败：${data.message || data.code}`);
  }

  const text = extractText(data);
  if (!text) {
    throw new Error(`百炼语音识别没有返回转写文字：${JSON.stringify(data)}`);
  }

  return { text };
}

export async function getCurrentASRConfig(): Promise<ASRModelConfig> {
  if (typeof window === 'undefined') {
    throw new Error('getCurrentASRConfig() can only be called in browser context');
  }

  const { useSettingsStore } = await import('@/lib/store/settings');
  const { asrLanguage } = useSettingsStore.getState();

  return {
    providerId: 'bailian-asr',
    modelId: BAILIAN_ASR_MODEL_ID,
    language: asrLanguage,
  };
}

export { getAllASRProviders, getASRProvider, getASRSupportedLanguages } from './constants';
