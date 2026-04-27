import { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import {
  assertValidPassword,
  hashPassword,
  requireCurrentUser,
  verifyPassword,
} from '@/lib/server/auth';
import { getCollections, getMongo } from '@/lib/server/mongodb';

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireCurrentUser();
    const body = (await req.json()) as {
      currentPassword?: string;
      password?: string;
      confirmPassword?: string;
    };
    const currentPassword = body.currentPassword || '';
    const password = body.password || '';
    const confirmPassword = body.confirmPassword || '';

    if (!(await verifyPassword(currentPassword, user.passwordSalt, user.passwordHash))) {
      return apiError('INVALID_REQUEST', 401, '当前密码不正确');
    }
    assertValidPassword(password, confirmPassword);

    const passwordResult = await hashPassword(password);
    const { db } = await getMongo();
    await getCollections(db).users.updateOne(
      { _id: user._id },
      {
        $set: {
          passwordHash: passwordResult.hash,
          passwordSalt: passwordResult.salt,
          updatedAt: new Date(),
        },
      },
    );

    return apiSuccess({ updated: true });
  } catch (error) {
    const status =
      error instanceof Error && 'status' in error && typeof error.status === 'number'
        ? error.status
        : 500;
    return apiError(
      status === 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST',
      status,
      error instanceof Error ? error.message : '修改密码失败',
    );
  }
}
