/**
 * Unified LLM Call Layer
 *
 * Text generation goes through provider-specific APIs.
 */

import { createLogger } from '@/lib/logger';
import { ARK_RESPONSES_PATH } from './ark-models';
import { DEEPSEEK_CHAT_COMPLETIONS_PATH, DEEPSEEK_PROVIDER_ID } from './providers';
import type { ArkResponsesModel } from './providers';
import type { ThinkingConfig, ThinkingEffort } from '@/lib/types/provider';

const log = createLogger('LLM');

export type { ThinkingConfig } from '@/lib/types/provider';

type TextPart = { type: 'text'; text: string };
type ImagePart = { type: 'image'; image: string; mimeType?: string };
type MessageContent = string | Array<TextPart | ImagePart>;
type LLMMessage = { role: 'system' | 'user' | 'assistant'; content: MessageContent };

export interface LLMGenerateParams {
  model: ArkResponsesModel;
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

type ArkInputTextPart = { type: 'input_text'; text: string };
type ArkOutputTextPart = { type: 'output_text'; text: string };
type ArkInputImagePart = { type: 'input_image'; image_url: string; detail: 'high' };
type ArkInputPart = ArkInputTextPart | ArkOutputTextPart | ArkInputImagePart;
type ArkInputItem = {
  role: 'user' | 'assistant';
  content: ArkInputPart[];
};

interface ResponsesBody {
  model: string;
  input: ArkInputItem[];
  stream: boolean;
  instructions?: string;
  max_output_tokens: number;
  thinking?: { type: 'enabled' | 'disabled' };
}

type ChatCompletionMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

interface ChatCompletionsBody {
  model: string;
  messages: ChatCompletionMessage[];
  stream: boolean;
  max_tokens: number;
  thinking: { type: 'enabled' | 'disabled' };
  reasoning_effort?: ThinkingEffort;
}

const DEFAULT_VALIDATE = (text: string) => text.trim().length > 0;

function isDeepSeekProvider(model: ArkResponsesModel): boolean {
  return model.providerId === DEEPSEEK_PROVIDER_ID;
}

function getArkResponsesUrl(model: ArkResponsesModel): string {
  return `${model.baseUrl.replace(/\/$/, '')}${ARK_RESPONSES_PATH}`;
}

function getDeepSeekChatCompletionsUrl(model: ArkResponsesModel): string {
  return `${model.baseUrl.replace(/\/$/, '')}${DEEPSEEK_CHAT_COMPLETIONS_PATH}`;
}

function getMaxOutputTokens(params: LLMGenerateParams): number {
  if (isDeepSeekProvider(params.model)) {
    return params.model.modelInfo?.outputWindow ?? 384000;
  }
  return params.maxOutputTokens ?? params.model.modelInfo?.outputWindow ?? 128000;
}

function getArkThinkingType(config?: ThinkingConfig): 'enabled' | 'disabled' {
  if (config?.mode === 'disabled' || config?.enabled === false) return 'disabled';
  return 'enabled';
}

function getDeepSeekThinkingType(config?: ThinkingConfig): 'enabled' | 'disabled' {
  if (config?.mode === 'disabled' || config?.enabled === false || config?.effort === 'none') {
    return 'disabled';
  }
  return 'enabled';
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

function contentToArkParts(role: 'user' | 'assistant', content: MessageContent): ArkInputPart[] {
  if (typeof content === 'string') {
    return [
      role === 'assistant'
        ? { type: 'output_text', text: content }
        : { type: 'input_text', text: content },
    ];
  }

  return content.map((part) => {
    if (part.type === 'text') {
      return role === 'assistant'
        ? ({ type: 'output_text', text: part.text } as ArkOutputTextPart)
        : ({ type: 'input_text', text: part.text } as ArkInputTextPart);
    }
    return {
      type: 'input_image',
      image_url: imageToUrl(part),
      detail: 'high',
    } as ArkInputImagePart;
  });
}

function buildResponsesBody(
  params: LLMGenerateParams,
  thinking?: ThinkingConfig,
  stream = false,
): ResponsesBody {
  const instructions: string[] = [];
  const input: ArkInputItem[] = [];

  if (params.system?.trim()) {
    instructions.push(params.system);
  }

  for (const message of params.messages ?? []) {
    if (message.role === 'system') {
      const systemText = contentToPlainText(message.content);
      if (systemText.trim()) instructions.push(systemText);
      continue;
    }
    input.push({
      role: message.role,
      content: contentToArkParts(message.role, message.content),
    });
  }

  if (params.prompt !== undefined) {
    input.push({
      role: 'user',
      content: [{ type: 'input_text', text: params.prompt }],
    });
  }

  if (input.length === 0) {
    throw new Error('LLM request missing input');
  }

  const body: ResponsesBody = {
    model: params.model.modelId,
    input,
    stream,
    ...(instructions.length > 0 ? { instructions: instructions.join('\n\n') } : {}),
    max_output_tokens: getMaxOutputTokens(params),
    thinking: { type: getArkThinkingType(thinking) },
  };

  return body;
}

function buildChatCompletionMessages(params: LLMGenerateParams): ChatCompletionMessage[] {
  const messages: ChatCompletionMessage[] = [];

  if (params.system?.trim()) {
    messages.push({ role: 'system', content: params.system });
  }

  for (const message of params.messages ?? []) {
    const content = contentToPlainText(message.content);
    if (!content.trim()) continue;
    messages.push({ role: message.role, content });
  }

  if (params.prompt !== undefined) {
    messages.push({ role: 'user', content: params.prompt });
  }

  if (messages.length === 0) {
    throw new Error('LLM request missing input');
  }

  return messages;
}

function buildDeepSeekChatCompletionsBody(
  params: LLMGenerateParams,
  thinking?: ThinkingConfig,
  stream = false,
): ChatCompletionsBody {
  const thinkingType = getDeepSeekThinkingType(thinking);

  return {
    model: params.model.modelId,
    messages: buildChatCompletionMessages(params),
    stream,
    max_tokens: getMaxOutputTokens(params),
    thinking: { type: thinkingType },
    ...(thinkingType === 'enabled' && thinking?.effort ? { reasoning_effort: thinking.effort } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
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

async function requestArkResponses(
  params: LLMGenerateParams,
  source: string,
  thinking: ThinkingConfig | undefined,
  stream: boolean,
): Promise<Response> {
  const body = buildResponsesBody(params, thinking, stream);
  const response = await fetch(getArkResponsesUrl(params.model), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.model.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: params.abortSignal,
  });

  if (!response.ok) {
    const message = await readProviderError(response);
    throw new Error(
      `Ark Responses API failed [${source}, model=${params.model.modelId}, status=${response.status}]: ${message}`,
    );
  }

  return response;
}

async function requestDeepSeekChatCompletions(
  params: LLMGenerateParams,
  source: string,
  thinking: ThinkingConfig | undefined,
  stream: boolean,
): Promise<Response> {
  const body = buildDeepSeekChatCompletionsBody(params, thinking, stream);
  const response = await fetch(getDeepSeekChatCompletionsUrl(params.model), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.model.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: params.abortSignal,
  });

  if (!response.ok) {
    const message = await readProviderError(response);
    throw new Error(
      `DeepSeek Chat Completions API failed [${source}, model=${params.model.modelId}, status=${response.status}]: ${message}`,
    );
  }

  return response;
}

async function requestLLMResponse(
  params: LLMGenerateParams,
  source: string,
  thinking: ThinkingConfig | undefined,
  stream: boolean,
): Promise<Response> {
  if (isDeepSeekProvider(params.model)) {
    return requestDeepSeekChatCompletions(params, source, thinking, stream);
  }
  return requestArkResponses(params, source, thinking, stream);
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';

  return content
    .map((part) => {
      if (!isRecord(part)) return '';
      const partType = typeof part.type === 'string' ? part.type : '';
      if (partType && partType !== 'output_text' && partType !== 'text') return '';
      if (typeof part.text === 'string') return part.text;
      if (typeof part.content === 'string') return part.content;
      return '';
    })
    .join('');
}

function extractTextFromResponse(payload: unknown): string {
  if (!isRecord(payload)) return '';
  if (typeof payload.output_text === 'string') return payload.output_text;

  const output = payload.output;
  if (!Array.isArray(output)) return '';

  return output
    .map((item) => {
      if (!isRecord(item)) return '';
      const itemType = typeof item.type === 'string' ? item.type : '';
      if (itemType && itemType !== 'message' && itemType !== 'output_text') return '';
      if (typeof item.text === 'string') return item.text;
      if (typeof item.content === 'string') return item.content;
      return extractTextFromContent(item.content);
    })
    .join('');
}

function extractTextFromChatCompletionResponse(payload: unknown): string {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) return '';
  const firstChoice = payload.choices[0];
  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) return '';
  return typeof firstChoice.message.content === 'string' ? firstChoice.message.content : '';
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
  const eventType = typeof eventPayload.type === 'string' ? eventPayload.type : '';
  const isTextDelta =
    eventType === 'response.output_text.delta' || eventType.endsWith('.output_text.delta');
  if (isTextDelta && typeof eventPayload.delta === 'string') return eventPayload.delta;
  if (eventType && !isTextDelta) return '';
  if (typeof eventPayload.delta === 'string') return eventPayload.delta;
  const delta = eventPayload.delta;
  if (isRecord(delta) && typeof delta.text === 'string') return delta.text;
  return '';
}

function extractChatCompletionDelta(eventPayload: unknown): string {
  if (!isRecord(eventPayload) || !Array.isArray(eventPayload.choices)) return '';
  const firstChoice = eventPayload.choices[0];
  if (!isRecord(firstChoice) || !isRecord(firstChoice.delta)) return '';
  return typeof firstChoice.delta.content === 'string' ? firstChoice.delta.content : '';
}

async function* streamArkText(
  params: LLMStreamParams,
  source: string,
  thinking?: ThinkingConfig,
): AsyncIterable<string> {
  const response = await requestArkResponses(params, source, thinking, true);
  if (!response.body) {
    throw new Error(`Ark Responses API returned an empty stream [${source}]`);
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

async function* streamDeepSeekText(
  params: LLMStreamParams,
  source: string,
): AsyncIterable<string> {
  const response = await requestDeepSeekChatCompletions(params, source, true);
  if (!response.body) {
    throw new Error(`DeepSeek Chat Completions API returned an empty stream [${source}]`);
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
          const delta = extractChatCompletionDelta(parsed);
          if (delta) yield delta;
        }

        separatorIndex = buffer.indexOf('\n\n');
      }

      if (done) break;
    }

    const tail = getSseData(buffer);
    if (tail && tail !== '[DONE]') {
      const parsed = JSON.parse(tail) as unknown;
      const delta = extractChatCompletionDelta(parsed);
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
      const response = await requestLLMResponse(params, source, thinking, false);
      const payload = (await response.json()) as unknown;
      const result: LLMTextResult = {
        text: isDeepSeekProvider(params.model)
          ? extractTextFromChatCompletionResponse(payload)
          : extractTextFromResponse(payload),
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
  return {
    textStream: isDeepSeekProvider(params.model)
      ? streamDeepSeekText(params, source)
      : streamArkText(params, source, thinking),
  };
}
