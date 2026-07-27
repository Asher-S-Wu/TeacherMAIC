import { apiError, apiSuccess } from '@/lib/server/api-response';
import { requireCurrentUser } from '@/lib/server/auth';
import { listClassroomsForUser } from '@/lib/server/classroom-repository';

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
