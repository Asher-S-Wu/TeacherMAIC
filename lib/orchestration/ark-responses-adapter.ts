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

import { callLLM, streamLLM } from '@/lib/ai/llm';
import type { ArkResponsesModel } from '@/lib/ai/providers';
import type { ThinkingConfig } from '@/lib/types/provider';
import { createLogger } from '@/lib/logger';

const log = createLogger('ArkResponsesAdapter');

/**
 * Stream chunk types for streaming generation
 */
export type StreamChunk = { type: 'delta'; content: string } | { type: 'done'; content: string };

/**
 * Adapter to use the configured Ark Responses model with LangGraph.
 */
export class ArkResponsesLangGraphAdapter extends BaseChatModel {
  private languageModel: ArkResponsesModel;
  private thinking?: ThinkingConfig;

  constructor(languageModel: ArkResponsesModel, thinking?: ThinkingConfig) {
    super({});
    this.languageModel = languageModel;
    this.thinking = thinking;
  }

  _llmType(): string {
    return 'ark-responses';
  }

  _combineLLMOutput() {
    return {};
  }

  /**
   * Convert LangChain messages to the internal LLM message format.
   */
  private convertMessages(
    messages: BaseMessage[],
  ): { role: 'system' | 'user' | 'assistant'; content: string }[] {
    return messages.map((msg) => {
      if (msg instanceof HumanMessage) {
        return { role: 'user' as const, content: msg.content as string };
      } else if (msg instanceof AIMessage) {
        return { role: 'assistant' as const, content: msg.content as string };
      } else if (msg instanceof SystemMessage) {
        return { role: 'system' as const, content: msg.content as string };
      } else {
        return { role: 'user' as const, content: msg.content as string };
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
        'chat-adapter',
        undefined,
        this.thinking,
      );

      const content = result.text || '';

      log.info('[Ark Responses Adapter] Response:', {
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
      log.error('[Ark Responses Adapter Error]', error);
      throw error;
    }
  }

  /**
   * Stream generate with text deltas
   *
   * Yields chunks of text as they arrive, then yields done with full content.
   * Uses streamLLM for Responses API streaming.
   */
  async *streamGenerate(
    messages: BaseMessage[],
    options?: { signal?: AbortSignal },
  ): AsyncGenerator<StreamChunk> {
    const aiMessages = this.convertMessages(messages);

    const result = streamLLM(
      {
        model: this.languageModel,
        messages: aiMessages,
        abortSignal: options?.signal,
      },
      'chat-adapter-stream',
      this.thinking,
    );

    let fullContent = '';

    for await (const chunk of result.textStream) {
      if (chunk) {
        fullContent += chunk;
        yield { type: 'delta', content: chunk };
      }
    }

    // Yield done with full content
    yield { type: 'done', content: fullContent };
  }
}
