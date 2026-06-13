import type { StatelessChatRequest } from '@/lib/types/chat';
import type { LLMMessage } from '@/lib/ai/llm';

// ==================== Message Conversion ====================

/**
 * Convert UI messages to Responses input messages.
 * Action badges are summarized as plain text because tool state is now kept
 * by the Responses API session through previous_response_id.
 */
export function convertMessagesToResponsesInput(
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
  options?: { anchorOnPreviousResponse?: boolean },
): { messages: LLMMessage[]; previousResponseId?: string } {
  const anchorOnPreviousResponse = options?.anchorOnPreviousResponse ?? true;

  if (!anchorOnPreviousResponse) {
    return {
      messages: convertMessagesToResponsesInput(messages, currentAgentId),
      previousResponseId: undefined,
    };
  }

  const anchorIndex = findPreviousResponseAnchor(messages, currentAgentId);
  const previousResponseId =
    anchorIndex >= 0 ? messages[anchorIndex].metadata?.modelResponseId : undefined;
  const messagesAfterAnchor = anchorIndex >= 0 ? messages.slice(anchorIndex + 1) : messages;
  const converted: LLMMessage[] = [];

  for (const msg of messagesAfterAnchor) {
    if (msg.role !== 'user' && msg.role !== 'assistant') continue;
    const fallback = convertMessagesToResponsesInput([msg], currentAgentId);
    converted.push(...fallback);
  }

  return { messages: converted, previousResponseId };
}

function findPreviousResponseAnchor(
  messages: StatelessChatRequest['messages'],
  currentAgentId?: string,
): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'assistant') continue;
    if (msg.metadata?.interrupted) continue;
    if (!msg.metadata?.modelResponseId) continue;
    if (currentAgentId && msg.metadata?.agentId !== currentAgentId) {
      continue;
    }
    return i;
  }

  return -1;
}
