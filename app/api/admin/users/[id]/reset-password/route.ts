import { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import {
  assertValidPassword,
  hashPassword,
  objectIdFromString,
  requireSuperAdmin,
} from '@/lib/server/auth';
import { getCollections, getMongo } from '@/lib/server/mongodb';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireSuperAdmin();
    const { id } = await context.params;
    const targetId = objectIdFromString(id);
    const body = (await req.json()) as { password?: string; confirmPassword?: string };
    const password = body.password || '';
    const confirmPassword = body.confirmPassword || '';
    assertValidPassword(password, confirmPassword);

    const { db } = await getMongo();
    const c = getCollections(db);
    const target = await c.users.findOne({ _id: targetId });
    if (!target) {
      return apiError('INVALID_REQUEST', 404, '用户不存在');
    }

    const passwordResult = await hashPassword(password);
    await Promise.all([
      c.users.updateOne(
        { _id: targetId },
        {
          $set: {
            passwordHash: passwordResult.hash,
            passwordSalt: passwordResult.salt,
            updatedAt: new Date(),
          },
        },
      ),
      c.authSessions.deleteMany({ userId: targetId }),
    ]);

    return apiSuccess({ updated: true });
  } catch (error) {
    const status =
      error instanceof Error && 'status' in error && typeof error.status === 'number'
        ? error.status
        : 500;
    return apiError(
      status === 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST',
      status,
      error instanceof Error ? error.message : '重置密码失败',
    );
  }
}
