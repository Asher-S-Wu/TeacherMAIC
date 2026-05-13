/**
 * Shared model resolution utilities for API routes.
 *
 * Resolves the server-configured text model into a single call.
 */

import type { NextRequest } from 'next/server';
import {
  DEVELOPER_MODEL_STRING,
  DEFAULT_MODEL_STRING,
  getModel,
  parseModelString,
  type ModelWithInfo,
} from '@/lib/ai/providers';
import type { ThinkingConfig } from '@/lib/types/provider';
import { resolveApiKey } from '@/lib/server/provider-config';

export interface ResolvedModel extends ModelWithInfo {
  /** Server-configured model string (e.g. "ark:doubao-seed-2-0-lite-260428") */
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
  developerMode?: boolean;
}): Promise<ResolvedModel> {
  const modelString = params.developerMode ? DEVELOPER_MODEL_STRING : DEFAULT_MODEL_STRING;
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

function getThinkingConfigFromBody(body: unknown): ThinkingConfig | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const record = body as { thinkingConfig?: unknown };
  const config = record.thinkingConfig;
  return config && typeof config === 'object' ? (config as ThinkingConfig) : undefined;
}

function getDeveloperModeFromBody(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  return (body as { developerMode?: unknown }).developerMode === true;
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
    developerMode: getDeveloperModeFromBody(body),
  });
  return {
    ...resolved,
    thinkingConfig: getThinkingConfigFromBody(body) ?? resolved.thinkingConfig,
  };
}
