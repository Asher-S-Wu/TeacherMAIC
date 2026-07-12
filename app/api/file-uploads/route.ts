import { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { requireCurrentUser } from '@/lib/server/auth';
import { createUploadSessionForUser } from '@/lib/server/file-storage';
import { fileStorageApiError } from '@/lib/server/file-storage-api';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const user = await requireCurrentUser();
    const body = (await req.json()) as {
      filename?: unknown;
      contentType?: unknown;
      size?: unknown;
      kind?: unknown;
      metadata?: unknown;
    };
    if (
      typeof body.filename !== 'string' ||
      typeof body.contentType !== 'string' ||
      typeof body.size !== 'number' ||
      typeof body.kind !== 'string'
    ) {
      return apiError('MISSING_REQUIRED_FIELD', 400, '缺少文件信息');
    }
    if (
      body.metadata !== undefined &&
      (typeof body.metadata !== 'object' || body.metadata === null || Array.isArray(body.metadata))
    ) {
      return apiError('INVALID_REQUEST', 400, '文件附加信息不正确');
    }

    const upload = await createUploadSessionForUser(user._id, {
      filename: body.filename,
      contentType: body.contentType,
      size: body.size,
      kind: body.kind,
      metadata: (body.metadata as Record<string, unknown> | undefined) || {},
    });
    return apiSuccess({ upload }, 201);
  } catch (error) {
    return fileStorageApiError(error, '创建上传任务失败');
  }
}
