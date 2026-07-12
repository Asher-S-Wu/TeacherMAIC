import { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { requireCurrentUser } from '@/lib/server/auth';
import { writeUploadChunkForUser } from '@/lib/server/file-storage';
import { fileStorageApiError } from '@/lib/server/file-storage-api';

export const runtime = 'nodejs';

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ uploadId: string; index: string }> },
) {
  try {
    if (!req.body) {
      return apiError('MISSING_REQUIRED_FIELD', 400, '缺少上传分片');
    }
    const user = await requireCurrentUser();
    const { uploadId, index } = await context.params;
    if (!/^\d+$/.test(index)) {
      return apiError('INVALID_REQUEST', 400, '上传分片编号不正确');
    }
    await writeUploadChunkForUser(user._id, uploadId, Number.parseInt(index, 10), req.body);
    return apiSuccess({ uploaded: true });
  } catch (error) {
    return fileStorageApiError(error, '上传文件分片失败');
  }
}
