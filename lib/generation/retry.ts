import { createLogger } from '@/lib/logger';
import type { AICallFn } from './pipeline-types';

const log = createLogger('GenerationRetry');

export const MAX_GENERATION_ATTEMPTS = 5;

export function buildStructuredRetryPrompt(
  userPrompt: string,
  previousResponse: string,
  reason: string,
): string {
  return `${userPrompt}

The previous response could not be used.

Problem:
${reason}

Previous response:
${previousResponse.slice(0, 8000)}

Regenerate the entire response now. Return a complete response that exactly matches the requested structure. Do not include markdown fences, comments, or explanatory text outside the requested output.`;
}

export async function generateWithStructuredRetries<T>(params: {
  label: string;
  systemPrompt: string;
  userPrompt: string;
  aiCall: AICallFn;
  parse: (response: string) => T;
  images?: Array<{ id: string; src: string }>;
}): Promise<T> {
  let lastResponse = '';
  let lastError: Error | null = null;
  let lastFailureKind: 'request' | 'response' = 'response';

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt += 1) {
    const prompt =
      lastResponse.length === 0
        ? params.userPrompt
        : buildStructuredRetryPrompt(
            params.userPrompt,
            lastResponse,
            lastError?.message ?? 'The previous response had an invalid structure.',
          );

    let response: string;
    try {
      response = await params.aiCall(params.systemPrompt, prompt, params.images);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      lastFailureKind = 'request';
      const message = `${params.label} request failed (attempt ${attempt}/${MAX_GENERATION_ATTEMPTS}): ${lastError.message}`;

      if (attempt < MAX_GENERATION_ATTEMPTS) {
        log.warn(message, 'Retrying request.');
      } else {
        log.error(message);
      }
      continue;
    }

    lastResponse = response;

    try {
      return params.parse(response);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      lastFailureKind = 'response';
      const message = `${params.label} invalid response (attempt ${attempt}/${MAX_GENERATION_ATTEMPTS}): ${lastError.message}`;

      if (attempt < MAX_GENERATION_ATTEMPTS) {
        log.warn(message, 'Retrying with correction prompt.');
      } else {
        log.error(message, lastResponse.substring(0, 500));
      }
    }
  }

  throw new Error(
    `${params.label} ${lastFailureKind === 'request' ? 'request failed' : 'response stayed invalid'} after ${MAX_GENERATION_ATTEMPTS} attempts: ${lastError?.message ?? 'invalid response'}`,
  );
}
