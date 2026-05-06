import { cookies } from 'next/headers';
import { ObjectId } from 'mongodb';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'crypto';
import { promisify } from 'util';
import { getCollections, getMongo, type UserDoc } from '@/lib/server/mongodb';
import { deleteAccountFilesForUser } from '@/lib/server/file-storage';

const scrypt = promisify(scryptCallback);

export const SESSION_COOKIE = 'teachermaic_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export interface PublicUser {
  id: string;
  email: string;
  role: 'user' | 'super_admin';
  status: 'active' | 'disabled';
  profile: {
    nickname?: string;
    bio?: string;
    avatar?: string;
  };
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly status = 401,
  ) {
    super(message);
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function assertValidEmail(email: string): void {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AuthError('请输入正确的邮箱地址', 400);
  }
}

export function assertValidPassword(password: string, confirmPassword?: string): void {
  if (password.length < 8) {
    throw new AuthError('密码至少需要 8 位', 400);
  }
  if (confirmPassword !== undefined && password !== confirmPassword) {
    throw new AuthError('两次输入的密码不一致', 400);
  }
}

export async function hashPassword(password: string, salt = randomBytes(16).toString('hex')) {
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return {
    salt,
    hash: derived.toString('hex'),
  };
}

export async function verifyPassword(password: string, salt: string, storedHash: string) {
  const { hash } = await hashPassword(password, salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function isSuperAdminEmail(email: string): boolean {
  const adminEmail = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  return !!adminEmail && normalizeEmail(email) === adminEmail;
}

export function serializeUser(user: UserDoc): PublicUser {
  return {
    id: user._id.toString(),
    email: user.email,
    role: isSuperAdminEmail(user.email) ? 'super_admin' : 'user',
    status: user.status,
    profile: user.profile || {},
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    ...(user.lastLoginAt ? { lastLoginAt: user.lastLoginAt.toISOString() } : {}),
  };
}

export async function createSession(userId: ObjectId): Promise<string> {
  const { db } = await getMongo();
  const c = getCollections(db);
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000);

  await c.authSessions.insertOne({
    _id: new ObjectId(),
    userId,
    tokenHash: hashSessionToken(token),
    createdAt: now,
    expiresAt,
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
    secure: process.env.NODE_ENV === 'production',
  });

  return token;
}

export async function clearCurrentSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    const { db } = await getMongo();
    await getCollections(db).authSessions.deleteOne({ tokenHash: hashSessionToken(token) });
  }
  cookieStore.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    secure: process.env.NODE_ENV === 'production',
  });
}

export async function getCurrentUser(): Promise<UserDoc | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const { db } = await getMongo();
  const c = getCollections(db);
  const session = await c.authSessions.findOne({
    tokenHash: hashSessionToken(token),
    expiresAt: { $gt: new Date() },
  });
  if (!session) return null;

  const user = await c.users.findOne({ _id: session.userId });
  if (!user || user.status !== 'active') {
    await c.authSessions.deleteMany({ userId: session.userId });
    return null;
  }

  return user;
}

export async function requireCurrentUser(): Promise<UserDoc> {
  const user = await getCurrentUser();
  if (!user) {
    throw new AuthError('请先登录', 401);
  }
  return user;
}

export async function requireSuperAdmin(): Promise<UserDoc> {
  const user = await requireCurrentUser();
  if (!isSuperAdminEmail(user.email)) {
    throw new AuthError('只有超级管理员可以操作', 403);
  }
  return user;
}

export function objectIdFromString(id: string): ObjectId {
  if (!ObjectId.isValid(id)) {
    throw new AuthError('用户 ID 不正确', 400);
  }
  return new ObjectId(id);
}

export async function deleteAllDataForUser(userId: ObjectId): Promise<void> {
  const { db } = await getMongo();
  const c = getCollections(db);

  await deleteAccountFilesForUser(userId);
  await Promise.all([
    c.authSessions.deleteMany({ userId }),
    c.classrooms.deleteMany({ userId }),
    c.classroomScenes.deleteMany({ userId }),
    c.chatSessions.deleteMany({ userId }),
    c.quizStates.deleteMany({ userId }),
    c.userSettings.deleteMany({ userId }),
    c.classroomJobs.deleteMany({ userId }),
  ]);
}
