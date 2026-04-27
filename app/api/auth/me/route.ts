import { apiSuccess } from '@/lib/server/api-response';
import { getCurrentUser, serializeUser } from '@/lib/server/auth';

export async function GET() {
  const user = await getCurrentUser();
  return apiSuccess({ user: user ? serializeUser(user) : null });
}
