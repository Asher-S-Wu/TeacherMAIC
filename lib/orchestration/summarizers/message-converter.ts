import type { StatelessChatRequest } from '@/lib/types/chat';
import type { LLMMessage } from '@/lib/ai/llm';

// ==================== Message Conversion ====================

/**
 * Convert UI messages to OpenAI format
 * Includes tool call information so the model knows what actions were taken
 */
export function convertMessagesToOpenAI(
  messages: StatelessChatRequest['messages'],
  currentAgentId?: string,
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  return messages
    .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
    .map((msg) => {
      if (msg.role === 'assistant') {
        const contentParts: string[] = [];

        if (msg.parts) {
          for (const part of msg.parts) {
            const p = part as Record<string, unknown>;

            if (p.type === 'text' && p.text) {
              contentParts.push(p.text as string);
            } else if ((p.type as string)?.startsWith('action-') && p.state === 'result') {
              const actionName = (p.actionName ||
                (p.type as string).replace('action-', '')) as string;
              const output = p.output as Record<string, unknown> | undefined;
              const isSuccess = output?.success === true;
              const resultSummary = isSuccess
                ? output?.data
                  ? `result: ${JSON.stringify(output.data).slice(0, 100)}`
                  : 'success'
                : (output?.error as string) || 'failed';
              contentParts.push(`[Action ${actionName}: ${resultSummary}]`);
            }
          }
        }

        const content = contentParts.join('\n');
        const msgAgentId = msg.metadata?.agentId;

        // When currentAgentId is provided and this message is from a DIFFERENT agent,
        // convert to user role with agent name attribution
        if (currentAgentId && msgAgentId && msgAgentId !== currentAgentId) {
          const agentName = msg.metadata?.senderName || msgAgentId;
          return {
            role: 'user' as const,
            content: content ? `[${agentName}]: ${content}` : '',
          };
        }

        return {
          role: 'assistant' as const,
          content,
        };
      }

      // User messages: keep plain text concatenation
      const contentParts: string[] = [];

      if (msg.parts) {
        for (const part of msg.parts) {
          const p = part as Record<string, unknown>;

          if (p.type === 'text' && p.text) {
            contentParts.push(p.text as string);
          } else if ((p.type as string)?.startsWith('action-') && p.state === 'result') {
            const actionName = (p.actionName ||
              (p.type as string).replace('action-', '')) as string;
            const output = p.output as Record<string, unknown> | undefined;
            const isSuccess = output?.success === true;
            const resultSummary = isSuccess
              ? output?.data
                ? `result: ${JSON.stringify(output.data).slice(0, 100)}`
                : 'success'
              : (output?.error as string) || 'failed';
            contentParts.push(`[Action ${actionName}: ${resultSummary}]`);
          }
        }
      }

      // Extract speaker name from metadata (e.g. other agents' messages in discussion)
      const senderName = msg.metadata?.senderName;
      let content = contentParts.join('\n');
      if (senderName) {
        content = `[${senderName}]: ${content}`;
      }

      // Annotate interrupted messages so the LLM knows context was cut short
      const isInterrupted =
        (msg as unknown as Record<string, unknown>).metadata &&
        ((msg as unknown as Record<string, unknown>).metadata as Record<string, unknown>)
          ?.interrupted;
      return {
        role: 'user' as const,
        content: isInterrupted
          ? `${content}\n[This response was interrupted. Start a new complete response; do not continue partial wording.]`
          : content,
      };
    })
    .filter((msg) => {
      // Drop empty messages and messages with only dots/ellipsis/whitespace
      // (produced by failed agent streams)
      const stripped = msg.content.replace(/[.\s…]+/g, '');
      return stripped.length > 0;
    });
}

export function convertMessagesToLLMHistory(
  messages: StatelessChatRequest['messages'],
  currentAgentId?: string,
): LLMMessage[] {
  const converted: LLMMessage[] = [];

  for (const msg of messages) {
    if (msg.role !== 'user' && msg.role !== 'assistant') continue;

    const isInterrupted =
      (msg as unknown as Record<string, unknown>).metadata &&
      ((msg as unknown as Record<string, unknown>).metadata as Record<string, unknown>)
        ?.interrupted;

    if (
      msg.role === 'assistant' &&
      !isInterrupted &&
      msg.metadata?.modelHistory?.length &&
      (!currentAgentId || !msg.metadata.agentId || msg.metadata.agentId === currentAgentId)
    ) {
      for (const historyMessage of msg.metadata.modelHistory) {
        converted.push({
          role: historyMessage.role,
          content: historyMessage.content as LLMMessage['content'],
          toolCalls: historyMessage.tool_calls as LLMMessage['toolCalls'],
          toolCallId: historyMessage.tool_call_id,
          name: historyMessage.name,
        });
      }
      continue;
    }

    const fallback = convertMessagesToOpenAI([msg], currentAgentId);
    converted.push(...fallback);
  }

  return converted;
}
