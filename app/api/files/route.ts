import { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { requireCurrentUser } from '@/lib/server/auth';
import { saveFileForUser } from '@/lib/server/file-storage';

export async function POST(req: NextRequest) {
  try {
    const user = await requireCurrentUser();
    const formData = await req.formData();
    const file = formData.get('file');
    const kind = String(formData.get('kind') || 'file');
    if (!(file instanceof File)) {
      return apiError('MISSING_REQUIRED_FIELD', 400, '缺少文件');
    }

    const saved = await saveFileForUser(user._id, file, kind);
    return apiSuccess({ file: saved }, 201);
  } catch (error) {
    const status =
      error instanceof Error && 'status' in error && typeof error.status === 'number'
        ? error.status
        : 500;
    return apiError(
      status === 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST',
      status,
      error instanceof Error ? error.message : '文件保存失败',
    );
  }
}
