/**
 * Scene Actions Generation API
 *
 * Generates actions for a scene given its outline and content,
 * then assembles the complete Scene object.
 * This is the second half of the two-step scene generation pipeline.
 */

import { NextRequest } from 'next/server';
import { callLLM, type LLMGenerateParams } from '@/lib/ai/llm';
import {
  generateSceneActions,
  buildCompleteScene,
  buildVisionUserContent,
  type SceneGenerationContext,
  type AgentInfo,
} from '@/lib/generation/generation-pipeline';
import type { SceneOutline } from '@/lib/types/generation';
import type {
  GeneratedSlideContent,
  GeneratedQuizContent,
  GeneratedInteractiveContent,
  GeneratedPBLContent,
} from '@/lib/types/generation';
import type { SpeechAction } from '@/lib/types/action';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { resolveModelFromRequest } from '@/lib/server/resolve-model';

const log = createLogger('Scene Actions API');

type SceneActionsRequestBody = {
  outline: SceneOutline;
  allOutlines: SceneOutline[];
  content:
    | GeneratedSlideContent
    | GeneratedQuizContent
    | GeneratedInteractiveContent
    | GeneratedPBLContent;
  stageId: string;
  agents?: AgentInfo[];
  previousSpeeches?: string[];
  userProfile?: string;
  languageDirective?: string;
};

/**
 * 执行动作生成。
 */
async function runSceneActionsGeneration(
  req: NextRequest,
  body: SceneActionsRequestBody,
) {
  const {
    outline,
    allOutlines,
    content,
    stageId,
    agents,
    previousSpeeches: incomingPreviousSpeeches,
    userProfile,
    languageDirective,
  } = body;

  // ── 从请求体里解析当前使用的模型配置 ──
  const { model: languageModel, modelInfo, modelString } = await resolveModelFromRequest(req, body);

  // 判断当前模型是否支持图片输入。
  const hasVision = !!modelInfo?.capabilities?.vision;

  // 统一封装模型调用，页面动作生成使用普通非流式请求。
  const aiCall = async (
    systemPrompt: string,
    userPrompt: string,
    images?: Array<{ id: string; src: string }>,
  ): Promise<string> => {
    const params: LLMGenerateParams =
      images?.length && hasVision
        ? {
            model: languageModel,
            system: systemPrompt,
            messages: [
              {
                role: 'user' as const,
                content: buildVisionUserContent(userPrompt, images),
              },
            ],
          }
        : {
            model: languageModel,
            system: systemPrompt,
            prompt: userPrompt,
          };

    const result = await callLLM(params, 'scene-actions');
    return result.text;
  };

  // ── 组装跨页面上下文，让讲解动作知道当前是第几页 ──
  const allTitles = allOutlines.map((o) => o.title);
  const pageIndex = allOutlines.findIndex((o) => o.id === outline.id);
  const ctx: SceneGenerationContext = {
    pageIndex: (pageIndex >= 0 ? pageIndex : 0) + 1,
    totalPages: allOutlines.length,
    allTitles,
    previousSpeeches: incomingPreviousSpeeches ?? [],
  };

  // ── 生成当前页面的讲解动作 ──
  log.info(`Generating actions: "${outline.title}" (${outline.type}) [model=${modelString}]`);

  const actions = await generateSceneActions(outline, content, aiCall, {
    ctx,
    agents,
    userProfile,
    languageDirective,
  });

  log.info(`Generated ${actions.length} actions for: "${outline.title}"`);

  // ── 把页面内容和讲解动作合成完整场景 ──
  const scene = buildCompleteScene(outline, content, actions, stageId);

  if (!scene) {
    throw new Error(`Failed to build scene: ${outline.title}`);
  }

  // ── 提取本页讲解文本，供后续页面保持表达连贯 ──
  const outputPreviousSpeeches = (scene.actions || [])
    .filter((a): a is SpeechAction => a.type === 'speech')
    .map((a) => a.text);

  log.info(
    `Scene assembled successfully: "${outline.title}" — ${scene.actions?.length ?? 0} actions`,
  );

  return { scene, previousSpeeches: outputPreviousSpeeches, modelString };
}

export async function POST(req: NextRequest) {
  let outlineTitle: string | undefined;
  let resolvedModelString: string | undefined;
  try {
    const body = (await req.json()) as SceneActionsRequestBody;
    const { outline, allOutlines, content, stageId } = body;

    // Validate required fields
    if (!outline) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'outline is required');
    }
    if (!allOutlines || allOutlines.length === 0) {
      return apiError(
        'MISSING_REQUIRED_FIELD',
        400,
        'allOutlines is required and must not be empty',
      );
    }
    if (!content) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'content is required');
    }
    if (!stageId) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'stageId is required');
    }

    outlineTitle = outline?.title;

    const { scene, previousSpeeches, modelString } = await runSceneActionsGeneration(
      req,
      body,
    );
    resolvedModelString = modelString;

    return apiSuccess({ scene, previousSpeeches });
  } catch (error) {
    log.error(
      `Scene actions generation failed [scene="${outlineTitle ?? 'unknown'}", model=${resolvedModelString ?? 'unknown'}]:`,
      error,
    );
    return apiError('INTERNAL_ERROR', 500, error instanceof Error ? error.message : String(error));
  }
}
