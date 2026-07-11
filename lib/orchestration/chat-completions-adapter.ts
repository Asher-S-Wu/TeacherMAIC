/**
 * Gemini Adapter for LangGraph
 *
 * Provides the LangChain interface for official Gemini calls.
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
  LLMToolDefinition,
} from '@/lib/ai/llm';
import type { ResponsesModel } from '@/lib/ai/providers';
import { createLogger } from '@/lib/logger';

const log = createLogger('GeminiAdapter');

/**
 * Stream chunk types for streaming generation
 */
export type StreamChunk =
  | { type: 'delta'; content: string }
  | { type: 'model_response'; responseId: string }
  | { type: 'done'; content: string };

/**
 * Adapter to use the configured Gemini model with LangGraph.
 */
export class GeminiLangGraphAdapter extends BaseChatModel {
  private languageModel: ResponsesModel;

  constructor(languageModel: ResponsesModel) {
    super({});
    this.languageModel = languageModel;
  }

  _llmType(): string {
    return 'gemini';
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
        'gemini-adapter',
      );

      const content = result.text || '';

      log.info('[Gemini Adapter] Response:', {
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
      log.error('[Gemini Adapter Error]', error);
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
    options?: { signal?: AbortSignal },
  ): AsyncGenerator<StreamChunk> {
    const aiMessages = this.convertMessages(messages);

    const result = streamLLMEvents(
      {
        model: this.languageModel,
        messages: aiMessages,
        abortSignal: options?.signal,
      },
      'gemini-adapter-stream',
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
   * Stream generate with Gemini native function calling.
   */
  async *streamGenerateWithTools(
    messages: BaseMessage[],
    tools: LLMToolDefinition[],
    onToolUse: (toolUse: LLMToolUse) => Promise<LLMToolResult> | LLMToolResult,
    options?: { signal?: AbortSignal },
  ): AsyncGenerator<StreamChunk> {
    const aiMessages = this.convertMessages(messages);
    const textAndToolStream = streamLLMWithTools(
      {
        model: this.languageModel,
        messages: aiMessages,
        tools,
        onToolUse,
        abortSignal: options?.signal,
      },
      'gemini-adapter-tool-stream',
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
