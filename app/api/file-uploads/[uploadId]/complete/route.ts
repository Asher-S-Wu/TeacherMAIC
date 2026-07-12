import { NextRequest } from 'next/server';
import { apiSuccess } from '@/lib/server/api-response';
import { requireCurrentUser } from '@/lib/server/auth';
import { completeUploadSessionForUser } from '@/lib/server/file-storage';
import { fileStorageApiError } from '@/lib/server/file-storage-api';

export const runtime = 'nodejs';

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ uploadId: string }> },
) {
  try {
    const user = await requireCurrentUser();
    const { uploadId } = await context.params;
    const file = await completeUploadSessionForUser(user._id, uploadId);
    return apiSuccess({ file }, 201);
  } catch (error) {
    return fileStorageApiError(error, '完成文件上传失败');
  }
}
