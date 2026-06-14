/**
 * Unified LLM Call Layer
 *
 * Text generation uses ZenMux through the OpenAI-compatible Chat Completions API.
 */

import OpenAI from 'openai';
import { createLogger } from '@/lib/logger';
import { LLMTransportError } from './llm-transport-error';
import type { ResponsesModel } from './providers';

const log = createLogger('LLM');

export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high';

type TextPart = { type: 'text'; text: string };
type ImagePart = { type: 'image'; image: string; mimeType?: string };
type UnsupportedMediaPart =
  | { type: 'video'; video: string | string[]; mimeType?: string }
  | { type: 'input_audio'; input_audio: { data: string } };

export type ChatContentPart =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string }
  | { type: 'output_text'; text: string; annotations?: unknown[] };

type TextLikeContentPart =
  | TextPart
  | Extract<ChatContentPart, { type: 'input_text' | 'output_text' }>;

export type LLMMessageContent =
  | string
  | null
  | Array<TextPart | ImagePart | ChatContentPart | UnsupportedMediaPart>;

export type LLMMessage = {
  role: 'system' | 'developer' | 'user' | 'assistant';
  content: LLMMessageContent;
};

export type LLMToolDefinition = {
  type: 'function';
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
};

export interface LLMGenerateParams {
  model: ResponsesModel;
  system?: string;
  prompt?: string;
  messages?: LLMMessage[];
  reasoningEffort?: ReasoningEffort;
  abortSignal?: AbortSignal;
}

export type LLMStreamParams = LLMGenerateParams;

export interface LLMTextResult {
  text: string;
  responseId?: string;
}

export { LLMTransportError } from './llm-transport-error';

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
  | { type: 'model_response'; responseId: string };

export type LLMStreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'model_response'; responseId: string };

export interface LLMToolLoopParams extends LLMStreamParams {
  tools: LLMToolDefinition[];
  onToolUse: (toolUse: LLMToolUse) => Promise<LLMToolResult> | LLMToolResult;
  maxToolIterations?: number;
}

type OpenAIChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

type OpenAIChatToolCall = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
};

type OpenAIChatMessage = {
  role: 'system' | 'developer' | 'user' | 'assistant';
  content: string | OpenAIChatContentPart[] | null;
  tool_calls?: OpenAIChatToolCall[];
  reasoning?: string;
  reasoning_details?: unknown;
};

type OpenAIChatToolMessage = {
  role: 'tool';
  tool_call_id: string;
  content: string;
};

type OpenAIChatRequestMessage = OpenAIChatMessage | OpenAIChatToolMessage;

type OpenAIChatTool = {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
};

type OpenAIChatCreateBody = Parameters<OpenAI['chat']['completions']['create']>[0];
type OpenAIChatStreamRequestBody = OpenAIChatCreateBody & { stream: true };

type OpenAIChatToolCallDelta = {
  index?: number;
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
};

type OpenAIChatStreamChoice = {
  delta?: {
    role?: string;
    content?: string | null;
    reasoning?: string | null;
    reasoning_details?: unknown;
    tool_calls?: OpenAIChatToolCallDelta[];
  };
  finish_reason?: string | null;
};

type OpenAIChatStreamChunk = {
  id?: string;
  choices?: OpenAIChatStreamChoice[];
  code?: string | number;
  message?: string;
  error?: unknown;
};

type ToolCallAccumulator = {
  index: number;
  id?: string;
  type?: string;
  name?: string;
  arguments: string;
};

type ChatStreamFinalEvent = {
  responseId?: string;
  finishReason?: string;
  assistantMessage: OpenAIChatMessage;
  toolCalls: OpenAIChatToolCall[];
};

type ChatStreamEvent =
  | { textDelta: string }
  | { final: ChatStreamFinalEvent };

const DEFAULT_VALIDATE = (text: string) => text.trim().length > 0;
const DEFAULT_MAX_COMPLETION_TOKENS = 32768;
const DEFAULT_MAX_TOOL_ITERATIONS = 16;
const clientCache = new Map<string, OpenAI>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function getOpenAIClient(model: ResponsesModel): OpenAI {
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

function isChatContentPart(part: unknown): part is ChatContentPart {
  if (!isRecord(part) || typeof part.type !== 'string') return false;
  return (
    part.type === 'input_text' ||
    part.type === 'input_image' ||
    part.type === 'output_text'
  );
}

function contentToPlainText(content: LLMMessageContent): string {
  if (typeof content === 'string') return content;
  if (!content) return '';
  return content
    .filter(
      (part): part is TextLikeContentPart =>
        (part.type === 'text' && 'text' in part) ||
        part.type === 'input_text' ||
        part.type === 'output_text',
    )
    .map((part) => part.text)
    .join('\n');
}

function contentToOpenAIChatContent(
  content: LLMMessageContent,
  role: LLMMessage['role'],
): string | OpenAIChatContentPart[] | null {
  if (typeof content === 'string') return content;
  if (content === null) return null;

  if (role !== 'user') {
    const text = contentToPlainText(content);
    return text || null;
  }

  const parts: OpenAIChatContentPart[] = [];
  for (const part of content) {
    if (part.type === 'video' || part.type === 'input_audio') {
      throw new Error('Chat Completions text generation does not support video or audio input.');
    }

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

    if (isChatContentPart(part)) {
      if (part.type === 'input_image') {
        parts.push({
          type: 'image_url',
          image_url: { url: withMimeDataUri(part.image_url) },
        });
        continue;
      }

      if (part.text) {
        parts.push({ type: 'text', text: part.text });
      }
    }
  }

  if (parts.length === 0) return null;
  if (parts.length === 1 && parts[0].type === 'text') return parts[0].text;
  return parts;
}

function buildChatMessages(params: LLMGenerateParams): OpenAIChatRequestMessage[] {
  const messages: OpenAIChatRequestMessage[] = [];

  if (params.system?.trim()) {
    messages.push({ role: 'system', content: params.system.trim() });
  }

  for (const message of params.messages ?? []) {
    const content = contentToOpenAIChatContent(message.content, message.role);
    if (content === null || (typeof content === 'string' && content.trim().length === 0)) {
      continue;
    }
    messages.push({
      role: message.role,
      content,
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

function toOpenAIChatTools(tools: LLMToolDefinition[]): OpenAIChatTool[] {
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      ...(tool.description ? { description: tool.description } : {}),
      parameters: tool.parameters ?? { type: 'object', properties: {} },
    },
  }));
}

function buildChatStreamRequestBody(
  params: LLMGenerateParams,
  options?: {
    tools?: LLMToolDefinition[];
    messages?: OpenAIChatRequestMessage[];
  },
): OpenAIChatStreamRequestBody {
  return {
    model: params.model.modelId,
    messages: options?.messages ?? buildChatMessages(params),
    max_completion_tokens: DEFAULT_MAX_COMPLETION_TOKENS,
    stream: true,
    ...(options?.tools?.length
      ? {
          tools: toOpenAIChatTools(options.tools),
          tool_choice: 'auto',
        }
      : {}),
  } as OpenAIChatStreamRequestBody;
}

async function createChatCompletionStream(
  params: LLMGenerateParams,
  source: string,
  body: OpenAIChatStreamRequestBody,
): Promise<AsyncIterable<OpenAIChatStreamChunk>> {
  try {
    const stream = await getOpenAIClient(params.model).chat.completions.create(body, {
      signal: params.abortSignal,
    });
    return stream as unknown as AsyncIterable<OpenAIChatStreamChunk>;
  } catch (error) {
    throw wrapLLMError(error, source, params.model.modelId);
  }
}

function throwIfChatStreamError(
  chunk: OpenAIChatStreamChunk,
  source: string,
  modelId: string,
): void {
  if (chunk.code || chunk.error) {
    throw wrapLLMError(chunk.error ?? chunk, source, modelId);
  }
}

function mergeToolCallDelta(
  toolCalls: Map<number, ToolCallAccumulator>,
  delta: OpenAIChatToolCallDelta,
): void {
  const index = delta.index ?? 0;
  const current =
    toolCalls.get(index) ??
    ({
      index,
      arguments: '',
    } satisfies ToolCallAccumulator);

  if (delta.id) current.id = delta.id;
  if (delta.type) current.type = delta.type;
  if (delta.function?.name) current.name = delta.function.name;
  if (delta.function?.arguments) current.arguments += delta.function.arguments;

  toolCalls.set(index, current);
}

function finalizeToolCalls(toolCalls: Map<number, ToolCallAccumulator>): OpenAIChatToolCall[] {
  return [...toolCalls.values()]
    .sort((a, b) => a.index - b.index)
    .map((toolCall) => {
      if (!toolCall.id || !toolCall.name) {
        throw new Error('Chat Completions tool call is missing id or function name.');
      }

      return {
        id: toolCall.id,
        type: 'function',
        function: {
          name: toolCall.name,
          arguments: toolCall.arguments,
        },
      };
    });
}

function mergeReasoningDetails(current: unknown, next: unknown): unknown {
  if (next === undefined || next === null) return current;
  if (current === undefined || current === null) return next;
  if (typeof current === 'string' && typeof next === 'string') return current + next;
  if (Array.isArray(current) && Array.isArray(next)) return [...current, ...next];
  return next;
}

async function* streamChatResponseEvents(
  params: LLMStreamParams,
  source: string,
  body: OpenAIChatStreamRequestBody,
): AsyncIterable<ChatStreamEvent> {
  const stream = await createChatCompletionStream(params, source, body);
  const toolCalls = new Map<number, ToolCallAccumulator>();
  let responseId: string | undefined;
  let finishReason: string | undefined;
  let content = '';
  let reasoning = '';
  let reasoningDetails: unknown;

  for await (const chunk of stream) {
    throwIfChatStreamError(chunk, source, params.model.modelId);

    if (chunk.id) responseId = chunk.id;

    for (const choice of chunk.choices ?? []) {
      if (choice.finish_reason) finishReason = choice.finish_reason;

      const delta = choice.delta;
      if (!delta) continue;

      if (delta.content) {
        content += delta.content;
        yield { textDelta: delta.content };
      }

      if (delta.reasoning) {
        reasoning += delta.reasoning;
      }

      reasoningDetails = mergeReasoningDetails(reasoningDetails, delta.reasoning_details);

      for (const toolCallDelta of delta.tool_calls ?? []) {
        mergeToolCallDelta(toolCalls, toolCallDelta);
      }
    }
  }

  const finalizedToolCalls = finalizeToolCalls(toolCalls);
  const assistantMessage: OpenAIChatMessage = {
    role: 'assistant',
    content,
    ...(finalizedToolCalls.length > 0 ? { tool_calls: finalizedToolCalls } : {}),
    ...(reasoning ? { reasoning } : {}),
    ...(reasoningDetails !== undefined ? { reasoning_details: reasoningDetails } : {}),
  };

  yield {
    final: {
      responseId,
      finishReason,
      assistantMessage,
      toolCalls: finalizedToolCalls,
    },
  };
}

async function* streamTextGeneration(
  params: LLMStreamParams,
  source: string,
): AsyncIterable<string> {
  for await (const event of streamTextGenerationEvents(params, source)) {
    if (event.type === 'text_delta') yield event.text;
  }
}

async function* streamTextGenerationEvents(
  params: LLMStreamParams,
  source: string,
): AsyncIterable<LLMStreamEvent> {
  for await (const event of streamChatResponseEvents(
    params,
    source,
    buildChatStreamRequestBody(params),
  )) {
    if ('textDelta' in event) {
      yield { type: 'text_delta', text: event.textDelta };
      continue;
    }

    if (event.final.responseId) {
      yield { type: 'model_response', responseId: event.final.responseId };
    }
  }
}

function parseToolArguments(raw: string, toolName: string): unknown {
  try {
    return JSON.parse(raw.trim() || '{}');
  } catch (error) {
    throw new Error(
      `Invalid JSON arguments for tool "${toolName}": ${describeError(error)}`,
    );
  }
}

function buildToolResultMessages(results: LLMToolResult[]): OpenAIChatToolMessage[] {
  return results.map((result) => ({
    role: 'tool',
    tool_call_id: result.toolUseId,
    content: result.isError ? `Error: ${result.content}` : result.content,
  }));
}

export async function* streamLLMWithTools(
  params: LLMToolLoopParams,
  source: string,
): AsyncIterable<LLMToolStreamEvent> {
  const maxIterations = params.maxToolIterations ?? DEFAULT_MAX_TOOL_ITERATIONS;
  let messages = buildChatMessages(params);
  let completed = false;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    let finalEvent: ChatStreamFinalEvent | undefined;

    for await (const event of streamChatResponseEvents(
      params,
      source,
      buildChatStreamRequestBody(params, {
        tools: params.tools,
        messages,
      }),
    )) {
      if ('textDelta' in event) {
        yield { type: 'text_delta', text: event.textDelta };
        continue;
      }

      finalEvent = event.final;
    }

    if (!finalEvent) {
      throw new Error('Chat Completions stream ended without a final event.');
    }

    if (finalEvent.toolCalls.length === 0) {
      if (finalEvent.responseId) {
        yield { type: 'model_response', responseId: finalEvent.responseId };
      }
      completed = true;
      break;
    }

    const toolResults: LLMToolResult[] = [];
    for (const toolCall of finalEvent.toolCalls) {
      const toolUse: LLMToolUse = {
        id: toolCall.id,
        name: toolCall.function.name,
        input: parseToolArguments(toolCall.function.arguments, toolCall.function.name),
      };
      toolResults.push(await params.onToolUse(toolUse));
    }

    messages = [
      ...messages,
      finalEvent.assistantMessage,
      ...buildToolResultMessages(toolResults),
    ];
  }

  if (!completed) {
    throw new Error(`Chat Completions tool loop exceeded ${maxIterations} iterations.`);
  }
}

export async function callLLM<T extends LLMGenerateParams>(
  params: T,
  source: string,
  retryOptions?: LLMRetryOptions,
): Promise<LLMTextResult> {
  const maxAttempts = (retryOptions?.retries ?? 0) + 1;
  const validate = retryOptions?.validate ?? (maxAttempts > 1 ? DEFAULT_VALIDATE : undefined);

  let lastResult: LLMTextResult | undefined;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      let text = '';
      let responseId: string | undefined;
      for await (const event of streamTextGenerationEvents(params, source)) {
        if (event.type === 'text_delta') {
          text += event.text;
        } else if (event.type === 'model_response') {
          responseId = event.responseId;
        }
      }
      const result: LLMTextResult = { text, responseId };

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
): LLMStreamResult {
  return { textStream: streamTextGeneration(params, source) };
}

export function streamLLMEvents<T extends LLMStreamParams>(
  params: T,
  source: string,
): AsyncIterable<LLMStreamEvent> {
  return streamTextGenerationEvents(params, source);
}

export async function collectStreamLLMText<T extends LLMStreamParams>(
  params: T,
  source: string,
): Promise<string> {
  let text = '';
  for await (const chunk of streamTextGeneration(params, source)) {
    text += chunk;
  }
  return text;
}
