import { randomUUID } from 'crypto';
import { gzipSync, gunzipSync } from 'zlib';
import { WebSocket } from 'undici';
import type { ASRModelConfig } from './types';
import { ASR_PROVIDERS, DOUBAO_ASR_MODEL_ID } from './constants';

export interface ASRTranscriptionResult {
  text: string;
}

const PROTOCOL_VERSION = 0b0001;
const HEADER_SIZE = 0b0001;
const SERIALIZATION_RAW = 0b0000;
const SERIALIZATION_JSON = 0b0001;
const COMPRESSION_GZIP = 0b0001;

const MESSAGE_TYPE_FULL_CLIENT_REQUEST = 0b0001;
const MESSAGE_TYPE_AUDIO_ONLY_REQUEST = 0b0010;
const MESSAGE_TYPE_FULL_SERVER_RESPONSE = 0b1001;
const MESSAGE_TYPE_SERVER_ACK = 0b1011;
const MESSAGE_TYPE_SERVER_ERROR = 0b1111;

const FLAG_NO_SEQUENCE = 0b0000;
const FLAG_NEG_SEQUENCE = 0b0010;

const ASR_ENDPOINT_PATH = '/bigmodel_nostream';
const AUDIO_CHUNK_BYTES = 6400;
const ASR_TIMEOUT_MS = 120_000;

type ASRResponseMessage = {
  result?: { text?: string; utterances?: Array<{ text?: string; definite?: boolean }> };
  results?: Array<{ text?: string }>;
  text?: string;
  message?: string;
  code?: number;
};

interface ParsedASRResponse {
  isLastPackage: boolean;
  sequence?: number;
  code?: number;
  message?: ASRResponseMessage;
}

function makeHeader(
  messageType: number,
  flag: number,
  serialization: number,
  compression: number,
): Buffer {
  return Buffer.from([
    (PROTOCOL_VERSION << 4) | HEADER_SIZE,
    (messageType << 4) | flag,
    (serialization << 4) | compression,
    0,
  ]);
}

function uint32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value, 0);
  return buffer;
}

function fullClientRequest(payload: unknown): Buffer {
  const payloadBytes = gzipSync(Buffer.from(JSON.stringify(payload)));
  return Buffer.concat([
    makeHeader(
      MESSAGE_TYPE_FULL_CLIENT_REQUEST,
      FLAG_NO_SEQUENCE,
      SERIALIZATION_JSON,
      COMPRESSION_GZIP,
    ),
    uint32(payloadBytes.length),
    payloadBytes,
  ]);
}

function audioOnlyRequest(audio: Buffer, last: boolean): Buffer {
  const payloadBytes = gzipSync(audio);
  return Buffer.concat([
    makeHeader(
      MESSAGE_TYPE_AUDIO_ONLY_REQUEST,
      last ? FLAG_NEG_SEQUENCE : FLAG_NO_SEQUENCE,
      SERIALIZATION_RAW,
      COMPRESSION_GZIP,
    ),
    uint32(payloadBytes.length),
    payloadBytes,
  ]);
}

function parseASRResponse(data: Buffer): ParsedASRResponse {
  const headerSize = (data[0] & 0x0f) * 4;
  const messageType = data[1] >> 4;
  const flag = data[1] & 0x0f;
  const serialization = data[2] >> 4;
  const compression = data[2] & 0x0f;
  let offset = headerSize;

  const result: ParsedASRResponse = {
    isLastPackage: (flag & 0b0010) !== 0,
  };

  if (flag & 0b0001) {
    result.sequence = data.readInt32BE(offset);
    offset += 4;
  }

  let payload: Buffer | null = null;
  if (messageType === MESSAGE_TYPE_FULL_SERVER_RESPONSE) {
    const size = data.readUInt32BE(offset);
    offset += 4;
    payload = data.subarray(offset, offset + size);
  } else if (messageType === MESSAGE_TYPE_SERVER_ACK) {
    if (data.length >= offset + 4) {
      result.sequence = data.readInt32BE(offset);
      offset += 4;
    }
    if (data.length >= offset + 4) {
      const size = data.readUInt32BE(offset);
      offset += 4;
      payload = data.subarray(offset, offset + size);
    }
  } else if (messageType === MESSAGE_TYPE_SERVER_ERROR) {
    result.code = data.readUInt32BE(offset);
    offset += 4;
    const size = data.readUInt32BE(offset);
    offset += 4;
    payload = data.subarray(offset, offset + size);
    result.isLastPackage = true;
  }

  if (!payload || payload.length === 0) return result;
  const decoded = compression === COMPRESSION_GZIP ? gunzipSync(payload) : payload;
  if (serialization === SERIALIZATION_JSON) {
    result.message = JSON.parse(decoded.toString('utf8')) as ASRResponseMessage;
  }
  return result;
}

async function toBuffer(audioBuffer: Buffer | Blob): Promise<Buffer> {
  return audioBuffer instanceof Blob
    ? Buffer.from(await audioBuffer.arrayBuffer())
    : audioBuffer;
}

function buildEndpoint(baseUrl?: string): string {
  const base = (baseUrl || ASR_PROVIDERS['doubao-asr'].defaultBaseUrl!).replace(/\/$/, '');
  return `${base}${ASR_ENDPOINT_PATH}`;
}

function resolveLanguage(language?: string): string | undefined {
  return !language || language === 'auto' ? undefined : language;
}

function extractText(message: ASRResponseMessage | undefined): string {
  if (!message) return '';
  if (typeof message.text === 'string') return message.text.trim();
  if (message.result?.utterances?.length) {
    const text = message.result.utterances
      .filter((item) => item.text)
      .map((item) => item.text)
      .join('');
    if (text.trim()) return text.trim();
  }
  if (typeof message.result?.text === 'string') return message.result.text.trim();
  if (message.results?.length) {
    return message.results
      .map((item) => item.text || '')
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
    throw new Error('API Key required for 豆包语音识别. Set DOUBAO_ASR_API_KEY in Vercel.');
  }
  return transcribeWithDoubaoSpeechASR(config, await toBuffer(audioBuffer));
}

async function transcribeWithDoubaoSpeechASR(
  config: ASRModelConfig,
  audioBuffer: Buffer,
): Promise<ASRTranscriptionResult> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(buildEndpoint(config.baseUrl), {
      headers: {
        'x-api-key': config.apiKey!,
        'X-Api-Resource-Id': config.resourceId || DOUBAO_ASR_MODEL_ID,
        'X-Api-Connect-Id': randomUUID(),
      },
    });
    ws.binaryType = 'arraybuffer';

    let finished = false;
    let latestText = '';
    const timeout = setTimeout(() => {
      finish(new Error('豆包语音识别超时'));
    }, ASR_TIMEOUT_MS);

    function finish(error?: Error) {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
      if (error) {
        reject(error);
        return;
      }
      const text = latestText.trim();
      if (!text) {
        reject(new Error('豆包语音识别没有返回转写文字'));
        return;
      }
      resolve({ text });
    }

    ws.addEventListener('open', () => {
      const language = resolveLanguage(config.language);
      ws.send(
        fullClientRequest({
          user: { uid: 'teachermaic' },
          audio: {
            format: 'wav',
            codec: 'raw',
            rate: 16000,
            bits: 16,
            channel: 1,
            ...(language ? { language } : {}),
          },
          request: {
            model_name: 'bigmodel',
            enable_itn: true,
            enable_punc: true,
            enable_ddc: false,
            result_type: 'full',
          },
        }),
      );

      for (let offset = 0; offset < audioBuffer.length; offset += AUDIO_CHUNK_BYTES) {
        ws.send(audioOnlyRequest(audioBuffer.subarray(offset, offset + AUDIO_CHUNK_BYTES), false));
      }
      ws.send(audioOnlyRequest(Buffer.alloc(0), true));
    });

    ws.addEventListener('message', (event) => {
      try {
        const data =
          event.data instanceof ArrayBuffer
            ? Buffer.from(event.data)
            : Buffer.from(event.data as Buffer);
        const parsed = parseASRResponse(data);
        if (parsed.code && parsed.code !== 0) {
          finish(
            new Error(`豆包语音识别失败（${parsed.code}）：${parsed.message?.message || '未知错误'}`),
          );
          return;
        }

        const text = extractText(parsed.message);
        if (text) latestText = text;
        if (parsed.isLastPackage) finish();
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });

    ws.addEventListener('error', () => {
      finish(new Error('豆包语音识别连接失败'));
    });

    ws.addEventListener('close', () => {
      if (!finished && latestText.trim()) finish();
      else if (!finished) finish(new Error('豆包语音识别连接已关闭'));
    });
  });
}

export async function getCurrentASRConfig(): Promise<ASRModelConfig> {
  if (typeof window === 'undefined') {
    throw new Error('getCurrentASRConfig() can only be called in browser context');
  }

  const { useSettingsStore } = await import('@/lib/store/settings');
  const { asrLanguage } = useSettingsStore.getState();

  return {
    providerId: 'doubao-asr',
    modelId: DOUBAO_ASR_MODEL_ID,
    language: asrLanguage,
  };
}

export { getAllASRProviders, getASRProvider, getASRSupportedLanguages } from './constants';
