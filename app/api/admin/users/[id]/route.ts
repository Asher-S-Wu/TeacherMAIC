import { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import {
  deleteAllDataForUser,
  isSuperAdminEmail,
  objectIdFromString,
  requireSuperAdmin,
  serializeUser,
} from '@/lib/server/auth';
import { getCollections, getMongo } from '@/lib/server/mongodb';

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireSuperAdmin();
    const { id } = await context.params;
    const targetId = objectIdFromString(id);
    const body = (await req.json()) as { status?: 'active' | 'disabled' };
    if (body.status !== 'active' && body.status !== 'disabled') {
      return apiError('INVALID_REQUEST', 400, '状态只能是 active 或 disabled');
    }
    if (admin._id.equals(targetId) && body.status === 'disabled') {
      return apiError('INVALID_REQUEST', 400, '不能停用当前超级管理员账号');
    }

    const { db } = await getMongo();
    const c = getCollections(db);
    const target = await c.users.findOne({ _id: targetId });
    if (!target) {
      return apiError('INVALID_REQUEST', 404, '用户不存在');
    }
    if (isSuperAdminEmail(target.email) && body.status === 'disabled') {
      return apiError('INVALID_REQUEST', 400, '不能停用超级管理员账号');
    }

    await c.users.updateOne(
      { _id: targetId },
      { $set: { status: body.status, updatedAt: new Date() } },
    );
    if (body.status === 'disabled') {
      await c.authSessions.deleteMany({ userId: targetId });
    }

    const updated = await c.users.findOne({ _id: targetId });
    return apiSuccess({ user: updated ? serializeUser(updated) : null });
  } catch (error) {
    const status =
      error instanceof Error && 'status' in error && typeof error.status === 'number'
        ? error.status
        : 500;
    return apiError(
      status === 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST',
      status,
      error instanceof Error ? error.message : '用户更新失败',
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireSuperAdmin();
    const { id } = await context.params;
    const targetId = objectIdFromString(id);
    if (admin._id.equals(targetId)) {
      return apiError('INVALID_REQUEST', 400, '不能删除当前超级管理员账号');
    }

    const { db } = await getMongo();
    const c = getCollections(db);
    const target = await c.users.findOne({ _id: targetId });
    if (!target) {
      return apiError('INVALID_REQUEST', 404, '用户不存在');
    }
    if (isSuperAdminEmail(target.email)) {
      return apiError('INVALID_REQUEST', 400, '不能删除超级管理员账号');
    }

    await deleteAllDataForUser(targetId);
    await c.users.deleteOne({ _id: targetId });
    return apiSuccess({ deleted: true });
  } catch (error) {
    const status =
      error instanceof Error && 'status' in error && typeof error.status === 'number'
        ? error.status
        : 500;
    return apiError(
      status === 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST',
      status,
      error instanceof Error ? error.message : '删除用户失败',
    );
  }
}
