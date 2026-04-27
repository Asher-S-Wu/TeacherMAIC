import { ObjectId } from 'mongodb';
import { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import {
  assertValidEmail,
  assertValidPassword,
  createSession,
  hashPassword,
  normalizeEmail,
  serializeUser,
} from '@/lib/server/auth';
import { getCollections, getMongo } from '@/lib/server/mongodb';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      email?: string;
      password?: string;
      confirmPassword?: string;
    };
    const email = normalizeEmail(body.email || '');
    const password = body.password || '';
    const confirmPassword = body.confirmPassword || '';

    assertValidEmail(email);
    assertValidPassword(password, confirmPassword);

    const { db } = await getMongo();
    const c = getCollections(db);
    const existing = await c.users.findOne({ email });
    if (existing) {
      return apiError('INVALID_REQUEST', 409, '这个邮箱已经注册过');
    }

    const now = new Date();
    const passwordResult = await hashPassword(password);
    const user = {
      _id: new ObjectId(),
      email,
      passwordHash: passwordResult.hash,
      passwordSalt: passwordResult.salt,
      status: 'active' as const,
      profile: {},
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
    };

    await c.users.insertOne(user);
    await createSession(user._id);

    return apiSuccess({ user: serializeUser(user) }, 201);
  } catch (error) {
    const status =
      error instanceof Error && 'status' in error && typeof error.status === 'number'
        ? error.status
        : 500;
    return apiError(
      status === 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST',
      status,
      error instanceof Error ? error.message : '注册失败',
    );
  }
}
