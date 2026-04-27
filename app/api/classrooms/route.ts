import { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { requireCurrentUser } from '@/lib/server/auth';
import {
  listClassroomsForUser,
  saveClassroomForUser,
} from '@/lib/server/classroom-repository';

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const classrooms = await listClassroomsForUser(user._id);
    return apiSuccess({ classrooms });
  } catch (error) {
    const status =
      error instanceof Error && 'status' in error && typeof error.status === 'number'
        ? error.status
        : 500;
    return apiError(
      status === 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST',
      status,
      error instanceof Error ? error.message : '无法读取课堂列表',
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireCurrentUser();
    const body = await req.json();
    const { stage, scenes, currentSceneId, chats, outlines } = body;
    if (!stage || !Array.isArray(scenes)) {
      return apiError('MISSING_REQUIRED_FIELD', 400, '缺少课堂数据');
    }

    const saved = await saveClassroomForUser(user._id, {
      id: stage.id,
      stage,
      scenes,
      currentSceneId,
      chats,
      outlines,
    });

    return apiSuccess({ classroom: saved }, 201);
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
