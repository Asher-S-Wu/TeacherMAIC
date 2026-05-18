import { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { requireCurrentUser } from '@/lib/server/auth';
import { buildRequestOrigin } from '@/lib/server/classroom-storage';
import {
  generateMediaForClassroom,
  generateTTSForClassroom,
  replaceMediaPlaceholders,
} from '@/lib/server/classroom-media-generation';
import type { VibeEditApplyRequest } from '@/lib/types/vibe-edit';
import { createLogger } from '@/lib/logger';

const log = createLogger('VibeEditApply API');

export async function POST(req: NextRequest) {
  try {
    const user = await requireCurrentUser();
    const body = (await req.json()) as VibeEditApplyRequest;

    if (!body.stageId || !body.sceneId || !body.outline || !body.scene) {
      return apiError('MISSING_REQUIRED_FIELD', 400, '缺少应用修改所需的数据');
    }
    if (body.scene.id !== body.sceneId || body.scene.stageId !== body.stageId) {
      return apiError('INVALID_REQUEST', 400, '页面信息不匹配');
    }

    const scene = structuredClone(body.scene);
    const baseUrl = buildRequestOrigin(req);
    const mediaMap = await generateMediaForClassroom(
      [body.outline],
      body.stageId,
      baseUrl,
      user._id,
    );
    replaceMediaPlaceholders([scene], mediaMap);

    if (body.ttsEnabled) {
      await generateTTSForClassroom([scene], body.stageId, baseUrl, user._id);
    }

    return apiSuccess({
      outline: body.outline,
      scene,
    });
  } catch (error) {
    log.error('Vibe edit apply failed:', error);
    return apiError(
      'INTERNAL_ERROR',
      500,
      error instanceof Error ? error.message : '应用修改失败',
    );
  }
}
