import { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { requireCurrentUser } from '@/lib/server/auth';
import { registerUploadedBlobForUser, type RegisteredBlobInput } from '@/lib/server/file-storage';

export async function POST(req: NextRequest) {
  try {
    const user = await requireCurrentUser();
    const body = (await req.json()) as {
      blob?: RegisteredBlobInput;
      filename?: string;
      contentType?: string;
      size?: number;
      kind?: string;
      metadata?: Record<string, unknown>;
    };

    if (!body.blob?.pathname || !body.blob.url || !body.filename || !body.contentType) {
      return apiError('MISSING_REQUIRED_FIELD', 400, '缺少文件信息');
    }

    const file = await registerUploadedBlobForUser(
      user._id,
      body.blob,
      body.filename,
      body.contentType,
      body.size || 0,
      body.kind || 'file',
      body.metadata || {},
    );

    return apiSuccess({ file }, 201);
  } catch (error) {
    return apiError(
      'INVALID_REQUEST',
      400,
      error instanceof Error ? error.message : '文件登记失败',
    );
  }
}
