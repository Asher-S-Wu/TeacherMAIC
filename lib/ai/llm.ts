/**
 * Unified LLM Call Layer
 *
 * Text generation goes through provider-specific Chat Completions APIs.
 */

import { createLogger } from '@/lib/logger';
import { ARK_CHAT_COMPLETIONS_PATH } from './ark-models';
import { GEMINI_CHAT_COMPLETIONS_PATH } from './gemini-models';
import {
  GEMINI_PROVIDER_ID,
  OFFICIAL_GEMINI_3_1_FLASH_LITE_PREVIEW_MODEL_ID,
  OFFICIAL_GEMINI_3_FLASH_PREVIEW_MODEL_ID,
  OFFICIAL_GEMINI_3_1_PRO_PREVIEW_CUSTOM_TOOLS_MODEL_ID,
} from './providers';
import type { ChatCompletionsModel } from './providers';
import type { ThinkingConfig, ThinkingEffort } from '@/lib/types/provider';

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

/**
 * Options for LLM call retry on validation failure.
 * This is separate from request transport errors.
 */
export interface LLMRetryOptions {
  /** Max retry attempts when validate() fails or the response is empty (default: 0 = no retry) */
  retries?: number;
  /** Custom validation function. Return true to accept the result, false to retry. */
  validate?: (text: string) => boolean;
}

type ChatTextPart = { type: 'text'; text: string };
type ChatImagePart = { type: 'image_url'; image_url: { url: string; detail: 'high' } };
type ChatContentPart = ChatTextPart | ChatImagePart;
type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string | ChatContentPart[];
};

interface ChatCompletionsBody {
  model: string;
  messages: ChatMessage[];
  stream: boolean;
  max_tokens: number;
  thinking?: { type: 'enabled' | 'disabled' };
  reasoning_effort?: Extract<ThinkingEffort, 'minimal' | 'low' | 'medium' | 'high'>;
}

const DEFAULT_VALIDATE = (text: string) => text.trim().length > 0;

function isGeminiOpenAICompatibleProvider(model: ChatCompletionsModel): boolean {
  return model.providerType === 'gemini-openai-chat-completions';
}

function isArkChatCompletionsProvider(model: ChatCompletionsModel): boolean {
  return model.providerType === 'ark-chat-completions';
}

const OFFICIAL_GEMINI_REASONING_MODEL_IDS = new Set([
  OFFICIAL_GEMINI_3_1_FLASH_LITE_PREVIEW_MODEL_ID,
  OFFICIAL_GEMINI_3_FLASH_PREVIEW_MODEL_ID,
  OFFICIAL_GEMINI_3_1_PRO_PREVIEW_CUSTOM_TOOLS_MODEL_ID,
]);

function isOfficialGeminiReasoningModel(model: ChatCompletionsModel): boolean {
  return (
    model.providerId === GEMINI_PROVIDER_ID &&
    OFFICIAL_GEMINI_REASONING_MODEL_IDS.has(model.modelId)
  );
}

function getChatCompletionsUrl(model: ChatCompletionsModel): string {
  const path = isGeminiOpenAICompatibleProvider(model)
    ? GEMINI_CHAT_COMPLETIONS_PATH
    : ARK_CHAT_COMPLETIONS_PATH;
  return `${model.baseUrl.replace(/\/$/, '')}${path}`;
}

function getMaxOutputTokens(params: LLMGenerateParams): number {
  return params.maxOutputTokens ?? params.model.modelInfo?.outputWindow ?? 128000;
}

function getArkThinkingType(config?: ThinkingConfig): 'enabled' | 'disabled' {
  void config;
  return 'disabled';
}

function getReasoningEffort(
  config?: ThinkingConfig,
): Extract<ThinkingEffort, 'minimal' | 'low' | 'medium' | 'high'> {
  if (
    config?.mode === 'disabled' ||
    config?.enabled === false ||
    config?.effort === 'none'
  ) {
    return 'minimal';
  }
  if (
    config?.effort === 'minimal' ||
    config?.effort === 'low' ||
    config?.effort === 'medium' ||
    config?.effort === 'high'
  ) {
    return config.effort;
  }
  return 'high';
}

function shouldSendOfficialGeminiReasoning(
  model: ChatCompletionsModel,
  config?: ThinkingConfig,
): boolean {
  if (!isOfficialGeminiReasoningModel(model)) return false;
  return !(
    config?.mode === 'disabled' ||
    config?.enabled === false ||
    config?.effort === 'none'
  );
}

function imageToUrl(part: ImagePart): string {
  if (part.image.startsWith('http://') || part.image.startsWith('https://')) {
    return part.image;
  }
  if (part.image.startsWith('data:')) {
    return part.image;
  }
  const mimeType = part.mimeType || 'image/png';
  return `data:${mimeType};base64,${part.image}`;
}

function contentToPlainText(content: MessageContent): string {
  if (typeof content === 'string') return content;
  return content
    .filter((part): part is TextPart => part.type === 'text')
    .map((part) => part.text)
    .join('\n');
}

function contentToChatContent(content: MessageContent): string | ChatContentPart[] {
  if (typeof content === 'string') return content;
  return content.map((part) => {
    if (part.type === 'text') {
      return { type: 'text', text: part.text } satisfies ChatTextPart;
    }
    return {
      type: 'image_url',
      image_url: {
        url: imageToUrl(part),
        detail: 'high',
      },
    } satisfies ChatImagePart;
  });
}

function buildMessages(params: LLMGenerateParams): ChatMessage[] {
  const messages: ChatMessage[] = [];

  if (params.system?.trim()) {
    messages.push({ role: 'system', content: params.system });
  }

  for (const message of params.messages ?? []) {
    messages.push({
      role: message.role,
      content:
        message.role === 'system'
          ? contentToPlainText(message.content)
          : contentToChatContent(message.content),
    });
  }

  if (params.prompt !== undefined) {
    messages.push({ role: 'user', content: params.prompt });
  }

  if (messages.length === 0) {
    throw new Error('LLM request missing input');
  }

  return messages;
}

function buildChatCompletionsBody(
  params: LLMGenerateParams,
  thinking?: ThinkingConfig,
  stream = false,
): ChatCompletionsBody {
  const body: ChatCompletionsBody = {
    model: params.model.modelId,
    messages: buildMessages(params),
    stream,
    max_tokens: getMaxOutputTokens(params),
  };

  if (isArkChatCompletionsProvider(params.model)) {
    const thinkingType = getArkThinkingType(thinking);
    body.thinking = { type: thinkingType };
    if (thinkingType === 'enabled') {
      body.reasoning_effort = getReasoningEffort(thinking);
    }
  }

  if (isGeminiOpenAICompatibleProvider(params.model)) {
    const includeReasoning = shouldSendOfficialGeminiReasoning(params.model, thinking);
    if (includeReasoning) {
      body.reasoning_effort = getReasoningEffort(thinking);
    }
  }

  return body;
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

async function requestChatCompletions(
  params: LLMGenerateParams,
  source: string,
  thinking: ThinkingConfig | undefined,
  stream: boolean,
): Promise<Response> {
  const body = buildChatCompletionsBody(params, thinking, stream);
  let response: Response;
  try {
    response = await fetch(getChatCompletionsUrl(params.model), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.model.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: params.abortSignal,
    });
  } catch (error) {
    throw new LLMTransportError(
      `Chat Completions request failed [${source}, model=${params.model.modelId}]: ${describeError(error)}`,
      error,
    );
  }

  if (!response.ok) {
    const message = await readProviderError(response);
    throw new Error(
      `Chat Completions API failed [${source}, model=${params.model.modelId}, status=${response.status}]: ${message}`,
    );
  }

  return response;
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';

  return content
    .map((part) => {
      if (!isRecord(part)) return '';
      if (typeof part.text === 'string') return part.text;
      return '';
    })
    .join('');
}

function extractTextFromChatCompletion(payload: unknown): string {
  if (!isRecord(payload)) return '';
  const choices = payload.choices;
  if (!Array.isArray(choices)) return '';
  const first = choices[0];
  if (!isRecord(first)) return '';
  const message = first.message;
  if (!isRecord(message)) return '';
  return extractTextFromContent(message.content);
}

function getSseData(block: string): string {
  return block
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n');
}

function extractTextDelta(eventPayload: unknown): string {
  if (!isRecord(eventPayload)) return '';
  const choices = eventPayload.choices;
  if (!Array.isArray(choices)) return '';

  return choices
    .map((choice) => {
      if (!isRecord(choice)) return '';
      const delta = choice.delta;
      if (!isRecord(delta)) return '';
      return extractTextFromContent(delta.content);
    })
    .join('');
}

async function* streamChatCompletionsText(
  params: LLMStreamParams,
  source: string,
  thinking?: ThinkingConfig,
): AsyncIterable<string> {
  const response = await requestChatCompletions(params, source, thinking, true);
  if (!response.body) {
    throw new Error(`Chat Completions API returned an empty stream [${source}]`);
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
          const delta = extractTextDelta(parsed);
          if (delta) yield delta;
        }

        separatorIndex = buffer.indexOf('\n\n');
      }

      if (done) break;
    }

    const tail = getSseData(buffer);
    if (tail && tail !== '[DONE]') {
      const parsed = JSON.parse(tail) as unknown;
      const delta = extractTextDelta(parsed);
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
      const response = await requestChatCompletions(params, source, thinking, false);
      const payload = (await response.json()) as unknown;
      const result: LLMTextResult = {
        text: extractTextFromChatCompletion(payload),
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
  return { textStream: streamChatCompletionsText(params, source, thinking) };
}
