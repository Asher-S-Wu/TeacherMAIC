import { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { requireCurrentUser } from '@/lib/server/auth';
import { buildRequestOrigin } from '@/lib/server/classroom-storage';
import {
  cleanupVibeEditMedia,
  generateTTSForClassroom,
  persistVibeEditMedia,
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

    const expectedIds = (body.outline.mediaGenerations || []).map((item) => item.elementId);
    const mediaMap = body.mediaMap ?? {};
    const providedIds = Object.keys(mediaMap);
    if (expectedIds.length !== providedIds.length || expectedIds.some((id) => !(id in mediaMap))) {
      return apiError('INVALID_REQUEST', 400, '预览媒体信息缺失，请重新生成预览');
    }

    const scene = structuredClone(body.scene);
    const baseUrl = buildRequestOrigin(req);
    const { permanentMap, savedFileIds } = await persistVibeEditMedia(
      mediaMap,
      body.stageId,
      baseUrl,
      user._id,
    );

    try {
      replaceMediaPlaceholders([scene], permanentMap);
      if (body.ttsEnabled) {
        await generateTTSForClassroom([scene], body.stageId, baseUrl, user._id);
      }
    } catch (error) {
      await cleanupVibeEditMedia(savedFileIds);
      throw error;
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
