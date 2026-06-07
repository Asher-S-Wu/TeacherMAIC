/**
 * Unified LLM Call Layer
 *
 * Text generation uses MiniMax M3 through the Anthropic-compatible Messages API.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createLogger } from '@/lib/logger';
import type { ChatCompletionsModel } from './providers';
import { MINIMAX_M3_RECOMMENDED_OUTPUT_TOKENS } from './minimax-models';
import type { ThinkingConfig } from '@/lib/types/provider';

const log = createLogger('LLM');

export type { ThinkingConfig } from '@/lib/types/provider';

type TextPart = { type: 'text'; text: string };
type ImagePart = { type: 'image'; image: string; mimeType?: string };
type VideoPart = {
  type: 'video';
  video: string;
  mimeType?: string;
  fps?: number;
  maxLongSidePixel?: number;
  detail?: 'low' | 'default' | 'high';
};
type MinimaxVideoBlockParam = {
  type: 'video';
  source: {
    type: 'url' | 'base64';
    url?: string;
    media_type?: string;
    data?: string;
    detail?: 'low' | 'default' | 'high';
    fps?: number;
    max_long_side_pixel?: number;
  };
  cache_control?: Anthropic.CacheControlEphemeral | null;
};
type MinimaxContentBlockParam = Anthropic.ContentBlockParam | MinimaxVideoBlockParam;
export type LLMMessageContent =
  | string
  | Array<TextPart | ImagePart | VideoPart | MinimaxContentBlockParam>;
export type LLMMessage = {
  role: 'system' | 'user' | 'assistant';
  content: LLMMessageContent;
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
  | { type: 'tool_use'; toolUse: LLMToolUse }
  | { type: 'message_history'; messages: Anthropic.MessageParam[] };

export type LLMStreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'message_history'; messages: Anthropic.MessageParam[] };

export interface LLMToolLoopParams extends LLMStreamParams {
  tools: Anthropic.Tool[];
  onToolUse: (toolUse: LLMToolUse) => Promise<LLMToolResult> | LLMToolResult;
  maxToolIterations?: number;
}

const DEFAULT_VALIDATE = (text: string) => text.trim().length > 0;
const DEFAULT_TEMPERATURE = 1;
const DEFAULT_TOP_P = 0.95;
const DEFAULT_MAX_TOOL_ITERATIONS = 16;

function getMaxOutputTokens(_params: LLMGenerateParams): number {
  return MINIMAX_M3_RECOMMENDED_OUTPUT_TOKENS;
}

function getRequestMetadata(
  model: ChatCompletionsModel,
): Anthropic.MessageCreateParamsNonStreaming['metadata'] | undefined {
  return model.metadataUserId ? { user_id: model.metadataUserId } : undefined;
}

function shouldSendAdaptiveThinking(config?: ThinkingConfig): boolean {
  return !(
    config?.mode === 'disabled' ||
    config?.enabled === false ||
    config?.effort === 'none'
  );
}

function getThinkingConfig(config?: ThinkingConfig): Anthropic.ThinkingConfigParam {
  return shouldSendAdaptiveThinking(config) ? { type: 'adaptive' } : { type: 'disabled' };
}

function getClient(model: ChatCompletionsModel): Anthropic {
  return new Anthropic({
    apiKey: model.apiKey,
    baseURL: model.baseUrl.replace(/\/$/, ''),
  });
}

function getMimeType(mimeType?: string): Anthropic.Base64ImageSource['media_type'] {
  if (
    mimeType === 'image/jpeg' ||
    mimeType === 'image/png' ||
    mimeType === 'image/gif' ||
    mimeType === 'image/webp'
  ) {
    return mimeType;
  }
  return 'image/png';
}

function imageToAnthropicBlock(part: ImagePart): Anthropic.ImageBlockParam {
  const dataUriMatch = part.image.match(/^data:([^;]+);base64,(.+)$/);
  if (dataUriMatch) {
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: getMimeType(dataUriMatch[1]),
        data: dataUriMatch[2],
      },
    };
  }

  if (part.image.startsWith('http://') || part.image.startsWith('https://')) {
    return {
      type: 'image',
      source: {
        type: 'url',
        url: part.image,
      },
    };
  }

  return {
    type: 'image',
    source: {
      type: 'base64',
      media_type: getMimeType(part.mimeType),
      data: part.image,
    },
  };
}

function getVideoMimeType(mimeType?: string): string {
  if (
    mimeType === 'video/mp4' ||
    mimeType === 'video/avi' ||
    mimeType === 'video/x-msvideo' ||
    mimeType === 'video/quicktime' ||
    mimeType === 'video/mov' ||
    mimeType === 'video/x-matroska'
  ) {
    return mimeType;
  }
  return 'video/mp4';
}

function mediaOptions(part: VideoPart): Pick<
  MinimaxVideoBlockParam['source'],
  'detail' | 'fps' | 'max_long_side_pixel'
> {
  return {
    ...(part.detail ? { detail: part.detail } : {}),
    ...(typeof part.fps === 'number' ? { fps: part.fps } : {}),
    ...(typeof part.maxLongSidePixel === 'number'
      ? { max_long_side_pixel: part.maxLongSidePixel }
      : {}),
  };
}

function videoToMinimaxBlock(part: VideoPart): MinimaxVideoBlockParam {
  const dataUriMatch = part.video.match(/^data:([^;]+);base64,(.+)$/);
  if (dataUriMatch) {
    return {
      type: 'video',
      source: {
        type: 'base64',
        media_type: getVideoMimeType(dataUriMatch[1]),
        data: dataUriMatch[2],
        ...mediaOptions(part),
      },
    };
  }

  if (
    part.video.startsWith('http://') ||
    part.video.startsWith('https://') ||
    part.video.startsWith('mm_file://')
  ) {
    return {
      type: 'video',
      source: {
        type: 'url',
        url: part.video,
        ...mediaOptions(part),
      },
    };
  }

  return {
    type: 'video',
    source: {
      type: 'base64',
      media_type: getVideoMimeType(part.mimeType),
      data: part.video,
      ...mediaOptions(part),
    },
  };
}

function isRawAnthropicBlock(part: unknown): part is MinimaxContentBlockParam {
  if (!isRecord(part) || typeof part.type !== 'string') return false;
  if (part.type === 'image' || part.type === 'video') {
    return isRecord(part.source);
  }
  return (
    part.type === 'thinking' ||
    part.type === 'tool_use' ||
    part.type === 'tool_result' ||
    part.type === 'mid_conv_system' ||
    part.type === 'redacted_thinking'
  );
}

function contentToPlainText(content: LLMMessageContent): string {
  if (typeof content === 'string') return content;
  return content
    .filter((part): part is TextPart => part.type === 'text')
    .map((part) => part.text)
    .join('\n');
}

function contentToAnthropicBlocks(
  content: LLMMessageContent,
  role: 'user' | 'assistant',
): MinimaxContentBlockParam[] {
  if (typeof content === 'string') {
    return content ? [{ type: 'text', text: content }] : [];
  }

  const blocks: MinimaxContentBlockParam[] = [];
  for (const part of content) {
    if (isRawAnthropicBlock(part)) {
      blocks.push(part);
      continue;
    }

    if (part.type === 'text') {
      if (part.text) blocks.push({ type: 'text', text: part.text });
      continue;
    }

    if (role === 'assistant') {
      continue;
    }

    if (part.type === 'image') {
      blocks.push(imageToAnthropicBlock(part));
      continue;
    }

    if (part.type === 'video') {
      blocks.push(videoToMinimaxBlock(part));
    }
  }

  return blocks;
}

function buildAnthropicInput(params: LLMGenerateParams): {
  system?: string;
  messages: Anthropic.MessageParam[];
} {
  const messages: Anthropic.MessageParam[] = [];
  const systemParts: string[] = [];

  if (params.system?.trim()) {
    systemParts.push(params.system.trim());
  }

  for (const message of params.messages ?? []) {
    if (message.role === 'system') {
      const text = contentToPlainText(message.content).trim();
      if (text) systemParts.push(text);
      continue;
    }

    const content = contentToAnthropicBlocks(message.content, message.role);
    if (content.length === 0) continue;

    messages.push({
      role: message.role,
      content: content as Anthropic.ContentBlockParam[],
    });
  }

  if (params.prompt !== undefined) {
    messages.push({
      role: 'user',
      content: [{ type: 'text', text: params.prompt }],
    });
  }

  if (messages.length === 0) {
    throw new Error('LLM request missing input');
  }

  return {
    messages,
    ...(systemParts.length > 0 ? { system: systemParts.join('\n\n') } : {}),
  };
}

function buildMessageCreateParams(
  params: LLMGenerateParams,
  thinking?: ThinkingConfig,
): Anthropic.MessageCreateParamsNonStreaming {
  const input = buildAnthropicInput(params);
  const metadata = getRequestMetadata(params.model);
  return {
    model: params.model.modelId as Anthropic.Model,
    max_tokens: getMaxOutputTokens(params),
    messages: input.messages,
    ...(input.system ? { system: input.system } : {}),
    ...(metadata ? { metadata } : {}),
    thinking: getThinkingConfig(thinking),
    temperature: DEFAULT_TEMPERATURE,
    top_p: DEFAULT_TOP_P,
  };
}

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

function extractTextFromAnthropicContent(content: Anthropic.ContentBlock[]): string {
  return content
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('');
}

async function createMessage(
  params: LLMGenerateParams,
  source: string,
  thinking?: ThinkingConfig,
): Promise<Anthropic.Message> {
  const client = getClient(params.model);
  const body = buildMessageCreateParams(params, thinking);

  try {
    return await client.messages.create(body, { signal: params.abortSignal });
  } catch (error) {
    throw wrapLLMError(error, source, params.model.modelId);
  }
}

async function* streamTextGeneration(
  params: LLMStreamParams,
  source: string,
  thinking?: ThinkingConfig,
): AsyncIterable<string> {
  const client = getClient(params.model);
  const body = buildMessageCreateParams(params, thinking);

  try {
    const stream = client.messages.stream(body, { signal: params.abortSignal });
    for await (const event of stream) {
      if (event.type !== 'content_block_delta') continue;
      if (event.delta.type === 'text_delta' && event.delta.text) {
        yield event.delta.text;
      }
    }
    await stream.finalMessage();
  } catch (error) {
    throw wrapLLMError(error, source, params.model.modelId);
  }
}

async function* streamTextGenerationEvents(
  params: LLMStreamParams,
  source: string,
  thinking?: ThinkingConfig,
): AsyncIterable<LLMStreamEvent> {
  const client = getClient(params.model);
  const body = buildMessageCreateParams(params, thinking);

  try {
    const stream = client.messages.stream(body, { signal: params.abortSignal });
    for await (const event of stream) {
      if (event.type !== 'content_block_delta') continue;
      if (event.delta.type === 'text_delta' && event.delta.text) {
        yield { type: 'text_delta', text: event.delta.text };
      }
    }
    const message = await stream.finalMessage();
    yield {
      type: 'message_history',
      messages: [
        {
          role: 'assistant',
          content: message.content as Anthropic.ContentBlockParam[],
        },
      ],
    };
  } catch (error) {
    throw wrapLLMError(error, source, params.model.modelId);
  }
}

function getToolUseBlocks(message: Anthropic.Message): Anthropic.ToolUseBlock[] {
  return message.content.filter(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
  );
}

function buildToolResultBlocks(results: LLMToolResult[]): Anthropic.ToolResultBlockParam[] {
  return results.map((result) => ({
    type: 'tool_result',
    tool_use_id: result.toolUseId,
    content: result.content,
    ...(result.isError ? { is_error: true } : {}),
  }));
}

export async function* streamLLMWithTools(
  params: LLMToolLoopParams,
  source: string,
  thinking?: ThinkingConfig,
): AsyncIterable<LLMToolStreamEvent> {
  const client = getClient(params.model);
  const input = buildAnthropicInput(params);
  const messages = [...input.messages];
  const maxIterations = params.maxToolIterations ?? DEFAULT_MAX_TOOL_ITERATIONS;
  const generatedHistory: Anthropic.MessageParam[] = [];

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const metadata = getRequestMetadata(params.model);
    const request: Anthropic.MessageCreateParamsNonStreaming = {
      model: params.model.modelId as Anthropic.Model,
      max_tokens: getMaxOutputTokens(params),
      messages,
      ...(input.system ? { system: input.system } : {}),
      ...(metadata ? { metadata } : {}),
      thinking: getThinkingConfig(thinking),
      temperature: DEFAULT_TEMPERATURE,
      top_p: DEFAULT_TOP_P,
      tools: params.tools,
      tool_choice: { type: 'auto' },
    };

    let message: Anthropic.Message;
    try {
      const stream = client.messages.stream(request, { signal: params.abortSignal });
      for await (const event of stream) {
        if (event.type !== 'content_block_delta') continue;
        if (event.delta.type === 'text_delta' && event.delta.text) {
          yield { type: 'text_delta', text: event.delta.text };
        }
      }
      message = await stream.finalMessage();
    } catch (error) {
      throw wrapLLMError(error, source, params.model.modelId);
    }

    messages.push({
      role: 'assistant',
      content: message.content as Anthropic.ContentBlockParam[],
    });
    generatedHistory.push({
      role: 'assistant',
      content: message.content as Anthropic.ContentBlockParam[],
    });

    if (message.stop_reason === 'pause_turn') {
      continue;
    }

    const toolUses = getToolUseBlocks(message);
    if (toolUses.length === 0) {
      break;
    }

    const toolResults: LLMToolResult[] = [];
    for (const block of toolUses) {
      const toolUse: LLMToolUse = {
        id: block.id,
        name: block.name,
        input: block.input,
      };
      yield { type: 'tool_use', toolUse };
      toolResults.push(await params.onToolUse(toolUse));
    }

    const toolResultMessage: Anthropic.MessageParam = {
      role: 'user',
      content: buildToolResultBlocks(toolResults),
    };
    messages.push(toolResultMessage);
    generatedHistory.push(toolResultMessage);
  }

  if (generatedHistory.length > 0) {
    yield { type: 'message_history', messages: generatedHistory };
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
      const response = await createMessage(params, source, thinking);
      const result: LLMTextResult = {
        text: extractTextFromAnthropicContent(response.content),
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
  thinking?: ThinkingConfig,
): LLMStreamResult {
  return { textStream: streamTextGeneration(params, source, thinking) };
}

export function streamLLMEvents<T extends LLMStreamParams>(
  params: T,
  source: string,
  thinking?: ThinkingConfig,
): AsyncIterable<LLMStreamEvent> {
  return streamTextGenerationEvents(params, source, thinking);
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
