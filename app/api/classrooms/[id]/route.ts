import { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { requireCurrentUser } from '@/lib/server/auth';
import {
  deleteClassroomForUser,
  readClassroomForUser,
  renameClassroomForUser,
  saveClassroomForUser,
} from '@/lib/server/classroom-repository';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    const classroom = await readClassroomForUser(user._id, id);
    if (!classroom) {
      return apiError('INVALID_REQUEST', 404, '课堂不存在');
    }
    return apiSuccess({ classroom });
  } catch (error) {
    const status =
      error instanceof Error && 'status' in error && typeof error.status === 'number'
        ? error.status
        : 500;
    return apiError(
      status === 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST',
      status,
      error instanceof Error ? error.message : '课堂读取失败',
    );
  }
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    const body = await req.json();
    const { stage, scenes, currentSceneId, chats, outlines } = body;
    if (!stage || !Array.isArray(scenes)) {
      return apiError('MISSING_REQUIRED_FIELD', 400, '缺少课堂数据');
    }

    const saved = await saveClassroomForUser(user._id, {
      id,
      stage: { ...stage, id },
      scenes,
      currentSceneId,
      chats,
      outlines,
    });

    return apiSuccess({ classroom: saved });
  } catch (error) {
    const status =
      error instanceof Error && 'status' in error && typeof error.status === 'number'
        ? error.status
        : 500;
    return apiError(
      status === 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST',
      status,
      error instanceof Error ? error.message : '课堂保存失败',
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    const body = (await req.json()) as { name?: string };
    const name = body.name?.trim();
    if (!name) {
      return apiError('MISSING_REQUIRED_FIELD', 400, '缺少课堂名称');
    }
    await renameClassroomForUser(user._id, id, name);
    return apiSuccess({ updated: true });
  } catch (error) {
    const status =
      error instanceof Error && 'status' in error && typeof error.status === 'number'
        ? error.status
        : 500;
    return apiError(
      status === 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST',
      status,
      error instanceof Error ? error.message : '课堂重命名失败',
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    await deleteClassroomForUser(user._id, id);
    return apiSuccess({ deleted: true });
  } catch (error) {
    const status =
      error instanceof Error && 'status' in error && typeof error.status === 'number'
        ? error.status
        : 500;
    return apiError(
      status === 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST',
      status,
      error instanceof Error ? error.message : '课堂删除失败',
    );
  }
}
