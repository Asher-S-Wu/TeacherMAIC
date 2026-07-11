import WebSocket, { type RawData } from 'ws';
import type { TTSModelConfig } from './types';
import { COSYVOICE_TTS_MODEL_ID } from './constants';

export interface TTSGenerationResult {
  audio: Uint8Array;
  format: string;
}

interface CosyVoiceServerMessage {
  header?: {
    event?: string;
    error_code?: string;
    error_message?: string;
  };
}

export class CosyVoiceTTSError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'CosyVoiceTTSError';
  }
}

const TASK_TIMEOUT_MS = 120_000;
const AUDIO_FORMAT = 'mp3';

function requireEndpoint(baseUrl?: string): string {
  if (!baseUrl) {
    throw new CosyVoiceTTSError('阿里云语音合成服务地址未配置。', 'MISSING_ENDPOINT');
  }
  return baseUrl;
}

function rawDataToBuffer(data: RawData): Buffer {
  if (Array.isArray(data)) return Buffer.concat(data);
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  return Buffer.from(data);
}

export async function generateTTS(
  config: TTSModelConfig,
  text: string,
): Promise<TTSGenerationResult> {
  if (!config.apiKey) {
    throw new CosyVoiceTTSError(
      '阿里云语音合成未配置 API Key，请在 Vercel 配置 DASHSCOPE_API_KEY。',
      'MISSING_API_KEY',
    );
  }

  const endpoint = requireEndpoint(config.baseUrl);
  const taskId = crypto.randomUUID();

  return new Promise<TTSGenerationResult>((resolve, reject) => {
    const audioChunks: Buffer[] = [];
    let settled = false;
    let taskStarted = false;

    const socket = new WebSocket(endpoint, {
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
    });

    const timeout = setTimeout(() => {
      fail(new CosyVoiceTTSError('阿里云语音合成等待超时。', 'TASK_TIMEOUT'));
    }, TASK_TIMEOUT_MS);

    function closeSocket(): void {
      if (socket.readyState === WebSocket.OPEN) {
        socket.close(1000);
      } else if (socket.readyState !== WebSocket.CLOSED) {
        socket.terminate();
      }
    }

    function fail(error: Error): void {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      closeSocket();
      reject(error);
    }

    function succeed(): void {
      if (settled) return;
      if (audioChunks.length === 0) {
        fail(new CosyVoiceTTSError('阿里云语音合成没有返回音频。', 'EMPTY_AUDIO'));
        return;
      }

      settled = true;
      clearTimeout(timeout);
      const audio = Buffer.concat(audioChunks);
      closeSocket();
      resolve({ audio: new Uint8Array(audio), format: AUDIO_FORMAT });
    }

    socket.on('open', () => {
      socket.send(
        JSON.stringify({
          header: {
            action: 'run-task',
            task_id: taskId,
            streaming: 'duplex',
          },
          payload: {
            task_group: 'audio',
            task: 'tts',
            function: 'SpeechSynthesizer',
            model: config.modelId || COSYVOICE_TTS_MODEL_ID,
            parameters: {
              text_type: 'PlainText',
              voice: config.voice,
              format: AUDIO_FORMAT,
              sample_rate: 24000,
              volume: 50,
              rate: 1,
              pitch: 1,
              enable_ssml: false,
            },
            input: {},
          },
        }),
      );
    });

    socket.on('message', (data, isBinary) => {
      if (isBinary) {
        audioChunks.push(rawDataToBuffer(data));
        return;
      }

      let message: CosyVoiceServerMessage;
      try {
        message = JSON.parse(rawDataToBuffer(data).toString('utf8')) as CosyVoiceServerMessage;
      } catch {
        fail(new CosyVoiceTTSError('阿里云语音合成返回了无法识别的消息。', 'INVALID_MESSAGE'));
        return;
      }

      const event = message.header?.event;
      if (event === 'task-started') {
        if (taskStarted) return;
        taskStarted = true;
        socket.send(
          JSON.stringify({
            header: {
              action: 'continue-task',
              task_id: taskId,
              streaming: 'duplex',
            },
            payload: { input: { text } },
          }),
        );
        socket.send(
          JSON.stringify({
            header: {
              action: 'finish-task',
              task_id: taskId,
              streaming: 'duplex',
            },
            payload: { input: {} },
          }),
        );
        return;
      }

      if (event === 'task-failed') {
        fail(
          new CosyVoiceTTSError(
            message.header?.error_message || '阿里云语音合成任务失败。',
            message.header?.error_code || 'TASK_FAILED',
          ),
        );
        return;
      }

      if (event === 'task-finished') succeed();
    });

    socket.on('error', (error) => {
      fail(new CosyVoiceTTSError(`阿里云语音合成连接失败：${error.message}`, 'SOCKET_ERROR'));
    });

    socket.on('close', (code, reason) => {
      if (settled) return;
      const detail = reason.toString('utf8');
      fail(
        new CosyVoiceTTSError(
          `阿里云语音合成连接提前关闭（${code}${detail ? `：${detail}` : ''}）。`,
          'SOCKET_CLOSED',
        ),
      );
    });
  });
}
