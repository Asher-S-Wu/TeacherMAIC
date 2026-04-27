import { apiSuccess } from '@/lib/server/api-response';
import { clearCurrentSession } from '@/lib/server/auth';

export async function POST() {
  await clearCurrentSession();
  return apiSuccess({ loggedOut: true });
}
