/**
 * Unified LLM Call Layer
 *
 * Text generation uses Alibaba Cloud Bailian through the OpenAI-compatible Chat API.
 */

import OpenAI from 'openai';
import { createLogger } from '@/lib/logger';
import type { ChatCompletionsModel } from './providers';
import type { ThinkingConfig } from '@/lib/types/provider';

const log = createLogger('LLM');

export type { ThinkingConfig } from '@/lib/types/provider';

type TextPart = { type: 'text'; text: string };
type ImagePart = { type: 'image'; image: string; mimeType?: string };
type VideoPart = {
  type: 'video';
  video: string | string[];
  mimeType?: string;
  fps?: number;
  maxLongSidePixel?: number;
  detail?: 'low' | 'default' | 'high';
};

export type OpenAIContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'video'; video: string[] }
  | { type: 'input_audio'; input_audio: { data: string } };

export type OpenAIToolCall = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
};

export type OpenAIChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | OpenAIContentPart[] | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
  name?: string;
};

export type OpenAIChatTool = {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type LLMMessageContent = string | null | Array<TextPart | ImagePart | VideoPart | OpenAIContentPart>;
export type LLMMessage = {
  role: OpenAIChatMessage['role'];
  content: LLMMessageContent;
  toolCalls?: OpenAIToolCall[];
  toolCallId?: string;
  name?: string;
};

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

export interface LLMToolUse {
  id: string;
  name: string;
  input: unknown;
}

export interface LLMToolResult {
  toolUseId: string;
  content: string;
  isError?: boolean;
}

export type LLMToolStreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'message_history'; messages: OpenAIChatMessage[] };

export type LLMStreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'message_history'; messages: OpenAIChatMessage[] };

export interface LLMToolLoopParams extends LLMStreamParams {
  tools: OpenAIChatTool[];
  onToolUse: (toolUse: LLMToolUse) => Promise<LLMToolResult> | LLMToolResult;
  maxToolIterations?: number;
}

type ChatCompletionResponse = {
  id?: string;
  choices?: Array<{
    message?: {
      role?: 'assistant';
      content?: string | null;
      tool_calls?: OpenAIToolCall[];
    };
    finish_reason?: string | null;
  }>;
  usage?: unknown;
  code?: string;
  message?: string;
};

type ChatCompletionChunk = {
  choices?: Array<{
    delta?: {
      role?: string;
      content?: string | null;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        type?: 'function';
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: unknown;
  code?: string;
  message?: string;
};

const DEFAULT_VALIDATE = (text: string) => text.trim().length > 0;
const DEFAULT_MAX_TOOL_ITERATIONS = 16;
const clientCache = new Map<string, OpenAI>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function getOpenAIClient(model: ChatCompletionsModel): OpenAI {
  const baseURL = model.baseUrl.replace(/\/$/, '');
  const cacheKey = `${baseURL}\n${model.apiKey}`;
  const cached = clientCache.get(cacheKey);
  if (cached) return cached;

  const client = new OpenAI({
    apiKey: model.apiKey,
    baseURL,
  });
  clientCache.set(cacheKey, client);
  return client;
}

function getErrorCode(error: unknown): string | undefined {
  if (!isRecord(error)) return undefined;
  const code = error.code ?? error.status;
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

function wrapLLMError(error: unknown, source: string, modelId: string): Error {
  if (error instanceof Error && error.name === 'AbortError') return error;
  return new LLMTransportError(
    `LLM request failed [${source}, model=${modelId}]: ${describeError(error)}`,
    error,
  );
}

function withMimeDataUri(value: string, mimeType?: string): string {
  if (value.startsWith('data:') || value.startsWith('http://') || value.startsWith('https://')) {
    return value;
  }
  return `data:${mimeType || 'image/png'};base64,${value}`;
}

function isOpenAIContentPart(part: unknown): part is OpenAIContentPart {
  if (!isRecord(part) || typeof part.type !== 'string') return false;
  return (
    part.type === 'text' ||
    part.type === 'image_url' ||
    part.type === 'video' ||
    part.type === 'input_audio'
  );
}

function contentToPlainText(content: LLMMessageContent): string {
  if (typeof content === 'string') return content;
  if (!content) return '';
  return content
    .filter((part): part is TextPart => part.type === 'text' && 'text' in part)
    .map((part) => part.text)
    .join('\n');
}

function contentToOpenAIContent(
  content: LLMMessageContent,
  role: OpenAIChatMessage['role'],
): string | OpenAIContentPart[] | null {
  if (typeof content === 'string' || content === null) return content;

  if (role !== 'user') {
    return contentToPlainText(content);
  }

  const parts: OpenAIContentPart[] = [];
  for (const part of content) {
    if (part.type === 'text') {
      if (part.text) parts.push({ type: 'text', text: part.text });
      continue;
    }

    if (part.type === 'image') {
      parts.push({
        type: 'image_url',
        image_url: { url: withMimeDataUri(part.image, part.mimeType) },
      });
      continue;
    }

    if (part.type === 'video') {
      const videos = Array.isArray(part.video) ? part.video : [part.video];
      const mimeType = 'mimeType' in part ? part.mimeType : undefined;
      parts.push({
        type: 'video',
        video: videos.map((item) => withMimeDataUri(item, mimeType || 'video/mp4')),
      });
      continue;
    }

    if (isOpenAIContentPart(part)) {
      parts.push(part);
    }
  }

  return parts.length > 0 ? parts : null;
}

function buildOpenAIInput(params: LLMGenerateParams): OpenAIChatMessage[] {
  const messages: OpenAIChatMessage[] = [];

  if (params.system?.trim()) {
    messages.push({ role: 'system', content: params.system.trim() });
  }

  for (const message of params.messages ?? []) {
    const content = contentToOpenAIContent(message.content, message.role);
    if (
      content === null &&
      message.role !== 'assistant' &&
      message.role !== 'tool' &&
      !message.toolCalls?.length
    ) {
      continue;
    }

    messages.push({
      role: message.role,
      content,
      ...(message.toolCalls?.length ? { tool_calls: message.toolCalls } : {}),
      ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}),
      ...(message.name ? { name: message.name } : {}),
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

function buildRequestBody(
  params: LLMGenerateParams,
  options?: { stream?: boolean; tools?: OpenAIChatTool[] },
): Record<string, unknown> {
  return {
    model: params.model.modelId,
    messages: buildOpenAIInput(params),
    ...(options?.stream ? { stream: true, stream_options: { include_usage: true } } : {}),
    ...(typeof params.maxOutputTokens === 'number'
      ? { max_completion_tokens: params.maxOutputTokens }
      : {}),
    ...(options?.tools?.length ? { tools: options.tools, tool_choice: 'auto' } : {}),
  };
}

async function createChatCompletion(
  params: LLMGenerateParams,
  source: string,
  body: Record<string, unknown>,
): Promise<ChatCompletionResponse> {
  try {
    return (await getOpenAIClient(params.model).chat.completions.create(body as any, {
      signal: params.abortSignal,
    })) as ChatCompletionResponse;
  } catch (error) {
    throw wrapLLMError(error, source, params.model.modelId);
  }
}

async function createChatCompletionStream(
  params: LLMGenerateParams,
  source: string,
  body: Record<string, unknown>,
): Promise<AsyncIterable<ChatCompletionChunk>> {
  try {
    return (await getOpenAIClient(params.model).chat.completions.create(body as any, {
      signal: params.abortSignal,
    })) as AsyncIterable<ChatCompletionChunk>;
  } catch (error) {
    throw wrapLLMError(error, source, params.model.modelId);
  }
}

function extractAssistantText(response: ChatCompletionResponse): string {
  return response.choices?.[0]?.message?.content ?? '';
}

async function createMessage(
  params: LLMGenerateParams,
  source: string,
): Promise<ChatCompletionResponse> {
  const data = await createChatCompletion(params, source, buildRequestBody(params));
  if (data.code || data.message) {
    throw wrapLLMError(data, source, params.model.modelId);
  }
  return data;
}

async function* streamTextGeneration(
  params: LLMStreamParams,
  source: string,
): AsyncIterable<string> {
  const stream = await createChatCompletionStream(
    params,
    source,
    buildRequestBody(params, { stream: true }),
  );

  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content;
    if (delta) yield delta;
  }
}

async function* streamTextGenerationEvents(
  params: LLMStreamParams,
  source: string,
): AsyncIterable<LLMStreamEvent> {
  let fullText = '';
  for await (const text of streamTextGeneration(params, source)) {
    fullText += text;
    yield { type: 'text_delta', text };
  }
  yield {
    type: 'message_history',
    messages: [{ role: 'assistant', content: fullText }],
  };
}

function parseToolArguments(raw: string): unknown {
  return JSON.parse(raw.trim() || '{}');
}

function mergeToolCallDelta(
  toolCalls: Map<number, OpenAIToolCall>,
  delta: NonNullable<NonNullable<ChatCompletionChunk['choices']>[number]['delta']>['tool_calls'],
): void {
  for (const item of delta ?? []) {
    const index = item.index ?? toolCalls.size;
    const existing =
      toolCalls.get(index) ??
      ({
        id: item.id || `call_${index}`,
        type: 'function',
        function: { name: '', arguments: '' },
      } satisfies OpenAIToolCall);

    toolCalls.set(index, {
      id: item.id || existing.id,
      type: 'function',
      function: {
        name: item.function?.name || existing.function.name,
        arguments: existing.function.arguments + (item.function?.arguments || ''),
      },
    });
  }
}

function buildToolResultMessages(results: LLMToolResult[]): OpenAIChatMessage[] {
  return results.map((result) => ({
    role: 'tool',
    tool_call_id: result.toolUseId,
    content: result.isError ? `Error: ${result.content}` : result.content,
  }));
}

export async function* streamLLMWithTools(
  params: LLMToolLoopParams,
  source: string,
  _thinking?: ThinkingConfig,
): AsyncIterable<LLMToolStreamEvent> {
  const messages = buildOpenAIInput(params);
  const maxIterations = params.maxToolIterations ?? DEFAULT_MAX_TOOL_ITERATIONS;
  const generatedHistory: OpenAIChatMessage[] = [];

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const request = {
      ...buildRequestBody(
        {
          ...params,
          messages: messages.map((message) => ({
            role: message.role,
            content: (message.content ?? null) as LLMMessageContent,
            toolCalls: message.tool_calls,
            toolCallId: message.tool_call_id,
            name: message.name,
          })),
          system: undefined,
          prompt: undefined,
        },
        { stream: true, tools: params.tools },
      ),
    };

    const stream = await createChatCompletionStream(params, source, request);
    let assistantText = '';
    const toolCallsByIndex = new Map<number, OpenAIToolCall>();

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        assistantText += delta.content;
        yield { type: 'text_delta', text: delta.content };
      }

      mergeToolCallDelta(toolCallsByIndex, delta.tool_calls);
    }

    const toolCalls = [...toolCallsByIndex.values()].filter(
      (toolCall) => toolCall.id && toolCall.function.name,
    );
    const assistantMessage: OpenAIChatMessage = {
      role: 'assistant',
      content: assistantText || null,
      ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
    };

    messages.push(assistantMessage);
    generatedHistory.push(assistantMessage);

    if (toolCalls.length === 0) break;

    const toolResults: LLMToolResult[] = [];
    for (const toolCall of toolCalls) {
      const toolUse: LLMToolUse = {
        id: toolCall.id,
        name: toolCall.function.name,
        input: parseToolArguments(toolCall.function.arguments),
      };
      toolResults.push(await params.onToolUse(toolUse));
    }

    const toolResultMessages = buildToolResultMessages(toolResults);
    messages.push(...toolResultMessages);
    generatedHistory.push(...toolResultMessages);
  }

  if (generatedHistory.length > 0) {
    yield { type: 'message_history', messages: generatedHistory };
  }
}

export async function callLLM<T extends LLMGenerateParams>(
  params: T,
  source: string,
  retryOptions?: LLMRetryOptions,
  _thinking?: ThinkingConfig,
): Promise<LLMTextResult> {
  const maxAttempts = (retryOptions?.retries ?? 0) + 1;
  const validate = retryOptions?.validate ?? (maxAttempts > 1 ? DEFAULT_VALIDATE : undefined);

  let lastResult: LLMTextResult | undefined;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await createMessage(params, source);
      const result: LLMTextResult = {
        text: extractAssistantText(response),
        rawResponse: response,
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
  _thinking?: ThinkingConfig,
): LLMStreamResult {
  return { textStream: streamTextGeneration(params, source) };
}

export function streamLLMEvents<T extends LLMStreamParams>(
  params: T,
  source: string,
  _thinking?: ThinkingConfig,
): AsyncIterable<LLMStreamEvent> {
  return streamTextGenerationEvents(params, source);
}

export async function collectStreamLLMText<T extends LLMStreamParams>(
  params: T,
  source: string,
  thinking?: ThinkingConfig,
): Promise<string> {
  let text = '';
  for await (const chunk of streamTextGeneration(params, source)) {
    text += chunk;
  }
  void thinking;
  return text;
}
