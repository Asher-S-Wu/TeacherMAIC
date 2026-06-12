/**
 * LLM Adapter for LangGraph
 *
 * Provides the LangChain interface for LLM calls.
 * Uses the unified callLLM / streamLLM layer.
 */

import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import type { ChatResult } from '@langchain/core/outputs';

import { callLLM, streamLLMEvents, streamLLMWithTools } from '@/lib/ai/llm';
import type {
  LLMMessageContent,
  LLMToolResult,
  LLMToolUse,
  ResponsesTool,
} from '@/lib/ai/llm';
import type { ResponsesModel } from '@/lib/ai/providers';
import { createLogger } from '@/lib/logger';

const log = createLogger('ResponsesAdapter');

/**
 * Stream chunk types for streaming generation
 */
export type StreamChunk =
  | { type: 'delta'; content: string }
  | { type: 'model_response'; responseId: string }
  | { type: 'done'; content: string };

/**
 * Adapter to use the configured Responses model with LangGraph.
 */
export class ResponsesLangGraphAdapter extends BaseChatModel {
  private languageModel: ResponsesModel;

  constructor(languageModel: ResponsesModel) {
    super({});
    this.languageModel = languageModel;
  }

  _llmType(): string {
    return 'responses';
  }

  _combineLLMOutput() {
    return {};
  }

  /**
   * Convert LangChain messages to the internal LLM message format.
   */
  private convertMessages(
    messages: BaseMessage[],
  ): { role: 'system' | 'user' | 'assistant'; content: LLMMessageContent }[] {
    return messages.map((msg) => {
      const content = msg.content as LLMMessageContent;
      if (msg instanceof HumanMessage) {
        return { role: 'user' as const, content };
      } else if (msg instanceof AIMessage) {
        return { role: 'assistant' as const, content };
      } else if (msg instanceof SystemMessage) {
        return { role: 'system' as const, content };
      } else {
        return { role: 'user' as const, content };
      }
    });
  }

  async _generate(
    messages: BaseMessage[],
    options?: this['ParsedCallOptions'],
    _runManager?: CallbackManagerForLLMRun,
  ): Promise<ChatResult> {
    const aiMessages = this.convertMessages(messages);
    const abortSignal =
      options && 'signal' in options ? (options.signal as AbortSignal | undefined) : undefined;

    try {
      const result = await callLLM(
        {
          model: this.languageModel,
          messages: aiMessages,
          abortSignal,
        },
        'responses-adapter',
      );

      const content = result.text || '';

      log.info('[Responses Adapter] Response:', {
        textLength: content.length,
      });

      // Create AI message
      const aiMessage = new AIMessage({ content });

      return {
        generations: [
          {
            text: content,
            message: aiMessage,
          },
        ],
        llmOutput: {},
      };
    } catch (error) {
      log.error('[Responses Adapter Error]', error);
      throw error;
    }
  }

  /**
   * Stream generate with text deltas
   *
   * Yields chunks of text as they arrive, then yields done with full content.
   */
  async *streamGenerate(
    messages: BaseMessage[],
    options?: { signal?: AbortSignal; previousResponseId?: string },
  ): AsyncGenerator<StreamChunk> {
    const aiMessages = this.convertMessages(messages);

    const result = streamLLMEvents(
      {
        model: this.languageModel,
        messages: aiMessages,
        previousResponseId: options?.previousResponseId,
        abortSignal: options?.signal,
      },
      'responses-adapter-stream',
    );

    let fullContent = '';

    for await (const event of result) {
      if (event.type === 'model_response') {
        yield { type: 'model_response', responseId: event.responseId };
        continue;
      }

      if (event.text) {
        fullContent += event.text;
        yield { type: 'delta', content: event.text };
      }
    }

    // Yield done with full content
    yield { type: 'done', content: fullContent };
  }

  /**
   * Stream generate with OpenAI-compatible native tool use.
   */
  async *streamGenerateWithTools(
    messages: BaseMessage[],
    tools: ResponsesTool[],
    onToolUse: (toolUse: LLMToolUse) => Promise<LLMToolResult> | LLMToolResult,
    options?: { signal?: AbortSignal; previousResponseId?: string },
  ): AsyncGenerator<StreamChunk> {
    const aiMessages = this.convertMessages(messages);
    const textAndToolStream = streamLLMWithTools(
      {
        model: this.languageModel,
        messages: aiMessages,
        tools,
        onToolUse,
        previousResponseId: options?.previousResponseId,
        abortSignal: options?.signal,
      },
      'responses-adapter-tool-stream',
    );

    let fullContent = '';

    for await (const event of textAndToolStream) {
      if (event.type === 'model_response') {
        yield { type: 'model_response', responseId: event.responseId };
        continue;
      }

      if (event.type !== 'text_delta' || !event.text) continue;

      fullContent += event.text;
      yield { type: 'delta', content: event.text };
    }

    yield { type: 'done', content: fullContent };
  }
}
