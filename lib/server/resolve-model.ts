/**
 * Shared model resolution utilities for API routes.
 *
 * Extracts the repeated parseModelString → resolveApiKey → getModel
 * boilerplate into a single call.
 */

import type { NextRequest } from 'next/server';
import {
  DEFAULT_MODEL_STRING,
  getModel,
  parseModelString,
  type ModelWithInfo,
} from '@/lib/ai/providers';
import type { ThinkingConfig } from '@/lib/types/provider';
import { resolveApiKey } from '@/lib/server/provider-config';

export interface ResolvedModel extends ModelWithInfo {
  /** Original model string (e.g. "kimi:moonshotai/kimi-k2.6") */
  modelString: string;
  /** Resolved provider ID (e.g. "kimi") */
  providerId: string;
  /** Effective API key after server-side fallback resolution */
  apiKey: string;
  /** Optional per-request thinking configuration from the client. */
  thinkingConfig?: ThinkingConfig;
}

/**
 * Resolve a language model from explicit parameters.
 *
 * Use this when model config comes from the request body.
 */
export async function resolveModel(params: {
  modelString?: string;
  apiKey?: string;
  thinkingConfig?: ThinkingConfig;
}): Promise<ResolvedModel> {
  const modelString = params.modelString || process.env.DEFAULT_MODEL || DEFAULT_MODEL_STRING;
  const { providerId, modelId } = parseModelString(modelString);

  const apiKey = resolveApiKey(providerId, params.apiKey || '');
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
    thinkingConfig: params.thinkingConfig,
  };
}

function getThinkingConfigFromBody(body: unknown): ThinkingConfig | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const record = body as { thinkingConfig?: unknown; thinking?: unknown };
  const config = record.thinkingConfig ?? record.thinking;
  return config && typeof config === 'object' ? (config as ThinkingConfig) : undefined;
}

/**
 * Resolve a language model from standard request headers.
 *
 * Reads: x-model, x-api-key
 * Note: requiresApiKey is derived server-side from the provider registry,
 * never from client headers, to prevent auth bypass.
 */
export async function resolveModelFromHeaders(req: NextRequest): Promise<ResolvedModel> {
  return resolveModel({
    modelString: req.headers.get('x-model') || undefined,
    apiKey: req.headers.get('x-api-key') || undefined,
  });
}

/**
 * Resolve a language model from standard request headers plus body fields.
 *
 * Reads model credentials from headers and per-request thinking config from
 * the JSON body field `thinkingConfig` (or legacy/eval field `thinking`).
 */
export async function resolveModelFromRequest(
  req: NextRequest,
  body: unknown,
): Promise<ResolvedModel> {
  const resolved = await resolveModelFromHeaders(req);
  return {
    ...resolved,
    thinkingConfig: getThinkingConfigFromBody(body) ?? resolved.thinkingConfig,
  };
}
