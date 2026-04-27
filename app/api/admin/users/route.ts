import { apiError, apiSuccess } from '@/lib/server/api-response';
import { requireSuperAdmin, serializeUser } from '@/lib/server/auth';
import { getCollections, getMongo } from '@/lib/server/mongodb';

export async function GET() {
  try {
    await requireSuperAdmin();
    const { db } = await getMongo();
    const users = await getCollections(db).users.find({}).sort({ createdAt: -1 }).toArray();
    return apiSuccess({ users: users.map(serializeUser) });
  } catch (error) {
    const status =
      error instanceof Error && 'status' in error && typeof error.status === 'number'
        ? error.status
        : 500;
    return apiError(
      status === 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST',
      status,
      error instanceof Error ? error.message : '无法读取用户列表',
    );
  }
}
