import { NextRequest } from 'next/server';
import { createVibeEditDraft } from '@/lib/vibe-edit/server';
import type { VibeEditPreviewRequest } from '@/lib/types/vibe-edit';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { resolveModelFromRequest } from '@/lib/server/resolve-model';
import { requireCurrentUser } from '@/lib/server/auth';
import { createLogger } from '@/lib/logger';

const log = createLogger('VibeEditPreview API');

export async function POST(req: NextRequest) {
  try {
    await requireCurrentUser();
    const body = (await req.json()) as VibeEditPreviewRequest;

    if (!body.scene || !body.outline) {
      return apiError('MISSING_REQUIRED_FIELD', 400, '缺少当前页面数据');
    }
    if (!Array.isArray(body.allOutlines) || body.allOutlines.length === 0) {
      return apiError('MISSING_REQUIRED_FIELD', 400, '缺少课程大纲');
    }
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return apiError('MISSING_REQUIRED_FIELD', 400, '请先输入修改要求');
    }

    const { model } = await resolveModelFromRequest(req, body);
    const draft = await createVibeEditDraft({
      scene: body.scene,
      outline: body.outline,
      allOutlines: body.allOutlines,
      messages: body.messages,
      agents: body.agents,
      userProfile: body.userProfile,
      languageDirective: body.languageDirective,
      allowImageGeneration: body.allowImageGeneration,
      allowVideoGeneration: body.allowVideoGeneration,
      model,
    });

    return apiSuccess({ draft });
  } catch (error) {
    log.error('Vibe preview generation failed:', error);
    return apiError(
      'INTERNAL_ERROR',
      500,
      error instanceof Error ? error.message : '页面预览生成失败',
    );
  }
}
