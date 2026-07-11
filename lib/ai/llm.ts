/**
 * Unified LLM Call Layer
 *
 * Text generation uses the official Google Gemini GenerateContent REST API.
 */

import { createLogger } from '@/lib/logger';
import { proxyFetch } from '@/lib/server/proxy-fetch';
import { validateUrlForSSRF } from '@/lib/server/ssrf-guard';
import { LLMTransportError } from './llm-transport-error';
import type { ResponsesModel } from './providers';

const log = createLogger('LLM');

export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high';

type TextPart = { type: 'text'; text: string };
type ImagePart = { type: 'image'; image: string; mimeType?: string };
type MediaPart =
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
  | Array<TextPart | ImagePart | ChatContentPart | MediaPart>;

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

type GeminiFunctionCall = {
  id?: string;
  name: string;
  args?: Record<string, unknown>;
};

type GeminiPart = Record<string, unknown> & {
  text?: string;
  thought?: boolean;
  inlineData?: {
    mimeType: string;
    data: string;
  };
  functionCall?: GeminiFunctionCall;
  functionResponse?: {
    id: string;
    name: string;
    response: Record<string, unknown>;
  };
};

type GeminiContent = {
  role: 'user' | 'model';
  parts: GeminiPart[];
};

type GeminiGenerateRequest = {
  contents: GeminiContent[];
  systemInstruction?: { parts: Array<{ text: string }> };
  tools?: Array<{
    functionDeclarations: Array<{
      name: string;
      description?: string;
      parameters: Record<string, unknown>;
    }>;
  }>;
  generationConfig: {
    maxOutputTokens: number;
    thinkingConfig?: { thinkingLevel: 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH' };
  };
};

type GeminiGenerateResponse = {
  candidates?: Array<{
    content?: GeminiContent;
    finishReason?: string;
  }>;
  responseId?: string;
  error?: unknown;
};

type GeminiStreamFinalEvent = {
  responseId?: string;
  assistantContent: GeminiContent;
  functionCalls: GeminiFunctionCall[];
};

type GeminiStreamEvent =
  | { textDelta: string }
  | { final: GeminiStreamFinalEvent };

const DEFAULT_VALIDATE = (text: string) => text.trim().length > 0;
const DEFAULT_MAX_OUTPUT_TOKENS = 65_536;
const DEFAULT_MAX_TOOL_ITERATIONS = 16;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
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
    if (cause) parts.push(`cause=${describeError(cause)}`);
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

async function resolveMediaData(
  value: string,
  mimeType: string | undefined,
  defaultMimeType: string,
  abortSignal?: AbortSignal,
): Promise<{ mimeType: string; data: string }> {
  const dataUriMatch = value.match(/^data:([^;,]+);base64,([\s\S]+)$/);
  if (dataUriMatch) {
    return { mimeType: dataUriMatch[1], data: dataUriMatch[2] };
  }

  if (value.startsWith('https://') || value.startsWith('http://')) {
    const validationError = await validateUrlForSSRF(value);
    if (validationError) {
      throw new Error(`媒体地址不可用：${validationError}`);
    }

    const response = await proxyFetch(value, {
      signal: abortSignal,
      redirect: 'error',
    });
    if (!response.ok) {
      throw new Error(`媒体读取失败：HTTP ${response.status}`);
    }

    const resolvedMimeType = response.headers.get('content-type')?.split(';')[0]?.trim();
    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      mimeType: resolvedMimeType || mimeType || defaultMimeType,
      data: buffer.toString('base64'),
    };
  }

  return { mimeType: mimeType || defaultMimeType, data: value };
}

async function contentToGeminiParts(
  content: LLMMessageContent,
  abortSignal?: AbortSignal,
): Promise<GeminiPart[]> {
  if (typeof content === 'string') return content ? [{ text: content }] : [];
  if (content === null) return [];

  const parts: GeminiPart[] = [];
  for (const part of content) {
    if (part.type === 'text') {
      if (part.text) parts.push({ text: part.text });
      continue;
    }

    if (part.type === 'image') {
      parts.push({
        inlineData: await resolveMediaData(
          part.image,
          part.mimeType,
          'image/png',
          abortSignal,
        ),
      });
      continue;
    }

    if (part.type === 'video') {
      const videos = Array.isArray(part.video) ? part.video : [part.video];
      for (const video of videos) {
        parts.push({
          inlineData: await resolveMediaData(
            video,
            part.mimeType,
            'video/mp4',
            abortSignal,
          ),
        });
      }
      continue;
    }

    if (part.type === 'input_audio') {
      parts.push({
        inlineData: await resolveMediaData(
          part.input_audio.data,
          undefined,
          'audio/mpeg',
          abortSignal,
        ),
      });
      continue;
    }

    if (!isChatContentPart(part)) continue;
    if (part.type === 'input_image') {
      parts.push({
        inlineData: await resolveMediaData(
          part.image_url,
          undefined,
          'image/png',
          abortSignal,
        ),
      });
      continue;
    }

    if (part.text) parts.push({ text: part.text });
  }

  return parts;
}

function appendContent(
  contents: GeminiContent[],
  role: GeminiContent['role'],
  parts: GeminiPart[],
): void {
  if (parts.length === 0) return;
  const previous = contents[contents.length - 1];
  if (previous?.role === role) {
    previous.parts.push(...parts);
    return;
  }
  contents.push({ role, parts });
}

function toThinkingLevel(
  effort?: ReasoningEffort,
): 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH' | undefined {
  if (!effort) return undefined;
  if (effort === 'none' || effort === 'minimal') return 'MINIMAL';
  return effort.toUpperCase() as 'LOW' | 'MEDIUM' | 'HIGH';
}

async function buildGeminiRequest(
  params: LLMGenerateParams,
  tools?: LLMToolDefinition[],
): Promise<GeminiGenerateRequest> {
  const systemInstructions: string[] = [];
  const contents: GeminiContent[] = [];

  if (params.system?.trim()) systemInstructions.push(params.system.trim());

  for (const message of params.messages ?? []) {
    if (message.role === 'system' || message.role === 'developer') {
      const instruction = contentToPlainText(message.content).trim();
      if (instruction) systemInstructions.push(instruction);
      continue;
    }

    const parts = await contentToGeminiParts(
      message.content,
      params.abortSignal,
    );
    appendContent(contents, message.role === 'assistant' ? 'model' : 'user', parts);
  }

  if (params.prompt !== undefined) {
    appendContent(contents, 'user', [{ text: params.prompt }]);
  }

  if (contents.length === 0) {
    throw new Error('LLM request missing input');
  }

  const thinkingLevel = toThinkingLevel(params.reasoningEffort);
  return {
    contents,
    ...(systemInstructions.length > 0
      ? { systemInstruction: { parts: [{ text: systemInstructions.join('\n\n') }] } }
      : {}),
    ...(tools?.length
      ? {
          tools: [
            {
              functionDeclarations: tools.map((tool) => ({
                name: tool.name,
                ...(tool.description ? { description: tool.description } : {}),
                parameters: tool.parameters ?? { type: 'object', properties: {} },
              })),
            },
          ],
        }
      : {}),
    generationConfig: {
      maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
      ...(thinkingLevel ? { thinkingConfig: { thinkingLevel } } : {}),
    },
  };
}

function parseGeminiPayload(payload: string): GeminiGenerateResponse | null {
  const data = payload
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n')
    .trim();

  if (!data || data === '[DONE]') return null;
  return JSON.parse(data) as GeminiGenerateResponse;
}

async function* parseGeminiSSE(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<GeminiGenerateResponse> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });

    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() ?? '';
    for (const event of events) {
      const response = parseGeminiPayload(event);
      if (response) yield response;
    }

    if (done) break;
  }

  const finalResponse = parseGeminiPayload(buffer);
  if (finalResponse) yield finalResponse;
}

async function createGeminiStream(
  params: LLMGenerateParams,
  source: string,
  request: GeminiGenerateRequest,
): Promise<AsyncIterable<GeminiGenerateResponse>> {
  const baseUrl = params.model.baseUrl.replace(/\/$/, '');
  const url = `${baseUrl}/models/${encodeURIComponent(params.model.modelId)}:streamGenerateContent?alt=sse`;

  try {
    const response = await proxyFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': params.model.apiKey,
      },
      body: JSON.stringify(request),
      signal: params.abortSignal,
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Gemini API HTTP ${response.status}: ${message}`);
    }
    if (!response.body) {
      throw new Error('Gemini API returned an empty stream');
    }

    return parseGeminiSSE(response.body);
  } catch (error) {
    throw wrapLLMError(error, source, params.model.modelId);
  }
}

function getFunctionCalls(parts: GeminiPart[]): GeminiFunctionCall[] {
  return parts.flatMap((part) => (part.functionCall ? [part.functionCall] : []));
}

async function* streamGeminiResponseEvents(
  params: LLMStreamParams,
  source: string,
  request: GeminiGenerateRequest,
): AsyncIterable<GeminiStreamEvent> {
  const stream = await createGeminiStream(params, source, request);
  const responseParts: GeminiPart[] = [];
  let responseId: string | undefined;

  for await (const chunk of stream) {
    if (chunk.error) {
      throw wrapLLMError(chunk.error, source, params.model.modelId);
    }
    if (chunk.responseId) responseId = chunk.responseId;

    const candidate = chunk.candidates?.[0];
    for (const part of candidate?.content?.parts ?? []) {
      responseParts.push(part);
      if (typeof part.text === 'string' && part.text && !part.thought) {
        yield { textDelta: part.text };
      }
    }
  }

  yield {
    final: {
      responseId,
      assistantContent: { role: 'model', parts: responseParts },
      functionCalls: getFunctionCalls(responseParts),
    },
  };
}

async function* streamTextGenerationEvents(
  params: LLMStreamParams,
  source: string,
): AsyncIterable<LLMStreamEvent> {
  const request = await buildGeminiRequest(params);
  for await (const event of streamGeminiResponseEvents(params, source, request)) {
    if ('textDelta' in event) {
      yield { type: 'text_delta', text: event.textDelta };
    } else if (event.final.responseId) {
      yield { type: 'model_response', responseId: event.final.responseId };
    }
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

function buildFunctionResponses(
  functionCalls: GeminiFunctionCall[],
  results: LLMToolResult[],
): GeminiPart[] {
  return functionCalls.map((functionCall, index) => {
    const result = results[index];
    if (!functionCall.id) {
      throw new Error(`Gemini function call "${functionCall.name}" is missing its required id.`);
    }
    if (!result) {
      throw new Error(`Missing result for Gemini function call "${functionCall.name}".`);
    }

    return {
      functionResponse: {
        id: functionCall.id,
        name: functionCall.name,
        response: result.isError ? { error: result.content } : { result: result.content },
      },
    };
  });
}

export async function* streamLLMWithTools(
  params: LLMToolLoopParams,
  source: string,
): AsyncIterable<LLMToolStreamEvent> {
  const maxIterations = params.maxToolIterations ?? DEFAULT_MAX_TOOL_ITERATIONS;
  const request = await buildGeminiRequest(params, params.tools);
  let contents = request.contents;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    let finalEvent: GeminiStreamFinalEvent | undefined;
    for await (const event of streamGeminiResponseEvents(params, source, {
      ...request,
      contents,
    })) {
      if ('textDelta' in event) {
        yield { type: 'text_delta', text: event.textDelta };
      } else {
        finalEvent = event.final;
      }
    }

    if (!finalEvent) {
      throw new Error('Gemini stream ended without a final event.');
    }
    if (finalEvent.functionCalls.length === 0) {
      if (finalEvent.responseId) {
        yield { type: 'model_response', responseId: finalEvent.responseId };
      }
      return;
    }

    const results: LLMToolResult[] = [];
    for (const functionCall of finalEvent.functionCalls) {
      if (!functionCall.id) {
        throw new Error(`Gemini function call "${functionCall.name}" is missing its required id.`);
      }
      results.push(
        await params.onToolUse({
          id: functionCall.id,
          name: functionCall.name,
          input: functionCall.args ?? {},
        }),
      );
    }

    contents = [
      ...contents,
      finalEvent.assistantContent,
      { role: 'user', parts: buildFunctionResponses(finalEvent.functionCalls, results) },
    ];
  }

  throw new Error(`Gemini tool loop exceeded ${maxIterations} iterations.`);
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
        } else {
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
