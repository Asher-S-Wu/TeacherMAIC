import { apiError } from '@/lib/server/api-response';

export async function POST() {
  return apiError(
    'INVALID_REQUEST',
    400,
    '请使用新的文件直传接口上传文件。',
  );
}
