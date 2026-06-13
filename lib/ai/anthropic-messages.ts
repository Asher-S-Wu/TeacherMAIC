/**
 * Anthropic Messages API transport for ZenMux text generation.
 */

import type { ResponsesModel } from './providers';
import type {
  LLMGenerateParams,
  LLMMessageContent,
  LLMStreamEvent,
  LLMStreamParams,
  LLMToolLoopParams,
  LLMToolResult,
  LLMToolStreamEvent,
  LLMToolUse,
  ResponsesTool,
} from './llm';
import { LLMTransportError } from './llm-transport-error';

const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MAX_TOKENS = 32768;

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | {
      type: 'image';
      source:
        | { type: 'base64'; media_type: string; data: string }
        | { type: 'url'; url: string };
    }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

type AnthropicMessage = {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
};

type AnthropicTool = {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
};

type AnthropicStreamEvent = {
  type?: string;
  delta?: {
    type?: string;
    text?: string;
    partial_json?: string;
    stop_reason?: string;
  };
  message?: { id?: string };
  index?: number;
  content_block?: AnthropicContentBlock;
  error?: { type?: string; message?: string };
};

type ContentBlockAccumulator = {
  type: string;
  text: string;
  id?: string;
  name?: string;
  inputJson: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (isRecord(error) && typeof error.message === 'string') return error.message;
  return String(error);
}

function wrapAnthropicError(error: unknown, source: string, modelId: string): Error {
  if (error instanceof Error && error.name === 'AbortError') return error;
  return new LLMTransportError(
    `LLM request failed [${source}, model=${modelId}]: ${describeError(error)}`,
    error,
  );
}

function getAnthropicMessagesUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/v1/messages`;
}

function contentToPlainText(content: LLMMessageContent): string {
  if (typeof content === 'string') return content;
  if (!content) return '';
  return content
    .filter(
      (part): part is { type: 'text'; text: string } | { type: 'input_text'; text: string } | { type: 'output_text'; text: string } =>
        (part.type === 'text' && 'text' in part) ||
        part.type === 'input_text' ||
        part.type === 'output_text',
    )
    .map((part) => part.text)
    .join('\n');
}

function inferImageMediaType(value: string, mimeType?: string): string {
  if (mimeType) return mimeType;
  if (value.startsWith('http://') || value.startsWith('https://')) return 'image/jpeg';
  return 'image/png';
}

function toAnthropicImageBlock(image: string, mimeType?: string): AnthropicContentBlock {
  if (image.startsWith('data:')) {
    const match = image.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      return {
        type: 'image',
        source: {
          type: 'base64',
          media_type: match[1],
          data: match[2],
        },
      };
    }
  }

  if (image.startsWith('http://') || image.startsWith('https://')) {
    return {
      type: 'image',
      source: { type: 'url', url: image },
    };
  }

  return {
    type: 'image',
    source: {
      type: 'base64',
      media_type: inferImageMediaType(image, mimeType),
      data: image,
    },
  };
}

function toAnthropicContent(
  content: LLMMessageContent,
  role: 'user' | 'assistant' | 'system' | 'developer',
): string | AnthropicContentBlock[] {
  if (typeof content === 'string') return content;
  if (!content) return '';

  const blocks: AnthropicContentBlock[] = [];
  for (const part of content) {
    if (part.type === 'video' || part.type === 'input_audio') {
      throw new Error('Anthropic Messages API does not support video or audio input.');
    }

    if (part.type === 'text' || part.type === 'input_text' || part.type === 'output_text') {
      if (!part.text) continue;
      blocks.push({ type: 'text', text: part.text });
      continue;
    }

    if (part.type === 'image') {
      if (role !== 'user') continue;
      blocks.push(toAnthropicImageBlock(part.image, part.mimeType));
      continue;
    }

    if (part.type === 'input_image' && role === 'user') {
      blocks.push(toAnthropicImageBlock(part.image_url));
    }
  }

  if (blocks.length === 0) return '';
  if (blocks.length === 1 && blocks[0].type === 'text') return blocks[0].text;
  return blocks;
}

function buildAnthropicConversation(params: LLMGenerateParams): {
  system?: string;
  messages: AnthropicMessage[];
} {
  let systemText = params.system?.trim() || '';
  const messages: AnthropicMessage[] = [];

  for (const message of params.messages ?? []) {
    if (message.role === 'system' || message.role === 'developer') {
      const text = contentToPlainText(message.content);
      if (text) {
        systemText = systemText ? `${systemText}\n\n${text}` : text;
      }
      continue;
    }

    const role = message.role === 'assistant' ? 'assistant' : 'user';
    const content = toAnthropicContent(message.content, message.role);
    if (content === '' || (Array.isArray(content) && content.length === 0)) continue;
    messages.push({ role, content });
  }

  if (params.prompt !== undefined) {
    messages.push({ role: 'user', content: params.prompt });
  }

  if (messages.length === 0) {
    throw new Error('LLM request missing input');
  }

  return {
    system: systemText || undefined,
    messages,
  };
}

function toAnthropicTools(tools: ResponsesTool[]): AnthropicTool[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters ?? { type: 'object', properties: {} },
  }));
}

function buildRequestBody(
  params: LLMGenerateParams,
  options?: {
    stream?: boolean;
    tools?: ResponsesTool[];
    messages?: AnthropicMessage[];
    system?: string;
  },
): Record<string, unknown> {
  const conversation = buildAnthropicConversation(params);

  return {
    model: params.model.modelId,
    max_tokens: DEFAULT_MAX_TOKENS,
    stream: options?.stream ?? false,
    ...(options?.system ?? conversation.system ? { system: options?.system ?? conversation.system } : {}),
    messages: options?.messages ?? conversation.messages,
    ...(options?.tools?.length
      ? {
          tools: toAnthropicTools(options.tools),
          tool_choice: { type: 'auto' },
        }
      : {}),
  };
}

async function createAnthropicStream(
  params: LLMStreamParams,
  source: string,
  body: Record<string, unknown>,
): Promise<Response> {
  try {
    const response = await fetch(getAnthropicMessagesUrl(params.model.baseUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': params.model.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
      signal: params.abortSignal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText.slice(0, 500)}`);
    }

    if (!response.body) {
      throw new Error('Anthropic stream response is missing body');
    }

    return response;
  } catch (error) {
    throw wrapAnthropicError(error, source, params.model.modelId);
  }
}

async function* parseAnthropicSSE(response: Response): AsyncGenerator<AnthropicStreamEvent> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    while (true) {
      const separatorIndex = buffer.indexOf('\n\n');
      if (separatorIndex === -1) break;

      const chunk = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);

      const dataLines = chunk
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim());

      if (dataLines.length === 0) continue;

      const payload = dataLines.join('\n');
      if (!payload || payload === '[DONE]') continue;

      try {
        yield JSON.parse(payload) as AnthropicStreamEvent;
      } catch {
        // Ignore malformed SSE payloads.
      }
    }
  }
}

function throwIfAnthropicStreamError(event: AnthropicStreamEvent, source: string, modelId: string): void {
  if (event.type === 'error') {
    throw wrapAnthropicError(event.error ?? event, source, modelId);
  }
}

function finalizeContentBlocks(
  blocks: Map<number, ContentBlockAccumulator>,
): AnthropicContentBlock[] {
  const finalized: AnthropicContentBlock[] = [];

  for (const index of [...blocks.keys()].sort((a, b) => a - b)) {
    const block = blocks.get(index);
    if (!block) continue;

    if (block.type === 'text') {
      finalized.push({ type: 'text', text: block.text });
      continue;
    }

    if (block.type === 'tool_use' && block.id && block.name) {
      finalized.push({
        type: 'tool_use',
        id: block.id,
        name: block.name,
        input: JSON.parse(block.inputJson.trim() || '{}') as Record<string, unknown>,
      });
    }
  }

  return finalized;
}

function buildToolResultMessages(
  assistantContent: AnthropicContentBlock[],
  results: LLMToolResult[],
): AnthropicMessage[] {
  const resultById = new Map(results.map((result) => [result.toolUseId, result]));

  return [
    { role: 'assistant', content: assistantContent },
    {
      role: 'user',
      content: assistantContent
        .filter((block): block is Extract<AnthropicContentBlock, { type: 'tool_use' }> => block.type === 'tool_use')
        .map((block) => {
          const result = resultById.get(block.id);
          if (!result) {
            throw new Error(`Missing tool result for tool_use_id: ${block.id}`);
          }
          return {
            type: 'tool_result' as const,
            tool_use_id: block.id,
            content: result.isError ? `Error: ${result.content}` : result.content,
            ...(result.isError ? { is_error: true } : {}),
          };
        }),
    },
  ];
}

async function* streamAnthropicResponseEvents(
  params: LLMStreamParams,
  source: string,
  body: Record<string, unknown>,
): AsyncIterable<{
  textDelta?: string;
  responseId?: string;
  stopReason?: string;
  contentBlocks?: AnthropicContentBlock[];
}> {
  const response = await createAnthropicStream(params, source, body);
  const blocks = new Map<number, ContentBlockAccumulator>();
  let responseId: string | undefined;
  let stopReason: string | undefined;

  for await (const event of parseAnthropicSSE(response)) {
    throwIfAnthropicStreamError(event, source, params.model.modelId);

    if (event.type === 'message_start') {
      responseId = event.message?.id;
      continue;
    }

    if (event.type === 'content_block_start' && typeof event.index === 'number') {
      const blockType = event.content_block?.type ?? 'text';
      blocks.set(event.index, {
        type: blockType,
        text: blockType === 'text' ? event.content_block?.text ?? '' : '',
        id: blockType === 'tool_use' ? event.content_block?.id : undefined,
        name: blockType === 'tool_use' ? event.content_block?.name : undefined,
        inputJson: '',
      });
      continue;
    }

    if (event.type === 'content_block_delta' && typeof event.index === 'number') {
      const block = blocks.get(event.index);
      if (!block) continue;

      if (event.delta?.type === 'text_delta' && event.delta.text) {
        block.text += event.delta.text;
        yield { textDelta: event.delta.text };
      }

      if (event.delta?.type === 'input_json_delta' && event.delta.partial_json) {
        block.inputJson += event.delta.partial_json;
      }
      continue;
    }

    if (event.type === 'message_delta') {
      stopReason = event.delta?.stop_reason ?? stopReason;
    }
  }

  yield {
    responseId,
    stopReason,
    contentBlocks: finalizeContentBlocks(blocks),
  };
}

export function isAnthropicMessagesModel(model: ResponsesModel): boolean {
  return model.providerType === 'anthropic-messages';
}

export async function* streamAnthropicTextGenerationEvents(
  params: LLMStreamParams,
  source: string,
): AsyncIterable<LLMStreamEvent> {
  for await (const event of streamAnthropicResponseEvents(
    params,
    source,
    buildRequestBody(params, { stream: true }),
  )) {
    if (event.textDelta) {
      yield { type: 'text_delta', text: event.textDelta };
    }
    if (event.responseId) {
      yield { type: 'model_response', responseId: event.responseId };
    }
  }
}

export async function* streamAnthropicLLMWithTools(
  params: LLMToolLoopParams,
  source: string,
): AsyncIterable<LLMToolStreamEvent> {
  const maxIterations = params.maxToolIterations ?? 16;
  const conversation = buildAnthropicConversation(params);
  let messages = conversation.messages;
  let completed = false;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    let responseId: string | undefined;
    let stopReason: string | undefined;
    let contentBlocks: AnthropicContentBlock[] = [];

    for await (const event of streamAnthropicResponseEvents(
      params,
      source,
      buildRequestBody(params, {
        stream: true,
        tools: params.tools,
        messages,
        system: conversation.system,
      }),
    )) {
      if (event.textDelta) {
        yield { type: 'text_delta', text: event.textDelta };
      }
      if (event.responseId) responseId = event.responseId;
      if (event.stopReason) stopReason = event.stopReason;
      if (event.contentBlocks) contentBlocks = event.contentBlocks;
    }

    const toolUses = contentBlocks.filter(
      (block): block is Extract<AnthropicContentBlock, { type: 'tool_use' }> => block.type === 'tool_use',
    );

    if (toolUses.length === 0) {
      if (responseId) yield { type: 'model_response', responseId };
      completed = true;
      break;
    }

    if (stopReason !== 'tool_use') {
      throw new Error('Anthropic tool call response ended without tool_use stop reason.');
    }

    const toolResults: LLMToolResult[] = [];
    for (const toolUse of toolUses) {
      const request: LLMToolUse = {
        id: toolUse.id,
        name: toolUse.name,
        input: toolUse.input,
      };
      toolResults.push(await params.onToolUse(request));
    }

    messages = [...messages, ...buildToolResultMessages(contentBlocks, toolResults)];
  }

  if (!completed) {
    throw new Error(`Anthropic tool loop exceeded ${maxIterations} iterations.`);
  }
}
