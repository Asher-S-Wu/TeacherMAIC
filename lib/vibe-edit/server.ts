import { callLLM } from '@/lib/ai/llm';
import type { ResponsesModel } from '@/lib/ai/providers';
import {
  GPT_IMAGE_2_MODEL_ID,
  DOUBAO_SEEDANCE_2_MODEL_ID,
} from '@/lib/ai/zenmux-models';
import {
  buildPrompt,
  PROMPT_IDS,
} from '@/lib/prompts';
import {
  buildCompleteScene,
  generateSceneActions,
  generateSceneContent,
  parseJsonResponse,
  uniquifyMediaElementIds,
} from '@/lib/generation/generation-pipeline';
import type {
  AICallFn,
  AgentInfo,
  SceneGenerationContext,
} from '@/lib/generation/generation-pipeline';
import { validateSceneOutline } from '@/lib/generation/outline-validation';
import type { SceneOutline } from '@/lib/types/generation';
import type { Scene } from '@/lib/types/stage';
import type { VibeEditDraft, VibeEditMessage } from '@/lib/types/vibe-edit';
import { generateImage } from '@/lib/media/image-providers';
import {
  generateVideo,
  normalizeVideoOptions,
} from '@/lib/media/video-providers';
import type { MediaGenerationRequest } from '@/lib/media/types';
import {
  resolveImageApiKey,
  resolveImageBaseUrl,
  resolveVideoApiKey,
  resolveVideoBaseUrl,
} from '@/lib/server/provider-config';

interface VibeEditOutlinePayload {
  type: SceneOutline['type'];
  title: string;
  description: string;
  keyPoints: string[];
  teachingObjective?: string;
  estimatedDuration?: number;
  languageNote?: string;
  quizConfig?: SceneOutline['quizConfig'];
  pblConfig?: SceneOutline['pblConfig'];
  widgetType?: SceneOutline['widgetType'];
  widgetOutline?: SceneOutline['widgetOutline'];
  mediaGenerations?: MediaGenerationRequest[];
}

interface VibeEditPlanPayload {
  summary: string;
  outline: VibeEditOutlinePayload;
}

interface CreateVibeEditDraftParams {
  scene: Scene;
  outline: SceneOutline;
  allOutlines: SceneOutline[];
  messages: VibeEditMessage[];
  agents?: AgentInfo[];
  userProfile?: string;
  languageDirective?: string;
  allowImageGeneration: boolean;
  allowVideoGeneration: boolean;
  model: ResponsesModel;
}

export async function createVibeEditDraft(
  params: CreateVibeEditDraftParams,
): Promise<VibeEditDraft> {
  const { outline: nextOutline, summary } = await generateEditedOutline(params);
  const nextOutlines = params.allOutlines.map((outline) =>
    outline.id === params.outline.id ? nextOutline : outline,
  );

  const aiCall = createAiCall(params.model, 'vibe-edit-content');

  const content = await generateSceneContent(nextOutline, aiCall, {
    languageModel: nextOutline.type === 'pbl' ? params.model : undefined,
    agents: params.agents,
    languageDirective: params.languageDirective,
  });
  if (!content) {
    throw new Error('页面内容生成失败');
  }

  const ctx = buildSceneContext(nextOutline, nextOutlines);
  const actions = await generateSceneActions(nextOutline, content, aiCall, {
    ctx,
    agents: params.agents,
    userProfile: params.userProfile,
    languageDirective: params.languageDirective,
  });

  const generated = buildCompleteScene(nextOutline, content, actions, params.scene.stageId);
  if (!generated) {
    throw new Error('页面组装失败');
  }

  const scene = adoptSceneIdentity(params.scene, generated);
  const previewMediaMap = await generatePreviewMedia(nextOutline.mediaGenerations || []);
  const previewScene = buildPreviewScene(scene, previewMediaMap);

  return {
    summary,
    outline: nextOutline,
    scene,
    previewScene,
    previewMediaMap,
  };
}

async function generateEditedOutline(
  params: CreateVibeEditDraftParams,
): Promise<{ outline: SceneOutline; summary: string }> {
  const prompt = buildPrompt(PROMPT_IDS.VIBE_EDIT, {
    courseTitles: params.allOutlines
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((outline, index) => `${index + 1}. ${outline.title}`)
      .join('\n'),
    currentOutline: JSON.stringify(params.outline, null, 2),
    currentSceneSummary: summarizeSceneForPrompt(params.scene),
    conversation: formatConversation(params.messages),
    allowImageGeneration: params.allowImageGeneration,
    allowVideoGeneration: params.allowVideoGeneration,
    languageDirective: params.languageDirective || '保持与当前课程一致。',
  });
  if (!prompt) {
    throw new Error('Vibe 编辑提示词缺失');
  }

  const result = await callLLM(
    {
      model: params.model,
      system: prompt.system,
      prompt: prompt.user,
    },
    'vibe-edit-outline',
  );

  const parsed = parseJsonResponse<VibeEditPlanPayload>(result.text);
  if (!parsed?.outline || !parsed.summary?.trim()) {
    throw new Error('Vibe 编辑结果无效');
  }

  assertRequestedMediaAllowed(
    parsed.outline.mediaGenerations || [],
    params.allowImageGeneration,
    params.allowVideoGeneration,
  );

  const outline = uniquifyMediaElementIds([
    buildOutlineFromPayload(params.outline, parsed.outline),
  ])[0];

  return {
    outline: validateSceneOutline(outline, outline.order),
    summary: parsed.summary.trim(),
  };
}

function buildOutlineFromPayload(
  currentOutline: SceneOutline,
  payload: VibeEditOutlinePayload,
): SceneOutline {
  return {
    id: currentOutline.id,
    order: currentOutline.order,
    type: payload.type,
    title: payload.title,
    description: payload.description,
    keyPoints: payload.keyPoints,
    teachingObjective: payload.teachingObjective,
    estimatedDuration: payload.estimatedDuration ?? currentOutline.estimatedDuration,
    languageNote: payload.languageNote ?? currentOutline.languageNote,
    suggestedImageIds: currentOutline.suggestedImageIds,
    mediaGenerations: payload.mediaGenerations,
    ...(payload.type === 'quiz' ? { quizConfig: payload.quizConfig } : {}),
    ...(payload.type === 'interactive'
      ? {
          widgetType: payload.widgetType,
          widgetOutline: payload.widgetOutline,
        }
      : {}),
    ...(payload.type === 'pbl' ? { pblConfig: payload.pblConfig } : {}),
  };
}

function assertRequestedMediaAllowed(
  mediaGenerations: MediaGenerationRequest[],
  allowImageGeneration: boolean,
  allowVideoGeneration: boolean,
): void {
  if (!allowImageGeneration && mediaGenerations.some((item) => item.type === 'image')) {
    throw new Error('当前设置未开启图片生成');
  }
  if (!allowVideoGeneration && mediaGenerations.some((item) => item.type === 'video')) {
    throw new Error('当前设置未开启视频生成');
  }
}

function createAiCall(
  model: ResponsesModel,
  source: string,
): AICallFn {
  return async (systemPrompt, userPrompt) => {
    const result = await callLLM(
      {
        model,
        system: systemPrompt,
        prompt: userPrompt,
      },
      source,
    );
    return result.text;
  };
}

function buildSceneContext(
  outline: SceneOutline,
  allOutlines: SceneOutline[],
): SceneGenerationContext {
  const ordered = allOutlines.slice().sort((a, b) => a.order - b.order);
  const pageIndex = ordered.findIndex((item) => item.id === outline.id);
  return {
    pageIndex: pageIndex >= 0 ? pageIndex + 1 : outline.order + 1,
    totalPages: ordered.length,
    allTitles: ordered.map((item) => item.title),
    previousSpeeches: [],
  };
}

function adoptSceneIdentity(original: Scene, generated: Scene): Scene {
  return {
    ...generated,
    id: original.id,
    stageId: original.stageId,
    order: original.order,
    createdAt: original.createdAt,
    updatedAt: Date.now(),
  };
}

function buildPreviewScene(scene: Scene, mediaMap: Record<string, string>): Scene {
  if (scene.content.type !== 'slide' || Object.keys(mediaMap).length === 0) {
    return scene;
  }

  return {
    ...scene,
    content: {
      ...scene.content,
      canvas: {
        ...scene.content.canvas,
        elements: scene.content.canvas.elements.map((element) => {
          if ('src' in element && typeof element.src === 'string' && mediaMap[element.src]) {
            return { ...element, src: mediaMap[element.src] };
          }
          return element;
        }),
      },
    },
  };
}

async function generatePreviewMedia(
  requests: MediaGenerationRequest[],
): Promise<Record<string, string>> {
  const mediaMap: Record<string, string> = {};

  for (const request of requests) {
    if (request.type === 'image') {
      const providerId = 'zenmux-image';
      const apiKey = resolveImageApiKey(providerId);
      const baseUrl = resolveImageBaseUrl(providerId);
      if (!apiKey) {
        throw new Error('图片生成暂时不可用');
      }
      const result = await generateImage(
        {
          providerId,
          apiKey,
          baseUrl,
          model: GPT_IMAGE_2_MODEL_ID,
        },
        {
          prompt: request.prompt,
          aspectRatio: request.aspectRatio,
          style: request.style,
        },
      );
      const url = result.base64
        ? `data:image/png;base64,${result.base64}`
        : result.url;
      if (!url) {
        throw new Error(`图片预览生成失败：${request.elementId}`);
      }
      mediaMap[request.elementId] = url;
      continue;
    }

    const providerId = 'zenmux-video';
    const apiKey = resolveVideoApiKey(providerId);
    const baseUrl = resolveVideoBaseUrl(providerId);
    if (!apiKey) {
      throw new Error('视频生成暂时不可用');
    }
    const result = await generateVideo(
      {
        providerId,
        apiKey,
        baseUrl,
        model: DOUBAO_SEEDANCE_2_MODEL_ID,
      },
      normalizeVideoOptions(providerId, {
        prompt: request.prompt,
        aspectRatio: request.aspectRatio,
      }),
    );
    if (!result.url && !result.base64) {
      throw new Error(`视频预览生成失败：${request.elementId}`);
    }
    mediaMap[request.elementId] = result.url || `data:video/mp4;base64,${result.base64}`;
  }

  return mediaMap;
}

function summarizeSceneForPrompt(scene: Scene): string {
  switch (scene.content.type) {
    case 'slide':
      return JSON.stringify({
        type: scene.type,
        title: scene.title,
        elementCount: scene.content.canvas.elements.length,
        elements: scene.content.canvas.elements.map((element) => ({
          id: element.id,
          type: element.type,
          text:
            element.type === 'text' && 'content' in element
              ? stripHtml(String(element.content)).slice(0, 120)
              : undefined,
        })),
      });
    case 'quiz':
      return JSON.stringify({
        type: scene.type,
        title: scene.title,
        questions: scene.content.questions.map((question) => ({
          type: question.type,
          question: question.question,
        })),
      });
    case 'interactive':
      return JSON.stringify({
        type: scene.type,
        title: scene.title,
        widgetType: scene.content.widgetType,
        widgetConfig: scene.content.widgetConfig,
      });
    case 'pbl':
      return JSON.stringify({
        type: scene.type,
        title: scene.title,
        projectInfo: scene.content.projectConfig.projectInfo,
        issueCount: scene.content.projectConfig.issueboard.issues.length,
      });
    default:
      return JSON.stringify({ type: scene.type, title: scene.title });
  }
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function formatConversation(messages: VibeEditMessage[]): string {
  if (messages.length === 0) {
    return '用户还没有提出修改要求。';
  }

  return messages
    .map((message) => `${message.role === 'user' ? '用户' : '助手'}：${message.content}`)
    .join('\n');
}
