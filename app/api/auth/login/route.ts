import { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import {
  assertValidEmail,
  createSession,
  normalizeEmail,
  serializeUser,
  verifyPassword,
} from '@/lib/server/auth';
import { getCollections, getMongo } from '@/lib/server/mongodb';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { email?: string; password?: string };
    const email = normalizeEmail(body.email || '');
    const password = body.password || '';
    assertValidEmail(email);

    const { db } = await getMongo();
    const c = getCollections(db);
    const user = await c.users.findOne({ email });
    if (!user || !(await verifyPassword(password, user.passwordSalt, user.passwordHash))) {
      return apiError('INVALID_REQUEST', 401, '邮箱或密码不正确');
    }
    if (user.status !== 'active') {
      return apiError('INVALID_REQUEST', 403, '这个账号已被停用');
    }

    const now = new Date();
    await c.users.updateOne({ _id: user._id }, { $set: { lastLoginAt: now, updatedAt: now } });
    const updatedUser = { ...user, lastLoginAt: now, updatedAt: now };
    await createSession(user._id);

    return apiSuccess({ user: serializeUser(updatedUser) });
  } catch (error) {
    const status =
      error instanceof Error && 'status' in error && typeof error.status === 'number'
        ? error.status
        : 500;
    return apiError(
      status === 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST',
      status,
      error instanceof Error ? error.message : '登录失败',
    );
  }
}
