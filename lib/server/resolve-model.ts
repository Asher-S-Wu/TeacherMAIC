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
import { resolveApiKey, resolveBaseUrl } from '@/lib/server/provider-config';
import { getCurrentUser } from '@/lib/server/auth';

export interface ResolvedModel extends ModelWithInfo {
  /** Server-configured model string (e.g. "volcengine-ark:doubao-seed-2-1-pro-260628") */
  modelString: string;
  /** Resolved provider ID. */
  providerId: string;
  /** API key resolved from server environment variables. */
  apiKey: string;
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
  const baseUrl = resolveBaseUrl(providerId);
  const { model, modelInfo } = getModel({
    providerId,
    modelId,
    apiKey,
    baseUrl,
  });

  return {
    model,
    modelInfo,
    modelString,
    providerId,
    apiKey,
  };
}

async function withCurrentUserMetadata(resolved: ResolvedModel): Promise<ResolvedModel> {
  const user = await getCurrentUser();
  if (!user) return resolved;

  return {
    ...resolved,
    model: {
      ...resolved.model,
      metadataUserId: user._id.toString(),
    },
  };
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
  return withCurrentUserMetadata(await resolveModel());
}
