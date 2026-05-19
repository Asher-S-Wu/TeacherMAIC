import { NextResponse } from 'next/server';

export const API_ERROR_CODES = {
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  MISSING_API_KEY: 'MISSING_API_KEY',
  INVALID_REQUEST: 'INVALID_REQUEST',
  INVALID_URL: 'INVALID_URL',
  REDIRECT_NOT_ALLOWED: 'REDIRECT_NOT_ALLOWED',
  CONTENT_SENSITIVE: 'CONTENT_SENSITIVE',
  UPSTREAM_ERROR: 'UPSTREAM_ERROR',
  GENERATION_FAILED: 'GENERATION_FAILED',
  TRANSCRIPTION_FAILED: 'TRANSCRIPTION_FAILED',
  PARSE_FAILED: 'PARSE_FAILED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

export interface ApiErrorBody {
  success: false;
  errorCode: ApiErrorCode;
  error: string;
  details?: string;
}

export function apiError(
  code: ApiErrorCode,
  status: number,
  error: string,
  details?: string,
): NextResponse<ApiErrorBody> {
  return NextResponse.json(
    {
      success: false as const,
      errorCode: code,
      error,
      ...(details ? { details } : {}),
    },
    { status },
  );
}

export function apiSuccess<T extends Record<string, unknown>>(data: T, status = 200): NextResponse {
  return NextResponse.json({ success: true, ...data }, { status });
}

type SseSendFn = (type: string, data?: Record<string, unknown>) => void;

/**
 * 创建一个 SSE 长连接响应，用心跳事件保持连接活跃。
 */
export function createSseResponse(
  run: (send: SseSendFn) => Promise<void>,
  heartbeatIntervalMs = 15000,
): Response {
  const encoder = new TextEncoder();
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  /**
   * 把事件写成浏览器可读取的 SSE data 行。
   */
  const encodeEvent = (type: string, data?: Record<string, unknown>) =>
    encoder.encode(`data: ${JSON.stringify({ type, ...(data || {}) })}\n\n`);

  /**
   * 停止心跳计时器，避免连接关闭后继续写入。
   */
  const stopHeartbeat = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  const stream = new ReadableStream({
    start(controller) {
      /**
       * 关闭 SSE 流；重复关闭或客户端已断开时直接忽略。
       */
      const closeStream = () => {
        if (closed) return;
        closed = true;
        stopHeartbeat();
        try {
          controller.close();
        } catch {
          // 客户端主动断开时，底层流可能已经关闭。
        }
      };

      /**
       * 安全发送 SSE 事件；客户端断开后不再继续写。
       */
      const send: SseSendFn = (type, data) => {
        if (closed) return;
        try {
          controller.enqueue(encodeEvent(type, data));
        } catch {
          closeStream();
        }
      };

      send('heartbeat');
      heartbeatTimer = setInterval(() => send('heartbeat'), heartbeatIntervalMs);

      void (async () => {
        try {
          await run(send);
        } catch (error) {
          send('error', {
            error: error instanceof Error ? error.message : String(error),
          });
        } finally {
          closeStream();
        }
      })();
    },
    cancel() {
      closed = true;
      stopHeartbeat();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
