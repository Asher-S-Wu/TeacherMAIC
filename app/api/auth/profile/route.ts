import { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { requireCurrentUser, serializeUser } from '@/lib/server/auth';
import { getCollections, getMongo } from '@/lib/server/mongodb';

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireCurrentUser();
    const body = (await req.json()) as {
      nickname?: string;
      bio?: string;
      avatar?: string;
    };

    const profile = {
      nickname: (body.nickname || '').trim().slice(0, 40),
      bio: (body.bio || '').trim().slice(0, 300),
      avatar: typeof body.avatar === 'string' ? body.avatar.slice(0, 200_000) : user.profile.avatar,
    };

    const { db } = await getMongo();
    await getCollections(db).users.updateOne(
      { _id: user._id },
      { $set: { profile, updatedAt: new Date() } },
    );

    return apiSuccess({
      user: serializeUser({ ...user, profile, updatedAt: new Date() }),
    });
  } catch (error) {
    const status =
      error instanceof Error && 'status' in error && typeof error.status === 'number'
        ? error.status
        : 500;
    return apiError(
      status === 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST',
      status,
      error instanceof Error ? error.message : '保存资料失败',
    );
  }
}
