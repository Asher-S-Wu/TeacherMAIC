/**
 * Remote media import API.
 *
 * Receives a remote media URL, writes it to the signed-in account's private
 * Blob storage, and returns a small JSON file reference.
 */

import { NextRequest } from 'next/server';
import { validateUrlForSSRF } from '@/lib/server/ssrf-guard';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { requireCurrentUser } from '@/lib/server/auth';
import { saveRemoteFileForUser } from '@/lib/server/file-storage';
import { createLogger } from '@/lib/logger';

const log = createLogger('ProxyMedia');

export async function POST(request: NextRequest) {
  let url: string | undefined;
  try {
    const body = (await request.json()) as {
      url?: string;
      filename?: string;
      kind?: string;
      contentType?: string;
    };
    url = body.url;

    if (!url || typeof url !== 'string') {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing or invalid url');
    }

    const ssrfError = await validateUrlForSSRF(url);
    if (ssrfError) {
      return apiError('INVALID_URL', 403, ssrfError);
    }

    const user = await requireCurrentUser();
    const file = await saveRemoteFileForUser(
      user._id,
      url,
      body.filename || `remote-media-${Date.now()}`,
      body.contentType || 'application/octet-stream',
      body.kind || 'media',
      { sourceUrl: url },
    );

    return apiSuccess({ file }, 201);
  } catch (error) {
    log.error(`Remote media import failed [url="${url?.substring(0, 100) ?? 'unknown'}"]:`, error);
    return apiError('INTERNAL_ERROR', 500, error instanceof Error ? error.message : String(error));
  }
}
