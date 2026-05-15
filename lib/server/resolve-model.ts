/**
 * Shared model resolution utilities for API routes.
 *
 * Resolves the server-configured text model into a single call.
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
  /** Server-configured model string (e.g. "gemini:gemini-3.1-flash-lite-preview") */
  modelString: string;
  /** Resolved provider ID (e.g. "ark") */
  providerId: string;
  /** API key resolved from server environment variables. */
  apiKey: string;
  /** Optional per-request thinking configuration from the client. */
  thinkingConfig?: ThinkingConfig;
}

/**
 * Resolve the server-configured language model.
 * Model and key values live on the server.
 */
export async function resolveModel(params: {
  thinkingConfig?: ThinkingConfig;
  modelString?: string;
}): Promise<ResolvedModel> {
  const modelString = params.modelString || DEFAULT_MODEL_STRING;
  const { providerId, modelId } = parseModelString(modelString);

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
    thinkingConfig: params.thinkingConfig,
  };
}

function getModelStringFromBody(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const record = body as {
    modelString?: unknown;
    providerId?: unknown;
    modelId?: unknown;
  };
  if (typeof record.modelString === 'string' && record.modelString.trim()) {
    return record.modelString;
  }
  if (
    typeof record.providerId === 'string' &&
    record.providerId.trim() &&
    typeof record.modelId === 'string' &&
    record.modelId.trim()
  ) {
    return `${record.providerId}:${record.modelId}`;
  }
  return undefined;
}

/**
 * Resolve the server-configured language model.
 */
export async function resolveModelFromHeaders(req: NextRequest): Promise<ResolvedModel> {
  void req;
  return resolveModel({});
}

/**
 * Resolve the server-configured language model plus per-request thinking config.
 */
export async function resolveModelFromRequest(
  req: NextRequest,
  body: unknown,
): Promise<ResolvedModel> {
  void req;
  const resolved = await resolveModel({
    modelString: getModelStringFromBody(body),
  });
  return resolved;
}
