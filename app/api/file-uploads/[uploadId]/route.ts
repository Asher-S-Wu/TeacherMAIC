import { NextRequest } from 'next/server';
import { apiSuccess } from '@/lib/server/api-response';
import { requireCurrentUser } from '@/lib/server/auth';
import { cancelUploadSessionForUser } from '@/lib/server/file-storage';
import { fileStorageApiError } from '@/lib/server/file-storage-api';

export const runtime = 'nodejs';

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ uploadId: string }> },
) {
  try {
    const user = await requireCurrentUser();
    const { uploadId } = await context.params;
    await cancelUploadSessionForUser(user._id, uploadId);
    return apiSuccess({ deleted: true });
  } catch (error) {
    return fileStorageApiError(error, '取消文件上传失败');
  }
}
