import { apiError, apiSuccess } from '@/lib/server/api-response';
import { getCurrentUser } from '@/lib/server/auth';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return apiError('INVALID_REQUEST', 401, '请先登录');
  }
  return apiSuccess({ authenticated: true });
}
