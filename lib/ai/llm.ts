/**
 * Unified LLM Call Layer
 *
 * Text generation goes through provider-specific APIs.
 */

import { createLogger } from '@/lib/logger';
import { ARK_CHAT_COMPLETIONS_PATH } from './ark-models';
import {
  GEMINI_PROVIDER_ID,
  OFFICIAL_GEMINI_3_1_FLASH_LITE_PREVIEW_MODEL_ID,
  OFFICIAL_GEMINI_3_FLASH_PREVIEW_MODEL_ID,
  OFFICIAL_GEMINI_3_1_PRO_PREVIEW_CUSTOM_TOOLS_MODEL_ID,
} from './providers';
import type { ChatCompletionsModel } from './providers';
import type { ThinkingConfig, ThinkingEffort, ThinkingLevel } from '@/lib/types/provider';

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

type ArkChatTextPart = { type: 'text'; text: string };
type ArkChatImagePart = { type: 'image_url'; image_url: { url: string; detail: 'high' } };
type ArkChatContentPart = ArkChatTextPart | ArkChatImagePart;
type ArkChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string | ArkChatContentPart[];
};

interface ArkChatCompletionsBody {
  model: string;
  messages: ArkChatMessage[];
  stream: boolean;
  max_tokens: number;
  thinking?: { type: 'enabled' | 'disabled' };
  reasoning_effort?: Extract<ThinkingEffort, 'minimal' | 'low' | 'medium' | 'high'>;
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

function isGeminiNativeProvider(model: ChatCompletionsModel): boolean {
  return model.providerType === 'gemini-generate-content';
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

function getTextGenerationUrl(model: ChatCompletionsModel, stream: boolean): string {
  if (isGeminiNativeProvider(model)) {
    const action = stream ? 'streamGenerateContent?alt=sse' : 'generateContent';
    return `${model.baseUrl.replace(/\/$/, '')}/${model.modelId}:${action}`;
  }
  return `${model.baseUrl.replace(/\/$/, '')}${ARK_CHAT_COMPLETIONS_PATH}`;
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

function getGeminiThinkingLevel(config?: ThinkingConfig): ThinkingLevel {
  if (
    config?.level === 'minimal' ||
    config?.level === 'low' ||
    config?.level === 'medium' ||
    config?.level === 'high'
  ) {
    return config.level;
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

function imageToArkUrl(part: ImagePart): string {
  if (part.image.startsWith('http://') || part.image.startsWith('https://')) {
    return part.image;
  }
  if (part.image.startsWith('data:')) {
    return part.image;
  }
  const mimeType = part.mimeType || 'image/png';
  return `data:${mimeType};base64,${part.image}`;
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

function contentToArkChatContent(content: MessageContent): string | ArkChatContentPart[] {
  if (typeof content === 'string') return content;
  return content.map((part) => {
    if (part.type === 'text') {
      return { type: 'text', text: part.text } satisfies ArkChatTextPart;
    }
    return {
      type: 'image_url',
      image_url: {
        url: imageToArkUrl(part),
        detail: 'high',
      },
    } satisfies ArkChatImagePart;
  });
}

function contentToGeminiParts(content: MessageContent): GeminiPart[] {
  if (typeof content === 'string') return [{ text: content }];
  return content.map((part) =>
    part.type === 'text' ? { text: part.text } : imageToGeminiInlineData(part),
  );
}

function buildArkMessages(params: LLMGenerateParams): ArkChatMessage[] {
  const messages: ArkChatMessage[] = [];

  if (params.system?.trim()) {
    messages.push({ role: 'system', content: params.system });
  }

  for (const message of params.messages ?? []) {
    messages.push({
      role: message.role,
      content:
        message.role === 'system'
          ? contentToPlainText(message.content)
          : contentToArkChatContent(message.content),
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

function buildArkChatCompletionsBody(
  params: LLMGenerateParams,
  thinking?: ThinkingConfig,
  stream = false,
): ArkChatCompletionsBody {
  const body: ArkChatCompletionsBody = {
    model: params.model.modelId,
    messages: buildArkMessages(params),
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

  return body;
}

function buildGeminiGenerateContentBody(
  params: LLMGenerateParams,
  thinking?: ThinkingConfig,
): GeminiGenerateContentBody {
  const content = buildGeminiContents(params);
  const generationConfig: GeminiGenerateContentBody['generationConfig'] = {
    maxOutputTokens: getMaxOutputTokens(params),
  };

  if (shouldSendOfficialGeminiReasoning(params.model, thinking)) {
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
  const body = isGeminiNativeProvider(params.model)
    ? buildGeminiGenerateContentBody(params, thinking)
    : buildArkChatCompletionsBody(params, thinking, stream);
  const headers = isGeminiNativeProvider(params.model)
    ? {
        'x-goog-api-key': params.model.apiKey,
        'Content-Type': 'application/json',
      }
    : {
        Authorization: `Bearer ${params.model.apiKey}`,
        'Content-Type': 'application/json',
      };
  let response: Response;
  try {
    response = await fetch(getTextGenerationUrl(params.model, stream), {
      method: 'POST',
      headers,
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

function extractTextFromArkChatCompletion(payload: unknown): string {
  if (!isRecord(payload)) return '';
  const choices = payload.choices;
  if (!Array.isArray(choices)) return '';
  const first = choices[0];
  if (!isRecord(first)) return '';
  const message = first.message;
  if (!isRecord(message)) return '';
  return extractTextFromContent(message.content);
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

function extractTextFromProviderResponse(model: ChatCompletionsModel, payload: unknown): string {
  return isGeminiNativeProvider(model)
    ? extractTextFromGeminiResponse(payload)
    : extractTextFromArkChatCompletion(payload);
}

function getSseData(block: string): string {
  return block
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n');
}

function extractArkTextDelta(eventPayload: unknown): string {
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

function extractStreamTextDelta(model: ChatCompletionsModel, payload: unknown): string {
  return isGeminiNativeProvider(model)
    ? extractTextFromGeminiResponse(payload)
    : extractArkTextDelta(payload);
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
          const delta = extractStreamTextDelta(params.model, parsed);
          if (delta) yield delta;
        }

        separatorIndex = buffer.indexOf('\n\n');
      }

      if (done) break;
    }

    const tail = getSseData(buffer);
    if (tail && tail !== '[DONE]') {
      const parsed = JSON.parse(tail) as unknown;
      const delta = extractStreamTextDelta(params.model, parsed);
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
        text: extractTextFromProviderResponse(params.model, payload),
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
