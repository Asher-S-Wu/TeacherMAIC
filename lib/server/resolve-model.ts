/**
 * Shared model resolution utilities for API routes.
 *
 * Resolves the server-configured text model into a single call.
 */

import type { NextRequest } from 'next/server';
import {
  DEFAULT_MODEL_STRING,
  DEFAULT_MODEL_ID,
  DEFAULT_PROVIDER_ID,
  getModel,
  type ModelWithInfo,
} from '@/lib/ai/providers';
import type { ThinkingConfig } from '@/lib/types/provider';
import { resolveApiKey } from '@/lib/server/provider-config';

export interface ResolvedModel extends ModelWithInfo {
  /** Server-configured model string (e.g. "minimax:MiniMax-M3") */
  modelString: string;
  /** Resolved provider ID. */
  providerId: string;
  /** API key resolved from server environment variables. */
  apiKey: string;
  /** Thinking config passed to the LLM adapter. Undefined keeps MiniMax adaptive thinking enabled. */
  thinkingConfig?: ThinkingConfig;
}

/**
 * Resolve the server-configured language model.
 * Model and key values live on the server.
 */
export async function resolveModel(): Promise<ResolvedModel> {
  const modelString = DEFAULT_MODEL_STRING;
  const providerId = DEFAULT_PROVIDER_ID;
  const modelId = DEFAULT_MODEL_ID;

  const apiKey = resolveApiKey(providerId);
  const { model, modelInfo } = getModel({
    providerId,
    modelId,
    apiKey,
  });

  return {
    model,
    modelInfo,
    modelString,
    providerId,
    apiKey,
    thinkingConfig: undefined,
  };
}

/**
 * Resolve the server-configured language model.
 */
export async function resolveModelFromHeaders(req: NextRequest): Promise<ResolvedModel> {
  void req;
  return resolveModel();
}

/**
 * Resolve the server-configured language model.
 */
export async function resolveModelFromRequest(
  req: NextRequest,
  body: unknown,
): Promise<ResolvedModel> {
  void req;
  void body;
  const resolved = await resolveModel();
  return resolved;
}
