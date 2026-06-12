/**
 * Scene Content Generation API
 *
 * Generates scene content (slides/quiz/interactive/pbl) from an outline.
 * This is the first half of the two-step scene generation pipeline.
 * Does NOT generate actions — use /api/generate/scene-actions for that.
 */

import { NextRequest } from 'next/server';
import { callLLM, type LLMGenerateParams } from '@/lib/ai/llm';
import {
  generateSceneContent,
  buildVisionUserContent,
} from '@/lib/generation/generation-pipeline';
import type { AgentInfo } from '@/lib/generation/generation-pipeline';
import type { SceneOutline, PdfImage, ImageMapping } from '@/lib/types/generation';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { resolveModelFromRequest } from '@/lib/server/resolve-model';
import { requireCurrentUser } from '@/lib/server/auth';
import { loadImageMappingForUser } from '@/lib/server/file-storage';

const log = createLogger('Scene Content API');

type SceneContentRequestBody = {
  outline: SceneOutline;
  allOutlines: SceneOutline[];
  pdfImages?: PdfImage[];
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
  user: Awaited<ReturnType<typeof requireCurrentUser>>,
): Promise<{ content: SceneContentValue; effectiveOutline: SceneOutline; modelString: string }> {
  const {
    outline: rawOutline,
    pdfImages,
    agents,
    languageDirective,
  } = body;

  const outline: SceneOutline = { ...rawOutline };

  // ── 从请求体里解析当前使用的模型配置 ──
  const { model: languageModel, modelInfo, modelString } = await resolveModelFromRequest(req, body);

  // 判断当前模型是否支持图片输入。
  const hasVision = !!modelInfo?.capabilities?.vision;

  // 统一封装模型调用，页面内容生成使用普通非流式请求。
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

    const result = await callLLM(params, 'scene-content');
    return result.text;
  };

  const effectiveOutline = outline;

  // ── 只取分配给当前页面的图片，避免把无关图片塞进提示词 ──
  let assignedImages: PdfImage[] | undefined;
  if (
    pdfImages &&
    pdfImages.length > 0 &&
    effectiveOutline.suggestedImageIds &&
    effectiveOutline.suggestedImageIds.length > 0
  ) {
    const suggestedIds = new Set(effectiveOutline.suggestedImageIds);
    assignedImages = pdfImages.filter((img) => suggestedIds.has(img.id));
  }
  const imageMapping = hasVision ? await loadImageMappingForUser(assignedImages, user) : {};

  // ── 图片/视频生成由前端并行处理，这里只保留占位 ID ──
  // 内容生成器会收到 gen_img_1、gen_vid_1 这类占位符。
  // resolveImageIds() 会把这些占位符原样保留在元素里。
  const generatedMediaMapping: ImageMapping = {};

  // ── 生成当前页面内容 ──
  log.info(
    `Generating content: "${effectiveOutline.title}" (${effectiveOutline.type}) [model=${modelString}]`,
  );

  const content = await generateSceneContent(effectiveOutline, aiCall, {
    assignedImages,
    imageMapping,
    languageModel: effectiveOutline.type === 'pbl' ? languageModel : undefined,
    visionEnabled: hasVision,
    generatedMediaMapping,
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
    const user = await requireCurrentUser();

    const { content, effectiveOutline, modelString } = await runSceneContentGeneration(
      req,
      body,
      user,
    );
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
