import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { requireCurrentUser } from '@/lib/server/auth';
import { getCollections, getMongo } from '@/lib/server/mongodb';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ sceneId: string }> },
) {
  try {
    const user = await requireCurrentUser();
    const { sceneId } = await context.params;
    const { db } = await getMongo();
    const state = await getCollections(db).quizStates.findOne({ userId: user._id, sceneId });
    return apiSuccess({ state: state || null });
  } catch (error) {
    const status =
      error instanceof Error && 'status' in error && typeof error.status === 'number'
        ? error.status
        : 500;
    return apiError(
      status === 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST',
      status,
      error instanceof Error ? error.message : '测验记录读取失败',
    );
  }
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ sceneId: string }> },
) {
  try {
    const user = await requireCurrentUser();
    const { sceneId } = await context.params;
    const body = (await req.json()) as {
      draft?: Record<string, string | string[]>;
      answers?: Record<string, string | string[]>;
      results?: unknown[];
      clearSubmitted?: boolean;
    };
    const { db } = await getMongo();
    const patch: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if ('draft' in body) patch.draft = body.draft;
    if ('answers' in body) patch.answers = body.answers;
    if ('results' in body) patch.results = body.results;

    const unset: Record<string, ''> = {};
    if (body.clearSubmitted) {
      unset.answers = '';
      unset.results = '';
    }

    await getCollections(db).quizStates.updateOne(
      { userId: user._id, sceneId },
      {
        $set: patch,
        ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}),
        $setOnInsert: { _id: new ObjectId(), userId: user._id, sceneId },
      },
      { upsert: true },
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
      error instanceof Error ? error.message : '测验记录保存失败',
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ sceneId: string }> },
) {
  try {
    const user = await requireCurrentUser();
    const { sceneId } = await context.params;
    const { db } = await getMongo();
    await getCollections(db).quizStates.deleteOne({ userId: user._id, sceneId });
    return apiSuccess({ deleted: true });
  } catch (error) {
    const status =
      error instanceof Error && 'status' in error && typeof error.status === 'number'
        ? error.status
        : 500;
    return apiError(
      status === 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST',
      status,
      error instanceof Error ? error.message : '测验记录删除失败',
    );
  }
}
