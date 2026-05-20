/**
 * Unified LLM Call Layer
 *
 * Text generation uses the Gemini native GenerateContent API.
 */

import { createLogger } from '@/lib/logger';
import type { ChatCompletionsModel } from './providers';
import type { ThinkingConfig, ThinkingLevel } from '@/lib/types/provider';

const log = createLogger('LLM');

export type { ThinkingConfig } from '@/lib/types/provider';

type TextPart = { type: 'text'; text: string };
type ImagePart = { type: 'image'; image: string; mimeType?: string };
type MessageContent = string | Array<TextPart | ImagePart>;
type LLMMessage = { role: 'system' | 'user' | 'assistant'; content: MessageContent };

export interface LLMGenerateParams {
  model: ChatCompletionsModel;
  system?: string;
  prompt?: string;
  messages?: LLMMessage[];
  maxOutputTokens?: number;
  abortSignal?: AbortSignal;
}

export type LLMStreamParams = LLMGenerateParams;

export interface LLMTextResult {
  text: string;
  rawResponse: unknown;
}

export class LLMTransportError extends Error {
  cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'LLMTransportError';
    this.cause = cause;
  }
}

export interface LLMStreamResult {
  textStream: AsyncIterable<string>;
}

export interface LLMRetryOptions {
  retries?: number;
  validate?: (text: string) => boolean;
}

type GeminiTextPart = { text: string };
type GeminiInlineDataPart = { inlineData: { mimeType: string; data: string } };
type GeminiPart = GeminiTextPart | GeminiInlineDataPart;
type GeminiContent = {
  role: 'user' | 'model';
  parts: GeminiPart[];
};

interface GeminiGenerateContentBody {
  contents: GeminiContent[];
  systemInstruction?: { parts: GeminiTextPart[] };
  generationConfig: {
    maxOutputTokens: number;
    thinkingConfig?: { thinkingLevel: ThinkingLevel };
  };
}

const DEFAULT_VALIDATE = (text: string) => text.trim().length > 0;

function getTextGenerationUrl(model: ChatCompletionsModel, stream: boolean): string {
  const action = stream ? 'streamGenerateContent?alt=sse' : 'generateContent';
  return `${model.baseUrl.replace(/\/$/, '')}/${model.modelId}:${action}`;
}

function getMaxOutputTokens(params: LLMGenerateParams): number {
  return params.maxOutputTokens ?? params.model.modelInfo?.outputWindow ?? 128000;
}

function getGeminiThinkingLevel(_config?: ThinkingConfig): ThinkingLevel {
  return 'high';
}

function shouldSendGeminiThinking(config?: ThinkingConfig): boolean {
  return !(
    config?.mode === 'disabled' ||
    config?.enabled === false ||
    config?.effort === 'none'
  );
}

function imageToGeminiInlineData(part: ImagePart): GeminiInlineDataPart {
  const dataUriMatch = part.image.match(/^data:([^;]+);base64,(.+)$/);
  if (dataUriMatch) {
    return {
      inlineData: {
        mimeType: dataUriMatch[1],
        data: dataUriMatch[2],
      },
    };
  }

  if (part.image.startsWith('http://') || part.image.startsWith('https://')) {
    throw new Error('Gemini 原生接口只支持内嵌图片数据');
  }

  return {
    inlineData: {
      mimeType: part.mimeType || 'image/png',
      data: part.image,
    },
  };
}

function contentToPlainText(content: MessageContent): string {
  if (typeof content === 'string') return content;
  return content
    .filter((part): part is TextPart => part.type === 'text')
    .map((part) => part.text)
    .join('\n');
}

function contentToGeminiParts(content: MessageContent): GeminiPart[] {
  if (typeof content === 'string') return [{ text: content }];
  return content.map((part) =>
    part.type === 'text' ? { text: part.text } : imageToGeminiInlineData(part),
  );
}

function buildGeminiContents(params: LLMGenerateParams): {
  contents: GeminiContent[];
  systemInstruction?: { parts: GeminiTextPart[] };
} {
  const contents: GeminiContent[] = [];
  const systemParts: GeminiTextPart[] = [];

  if (params.system?.trim()) {
    systemParts.push({ text: params.system });
  }

  for (const message of params.messages ?? []) {
    if (message.role === 'system') {
      const text = contentToPlainText(message.content);
      if (text.trim()) {
        systemParts.push({ text });
      }
      continue;
    }

    contents.push({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: contentToGeminiParts(message.content),
    });
  }

  if (params.prompt !== undefined) {
    contents.push({
      role: 'user',
      parts: [{ text: params.prompt }],
    });
  }

  if (contents.length === 0) {
    throw new Error('LLM request missing input');
  }

  return {
    contents,
    ...(systemParts.length > 0 ? { systemInstruction: { parts: systemParts } } : {}),
  };
}

function buildGeminiGenerateContentBody(
  params: LLMGenerateParams,
  thinking?: ThinkingConfig,
): GeminiGenerateContentBody {
  const content = buildGeminiContents(params);
  const generationConfig: GeminiGenerateContentBody['generationConfig'] = {
    maxOutputTokens: getMaxOutputTokens(params),
  };

  if (shouldSendGeminiThinking(thinking)) {
    generationConfig.thinkingConfig = {
      thinkingLevel: getGeminiThinkingLevel(thinking),
    };
  }

  return {
    ...content,
    generationConfig,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function getErrorCode(error: unknown): string | undefined {
  if (!isRecord(error)) return undefined;
  const code = error.code;
  return typeof code === 'string' || typeof code === 'number' ? String(code) : undefined;
}

function getErrorCause(error: unknown): unknown {
  if (!isRecord(error)) return undefined;
  return error.cause;
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    const parts = [error.name !== 'Error' ? error.name : '', error.message].filter(Boolean);
    const code = getErrorCode(error);
    if (code) parts.push(`code=${code}`);

    const cause = getErrorCause(error);
    if (cause) {
      parts.push(`cause=${describeError(cause)}`);
    }

    return parts.join(': ');
  }

  if (isRecord(error)) {
    const code = getErrorCode(error);
    const message = typeof error.message === 'string' ? error.message : JSON.stringify(error);
    return code ? `${message}: code=${code}` : message;
  }

  return String(error);
}

async function readProviderError(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  if (!text) return `${response.status} ${response.statusText}`;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (isRecord(parsed)) {
      const error = parsed.error;
      if (isRecord(error) && typeof error.message === 'string') return error.message;
      if (typeof parsed.message === 'string') return parsed.message;
    }
  } catch {
    // Return raw text below.
  }
  return text;
}

async function requestTextGeneration(
  params: LLMGenerateParams,
  source: string,
  thinking: ThinkingConfig | undefined,
  stream: boolean,
): Promise<Response> {
  const body = buildGeminiGenerateContentBody(params, thinking);
  let response: Response;

  try {
    response = await fetch(getTextGenerationUrl(params.model, stream), {
      method: 'POST',
      headers: {
        'x-goog-api-key': params.model.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: params.abortSignal,
    });
  } catch (error) {
    throw new LLMTransportError(
      `LLM request failed [${source}, model=${params.model.modelId}]: ${describeError(error)}`,
      error,
    );
  }

  if (!response.ok) {
    const message = await readProviderError(response);
    throw new Error(
      `LLM API failed [${source}, model=${params.model.modelId}, status=${response.status}]: ${message}`,
    );
  }

  return response;
}

function extractTextFromGeminiResponse(payload: unknown): string {
  if (!isRecord(payload)) return '';
  const candidates = payload.candidates;
  if (!Array.isArray(candidates)) return '';

  return candidates
    .map((candidate) => {
      if (!isRecord(candidate)) return '';
      const content = candidate.content;
      if (!isRecord(content)) return '';
      const parts = content.parts;
      if (!Array.isArray(parts)) return '';

      return parts
        .map((part) => {
          if (!isRecord(part) || part.thought === true) return '';
          return typeof part.text === 'string' ? part.text : '';
        })
        .join('');
    })
    .join('');
}

function getSseData(block: string): string {
  return block
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n');
}

async function* streamTextGeneration(
  params: LLMStreamParams,
  source: string,
  thinking?: ThinkingConfig,
): AsyncIterable<string> {
  const response = await requestTextGeneration(params, source, thinking, true);
  if (!response.body) {
    throw new Error(`LLM API returned an empty stream [${source}]`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (value) {
        buffer += decoder.decode(value, { stream: !done });
        buffer = buffer.replace(/\r\n/g, '\n');
      }
      if (done) {
        buffer += decoder.decode();
        buffer = buffer.replace(/\r\n/g, '\n');
      }

      let separatorIndex = buffer.indexOf('\n\n');
      while (separatorIndex >= 0) {
        const block = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);

        const data = getSseData(block);
        if (data && data !== '[DONE]') {
          const parsed = JSON.parse(data) as unknown;
          const delta = extractTextFromGeminiResponse(parsed);
          if (delta) yield delta;
        }

        separatorIndex = buffer.indexOf('\n\n');
      }

      if (done) break;
    }

    const tail = getSseData(buffer);
    if (tail && tail !== '[DONE]') {
      const parsed = JSON.parse(tail) as unknown;
      const delta = extractTextFromGeminiResponse(parsed);
      if (delta) yield delta;
    }
  } finally {
    reader.releaseLock();
  }
}

export async function callLLM<T extends LLMGenerateParams>(
  params: T,
  source: string,
  retryOptions?: LLMRetryOptions,
  thinking?: ThinkingConfig,
): Promise<LLMTextResult> {
  const maxAttempts = (retryOptions?.retries ?? 0) + 1;
  const validate = retryOptions?.validate ?? (maxAttempts > 1 ? DEFAULT_VALIDATE : undefined);

  let lastResult: LLMTextResult | undefined;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await requestTextGeneration(params, source, thinking, false);
      const payload = (await response.json()) as unknown;
      const result: LLMTextResult = {
        text: extractTextFromGeminiResponse(payload),
        rawResponse: payload,
      };

      if (validate && !validate(result.text)) {
        log.warn(
          `[${source}] Validation failed (attempt ${attempt}/${maxAttempts}), ${attempt < maxAttempts ? 'retrying...' : 'giving up'}`,
        );
        lastResult = result;
        continue;
      }

      return result;
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        log.warn(`[${source}] Call failed (attempt ${attempt}/${maxAttempts}), retrying...`, error);
        continue;
      }
    }
  }

  if (lastResult) return lastResult;
  throw lastError;
}

export function streamLLM<T extends LLMStreamParams>(
  params: T,
  source: string,
  thinking?: ThinkingConfig,
): LLMStreamResult {
  return { textStream: streamTextGeneration(params, source, thinking) };
}

export async function collectStreamLLMText<T extends LLMStreamParams>(
  params: T,
  source: string,
  thinking?: ThinkingConfig,
): Promise<string> {
  let text = '';
  for await (const chunk of streamTextGeneration(params, source, thinking)) {
    text += chunk;
  }
  return text;
}
