/**
 * Scene Content Generation API
 *
 * Generates scene content (slides/quiz/interactive/pbl) from an outline.
 * This is the first half of the two-step scene generation pipeline.
 * Does NOT generate actions — use /api/generate/scene-actions for that.
 */

import { NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import { generateSceneContent } from '@/lib/generation/generation-pipeline';
import type { AgentInfo } from '@/lib/generation/generation-pipeline';
import type { SceneOutline } from '@/lib/types/generation';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { resolveModelFromRequest } from '@/lib/server/resolve-model';
import { requireCurrentUser } from '@/lib/server/auth';

const log = createLogger('Scene Content API');

type SceneContentRequestBody = {
  outline: SceneOutline;
  allOutlines: SceneOutline[];
  stageInfo: {
    name: string;
    description?: string;
    style?: string;
  };
  stageId: string;
  agents?: AgentInfo[];
  languageDirective?: string;
};

type SceneContentValue = Exclude<Awaited<ReturnType<typeof generateSceneContent>>, null>;

/**
 * 执行页面内容生成。
 */
async function runSceneContentGeneration(
  req: NextRequest,
  body: SceneContentRequestBody,
): Promise<{ content: SceneContentValue; effectiveOutline: SceneOutline; modelString: string }> {
  const {
    outline: rawOutline,
    agents,
    languageDirective,
  } = body;

  const outline: SceneOutline = { ...rawOutline };

  // ── 从请求体里解析当前使用的模型配置 ──
  const { model: languageModel, modelString } = await resolveModelFromRequest(req, body);

  // 统一封装模型调用，页面内容生成使用普通非流式请求。
  const aiCall = async (systemPrompt: string, userPrompt: string): Promise<string> => {
    const result = await callLLM(
      { model: languageModel, system: systemPrompt, prompt: userPrompt },
      'scene-content',
    );
    return result.text;
  };

  const effectiveOutline = outline;

  // ── 生成当前页面内容 ──
  log.info(
    `Generating content: "${effectiveOutline.title}" (${effectiveOutline.type}) [model=${modelString}]`,
  );

  const content = await generateSceneContent(effectiveOutline, aiCall, {
    languageModel: effectiveOutline.type === 'pbl' ? languageModel : undefined,
    agents,
    languageDirective,
  });

  if (!content) {
    throw new Error(`Failed to generate content: ${effectiveOutline.title}`);
  }

  log.info(`Content generated successfully: "${effectiveOutline.title}"`);

  return { content, effectiveOutline, modelString };
}

export async function POST(req: NextRequest) {
  let outlineTitle: string | undefined;
  let resolvedModelString: string | undefined;
  try {
    const body = (await req.json()) as SceneContentRequestBody;
    const { outline: rawOutline, allOutlines, stageId } = body;

    // Validate required fields
    if (!rawOutline) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'outline is required');
    }
    if (!allOutlines || allOutlines.length === 0) {
      return apiError(
        'MISSING_REQUIRED_FIELD',
        400,
        'allOutlines is required and must not be empty',
      );
    }
    if (!stageId) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'stageId is required');
    }

    outlineTitle = rawOutline?.title;
    await requireCurrentUser();

    const { content, effectiveOutline, modelString } = await runSceneContentGeneration(req, body);
    resolvedModelString = modelString;

    return apiSuccess({ content, effectiveOutline });
  } catch (error) {
    log.error(
      `Scene content generation failed [scene="${outlineTitle ?? 'unknown'}", model=${resolvedModelString ?? 'unknown'}]:`,
      error,
    );
    return apiError('INTERNAL_ERROR', 500, error instanceof Error ? error.message : String(error));
  }
}
