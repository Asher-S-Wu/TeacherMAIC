/**
 * Unified LLM Call Layer
 *
 * Text generation uses Alibaba Cloud Bailian through the OpenAI-compatible
 * Responses API.
 */

import OpenAI from 'openai';
import { createLogger } from '@/lib/logger';
import {
  QWEN_3_7_PLUS_MODEL_ID,
  QWEN_3_7_PLUS_RESPONSES_PARAMETERS,
} from './bailian-models';
import type { ResponsesModel } from './providers';

const log = createLogger('LLM');

export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high';

type TextPart = { type: 'text'; text: string };
type ImagePart = { type: 'image'; image: string; mimeType?: string };
type UnsupportedMediaPart =
  | { type: 'video'; video: string | string[]; mimeType?: string }
  | { type: 'input_audio'; input_audio: { data: string } };

export type ResponsesContentPart =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string }
  | { type: 'output_text'; text: string; annotations?: unknown[] };

type TextLikeContentPart =
  | TextPart
  | Extract<ResponsesContentPart, { type: 'input_text' | 'output_text' }>;

export type ResponsesMessage = {
  type?: 'message';
  role: 'system' | 'developer' | 'user' | 'assistant';
  content: string | ResponsesContentPart[];
};

export type ResponsesFunctionCall = {
  type: 'function_call';
  id?: string;
  name: string;
  arguments: string;
  call_id: string;
  status?: 'in_progress' | 'completed' | 'incomplete';
};

export type ResponsesFunctionCallOutput = {
  type: 'function_call_output';
  id?: string;
  call_id: string;
  output: string;
  status?: 'in_progress' | 'completed' | 'incomplete';
};

export type ResponsesInputItem =
  | ResponsesMessage
  | ResponsesFunctionCall
  | ResponsesFunctionCallOutput;

export type ResponsesTool = {
  type: 'function';
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
};

export type LLMMessageContent =
  | string
  | null
  | Array<TextPart | ImagePart | ResponsesContentPart | UnsupportedMediaPart>;

export type LLMMessage = {
  role: ResponsesMessage['role'];
  content: LLMMessageContent;
};

export interface LLMGenerateParams {
  model: ResponsesModel;
  system?: string;
  prompt?: string;
  messages?: LLMMessage[];
  reasoningEffort?: ReasoningEffort;
  previousResponseId?: string;
  abortSignal?: AbortSignal;
}

export type LLMStreamParams = LLMGenerateParams;

export interface LLMTextResult {
  text: string;
  responseId?: string;
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
  | { type: 'model_response'; responseId: string };

export type LLMStreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'model_response'; responseId: string };

export interface LLMToolLoopParams extends LLMStreamParams {
  tools: ResponsesTool[];
  onToolUse: (toolUse: LLMToolUse) => Promise<LLMToolResult> | LLMToolResult;
  maxToolIterations?: number;
}

type ResponsesOutputMessage = {
  type: 'message';
  content?: Array<{ type?: string; text?: string }>;
};

type ResponsesOutputItem =
  | ResponsesOutputMessage
  | ResponsesFunctionCall
  | Record<string, unknown>;

type ResponsesObject = {
  id?: string;
  output?: ResponsesOutputItem[];
  output_text?: string;
  error?: unknown;
  status?: string;
};

type ResponsesStreamEvent = {
  type?: string;
  delta?: string;
  text?: string;
  response?: ResponsesObject;
  item?: ResponsesOutputItem;
  code?: string;
  message?: string;
  error?: unknown;
};

const DEFAULT_VALIDATE = (text: string) => text.trim().length > 0;
const DEFAULT_REASONING_EFFORT: ReasoningEffort = 'high';
const DEFAULT_MAX_TOOL_ITERATIONS = 16;
const SESSION_CACHE_HEADER = 'x-dashscope-session-cache';
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
    defaultHeaders: {
      [SESSION_CACHE_HEADER]: 'enable',
    },
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

function isResponsesContentPart(part: unknown): part is ResponsesContentPart {
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

function contentToResponsesContent(
  content: LLMMessageContent,
  role: ResponsesMessage['role'],
): string | ResponsesContentPart[] | null {
  if (typeof content === 'string') {
    return role === 'assistant' ? [{ type: 'output_text', text: content }] : content;
  }
  if (content === null) return null;

  const parts: ResponsesContentPart[] = [];
  for (const part of content) {
    if (part.type === 'video' || part.type === 'input_audio') {
      throw new Error('Responses API text generation does not support video or audio input.');
    }

    if (part.type === 'text') {
      if (!part.text) continue;
      parts.push({
        type: role === 'assistant' ? 'output_text' : 'input_text',
        text: part.text,
      });
      continue;
    }

    if (part.type === 'image') {
      if (role !== 'user') continue;
      parts.push({
        type: 'input_image',
        image_url: withMimeDataUri(part.image, part.mimeType),
      });
      continue;
    }

    if (isResponsesContentPart(part)) {
      if (role === 'assistant' && part.type !== 'output_text') {
        parts.push({ type: 'output_text', text: contentToPlainText([part]) });
        continue;
      }
      if (role !== 'assistant' && part.type === 'output_text') {
        parts.push({ type: 'input_text', text: part.text });
        continue;
      }
      parts.push(part);
    }
  }

  return parts.length > 0 ? parts : null;
}

function buildResponsesInput(params: LLMGenerateParams): ResponsesInputItem[] {
  const input: ResponsesInputItem[] = [];

  if (params.system?.trim()) {
    input.push({ type: 'message', role: 'system', content: params.system.trim() });
  }

  for (const message of params.messages ?? []) {
    const content = contentToResponsesContent(message.content, message.role);
    if (content === null) continue;
    input.push({
      type: 'message',
      role: message.role,
      content,
    });
  }

  if (params.prompt !== undefined) {
    input.push({ type: 'message', role: 'user', content: params.prompt });
  }

  if (input.length === 0) {
    throw new Error('LLM request missing input');
  }

  return input;
}

function buildRequestBody(
  params: LLMGenerateParams,
  options?: {
    stream?: boolean;
    tools?: ResponsesTool[];
    input?: ResponsesInputItem[];
    previousResponseId?: string;
  },
): Record<string, unknown> {
  const isQwen37Plus = params.model.modelId === QWEN_3_7_PLUS_MODEL_ID;
  const previousResponseId = options?.previousResponseId ?? params.previousResponseId;

  return {
    model: params.model.modelId,
    input: options?.input ?? buildResponsesInput(params),
    reasoning: { effort: params.reasoningEffort ?? DEFAULT_REASONING_EFFORT },
    ...(isQwen37Plus ? QWEN_3_7_PLUS_RESPONSES_PARAMETERS : {}),
    ...(previousResponseId ? { previous_response_id: previousResponseId } : {}),
    ...(options?.stream ? { stream: true } : {}),
    ...(options?.tools?.length ? { tools: options.tools, tool_choice: 'auto' } : {}),
  };
}

async function createResponsesStream(
  params: LLMGenerateParams,
  source: string,
  body: Record<string, unknown>,
): Promise<AsyncIterable<ResponsesStreamEvent>> {
  try {
    return (await getOpenAIClient(params.model).responses.create(body as any, {
      signal: params.abortSignal,
    })) as unknown as AsyncIterable<ResponsesStreamEvent>;
  } catch (error) {
    throw wrapLLMError(error, source, params.model.modelId);
  }
}

function throwIfResponseError(
  event: ResponsesStreamEvent,
  source: string,
  modelId: string,
): void {
  if (event.code || event.error) {
    throw wrapLLMError(event, source, modelId);
  }
  if (event.response?.error || event.response?.status === 'failed') {
    throw wrapLLMError(event.response.error ?? event.response, source, modelId);
  }
}

async function* streamResponseEvents(
  params: LLMStreamParams,
  source: string,
  body: Record<string, unknown>,
): AsyncIterable<LLMStreamEvent> {
  const stream = await createResponsesStream(params, source, body);
  let responseId: string | undefined;

  for await (const event of stream) {
    throwIfResponseError(event, source, params.model.modelId);

    if (event.type === 'response.output_text.delta' && event.delta) {
      yield { type: 'text_delta', text: event.delta };
      continue;
    }

    if (event.type === 'response.completed') {
      responseId = event.response?.id;
    }
  }

  if (responseId) {
    yield { type: 'model_response', responseId };
  }
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
  yield* streamResponseEvents(
    params,
    source,
    buildRequestBody(params, { stream: true }),
  );
}

function parseToolArguments(raw: string): unknown {
  return JSON.parse(raw.trim() || '{}');
}

function getFunctionCallsFromOutput(
  output: ResponsesOutputItem[] | undefined,
): ResponsesFunctionCall[] {
  const functionCalls: ResponsesFunctionCall[] = [];
  for (const item of output ?? []) {
    if (
      isRecord(item) &&
      item.type === 'function_call' &&
      typeof item.name === 'string' &&
      typeof item.arguments === 'string' &&
      typeof item.call_id === 'string'
    ) {
      functionCalls.push(item as ResponsesFunctionCall);
    }
  }
  return functionCalls;
}

function buildFunctionCallOutputItems(
  functionCalls: ResponsesFunctionCall[],
  results: LLMToolResult[],
): ResponsesInputItem[] {
  const resultById = new Map(results.map((result) => [result.toolUseId, result]));
  const items: ResponsesInputItem[] = [];
  for (const functionCall of functionCalls) {
    const result = resultById.get(functionCall.call_id);
    if (!result) {
      throw new Error(`Missing tool result for call_id: ${functionCall.call_id}`);
    }
    items.push({
      type: 'function_call_output',
      call_id: functionCall.call_id,
      output: result.isError ? `Error: ${result.content}` : result.content,
    });
  }
  return items;
}

export async function* streamLLMWithTools(
  params: LLMToolLoopParams,
  source: string,
): AsyncIterable<LLMToolStreamEvent> {
  const maxIterations = params.maxToolIterations ?? DEFAULT_MAX_TOOL_ITERATIONS;
  let input = buildResponsesInput(params);
  let previousResponseId = params.previousResponseId;
  let completed = false;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const stream = await createResponsesStream(
      params,
      source,
      buildRequestBody(params, {
        input,
        previousResponseId,
        stream: true,
        tools: params.tools,
      }),
    );

    let responseId: string | undefined;
    const functionCallsByCallId = new Map<string, ResponsesFunctionCall>();

    for await (const event of stream) {
      throwIfResponseError(event, source, params.model.modelId);

      if (event.type === 'response.output_text.delta' && event.delta) {
        yield { type: 'text_delta', text: event.delta };
        continue;
      }

      if (event.type === 'response.output_item.done') {
        const functionCalls = getFunctionCallsFromOutput(event.item ? [event.item] : undefined);
        for (const functionCall of functionCalls) {
          functionCallsByCallId.set(functionCall.call_id, functionCall);
        }
        continue;
      }

      if (event.type === 'response.completed') {
        responseId = event.response?.id;
        if (functionCallsByCallId.size === 0) {
          for (const functionCall of getFunctionCallsFromOutput(event.response?.output)) {
            functionCallsByCallId.set(functionCall.call_id, functionCall);
          }
        }
      }
    }

    const functionCalls = [...functionCallsByCallId.values()];
    if (functionCalls.length === 0) {
      if (responseId) yield { type: 'model_response', responseId };
      completed = true;
      break;
    }

    if (!responseId) {
      throw new Error('Responses API tool call response is missing response id.');
    }

    const toolResults: LLMToolResult[] = [];
    for (const functionCall of functionCalls) {
      const toolUse: LLMToolUse = {
        id: functionCall.call_id,
        name: functionCall.name,
        input: parseToolArguments(functionCall.arguments),
      };
      toolResults.push(await params.onToolUse(toolUse));
    }

    input = buildFunctionCallOutputItems(functionCalls, toolResults);
    previousResponseId = responseId;
  }

  if (!completed) {
    throw new Error(`Responses API tool loop exceeded ${maxIterations} iterations.`);
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
