import { nanoid } from 'nanoid';
import { collectStreamLLMText, type LLMGenerateParams } from '@/lib/ai/llm';
import { createStageAPI } from '@/lib/api/stage-api';
import type { StageStore } from '@/lib/api/stage-api-types';
import { TTS_PROVIDERS } from '@/lib/audio/constants';
import {
  generateAgentProfilesForCourse,
  type GeneratedAgentProfile,
} from '@/lib/generation/agent-profiles-generator';
import { generateSceneOutlinesFromRequirements } from '@/lib/generation/outline-generator';
import { buildVisionUserContent } from '@/lib/generation/prompt-formatters';
import {
  createSceneWithActions,
  generateSceneActions,
  generateSceneContent,
} from '@/lib/generation/scene-generator';
import type { AICallFn, AgentInfo } from '@/lib/generation/pipeline-types';
import { createLogger } from '@/lib/logger';
import { isProviderKeyRequired } from '@/lib/ai/providers';
import { resolveWebSearchApiKey } from '@/lib/server/provider-config';
import { resolveModel } from '@/lib/server/resolve-model';
import { runAgentDrivenWebResearch } from '@/lib/server/web-research';
import { persistClassroom } from '@/lib/server/classroom-storage';
import { getCollections, getMongo } from '@/lib/server/mongodb';
import { runConcurrentQueue } from '@/lib/utils/concurrent-queue';
import {
  CLASSROOM_GENERATION_CONCURRENCY,
  formatSceneGenerationProgressMessage,
} from '@/lib/constants/classroom-generation';
import { generateTTSForClassroom } from '@/lib/server/classroom-tts-generation';
import type { UserRequirements } from '@/lib/types/generation';
import type { Scene, Stage } from '@/lib/types/stage';
import type { ObjectId } from 'mongodb';
import type {
  ClassroomGenerationProgress,
  GenerateClassroomInput,
  GenerateClassroomResult,
} from '@/lib/server/classroom-generation-types';

export type {
  ClassroomGenerationProgress,
  GenerateClassroomInput,
  GenerateClassroomResult,
} from '@/lib/server/classroom-generation-types';

const log = createLogger('Classroom');

function createInMemoryStore(stage: Stage): StageStore {
  let state = {
    stage: stage as Stage | null,
    scenes: [] as Scene[],
    currentSceneId: null as string | null,
    mode: 'playback' as const,
  };

  const listeners: Array<(s: typeof state, prev: typeof state) => void> = [];

  return {
    getState: () => state,
    setState: (partial: Partial<typeof state>) => {
      const prev = state;
      state = { ...state, ...partial };
      listeners.forEach((fn) => fn(state, prev));
    },
    subscribe: (listener: (s: typeof state, prev: typeof state) => void) => {
      listeners.push(listener);
      return () => {
        const idx = listeners.indexOf(listener);
        if (idx >= 0) listeners.splice(idx, 1);
      };
    },
  };
}

function toAgentInfoList(agents: GeneratedAgentProfile[]): AgentInfo[] {
  return agents.map((a) => ({
    id: a.id,
    name: a.name,
    role: a.role,
    persona: a.persona,
  }));
}

const DEFAULT_TTS_PROVIDER_ID = 'aliyun-cosyvoice-tts' as const;

function buildServerAvailableVoices() {
  return TTS_PROVIDERS[DEFAULT_TTS_PROVIDER_ID].voices.map((voice) => ({
    providerId: DEFAULT_TTS_PROVIDER_ID,
    voiceId: voice.id,
    voiceName: voice.name,
  }));
}

export async function generateClassroom(
  input: GenerateClassroomInput,
  options: {
    baseUrl: string;
    userId: ObjectId;
    jobId?: string;
    onProgress?: (progress: ClassroomGenerationProgress) => Promise<void> | void;
    onClassroomCreated?: (classroomId: string) => Promise<void> | void;
  },
): Promise<GenerateClassroomResult> {
  const { requirement } = input;

  await options.onProgress?.({
    step: 'initializing',
    progress: 5,
    message: '正在准备生成课程',
    scenesGenerated: 0,
  });

  const { db } = await getMongo();
  const user = await getCollections(db).users.findOne({ _id: options.userId });
  if (!user) {
    throw new Error('用户不存在');
  }

  const {
    model: languageModel,
    modelString,
    providerId,
    apiKey,
    modelInfo,
  } = await resolveModel();
  const userLanguageModel = {
    ...languageModel,
    requestUserId: options.userId.toString(),
  };
  const interactiveMode = false;
  const hasVision = !!modelInfo?.capabilities?.vision;
  log.info(`Using server-configured model: ${modelString}`);

  if (isProviderKeyRequired(providerId) && !apiKey) {
    throw new Error(
      `No API key configured for provider "${providerId}". ` +
        'Please configure the matching API key in Vercel Environment Variables.',
    );
  }

  const aiCall: AICallFn = async (systemPrompt, userPrompt, images) => {
    const params: LLMGenerateParams =
      images?.length && hasVision
        ? {
            model: userLanguageModel,
            system: systemPrompt,
            messages: [
              {
                role: 'user' as const,
                content: buildVisionUserContent(userPrompt, images),
              },
            ],
          }
        : {
            model: userLanguageModel,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
          };

    return collectStreamLLMText(params, 'generate-classroom');
  };

  const createSearchAiCall = (operation: string): AICallFn => async (
    systemPrompt,
    userPrompt,
    _images,
  ) => {
    return collectStreamLLMText(
      {
        model: userLanguageModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      },
      operation,
    );
  };

  const requirements: UserRequirements = {
    requirement,
    interactiveMode,
    ...(input.userNickname ? { userNickname: input.userNickname } : {}),
    ...(input.userBio ? { userBio: input.userBio } : {}),
  };

  await options.onProgress?.({
    step: 'researching',
    progress: 10,
    message: '正在检索相关资料',
    scenesGenerated: 0,
  });

  let researchContext: string | undefined;
  if (input.enableWebSearch ?? true) {
    const firecrawlApiKey = resolveWebSearchApiKey();
    if (!firecrawlApiKey) {
      throw new Error(
        '已开启联网搜索，但 Firecrawl API Key 未配置，请在 Vercel 配置 FIRECRAWL_API_KEY',
      );
    }
    const searchResult = await runAgentDrivenWebResearch({
      requirement,
      apiKey: firecrawlApiKey,
      createAiCall: createSearchAiCall,
      onProgress: (event) => {
        if (event.phase === 'round_start') {
          void options.onProgress?.({
            step: 'researching',
            progress: 10 + Math.min(event.round, 4),
            message: '联网中',
            scenesGenerated: 0,
          });
        }
      },
    });
    if (searchResult.skipped) {
      log.info('Skipping web search after smart decision', {
        reason: searchResult.reason,
      });
    } else {
      researchContext = searchResult.context;
      if (researchContext) {
        log.info(`Firecrawl research returned ${searchResult.sources.length} sources`);
      }
    }
  }

  await options.onProgress?.({
    step: 'generating_outlines',
    progress: 15,
    message: '正在生成课程大纲',
    scenesGenerated: 0,
  });

  const outlinesResult = await generateSceneOutlinesFromRequirements(
    requirements,
    aiCall,
    undefined,
    {
      researchContext,
    },
  );

  if (!outlinesResult.success || !outlinesResult.data) {
    log.error('Failed to generate outlines:', outlinesResult.error);
    throw new Error(outlinesResult.error || 'Failed to generate scene outlines');
  }

  const { languageDirective, outlines } = outlinesResult.data;
  log.info(`Generated ${outlines.length} scene outlines (languageDirective: ${languageDirective})`);

  await options.onProgress?.({
    step: 'generating_outlines',
    progress: 25,
    message: `已生成 ${outlines.length} 页课程大纲`,
    scenesGenerated: 0,
    totalScenes: outlines.length,
  });

  const agentMode = input.agentMode || 'auto';
  let agents: AgentInfo[];
  let generatedAgentConfigs: GeneratedAgentProfile[] | undefined;

  if (agentMode === 'preset') {
    if (!input.presetAgents?.length) {
      throw new Error('预设角色模式下必须提供角色信息');
    }
    agents = input.presetAgents;
    log.info(`Using ${agents.length} preset agents`);
  } else {
    await options.onProgress?.({
      step: 'generating_agents',
      progress: 28,
      message: '正在根据课程内容生成角色...',
      scenesGenerated: 0,
      totalScenes: outlines.length,
    });

    log.info('Generating custom agent profiles via LLM...');
    generatedAgentConfigs = await generateAgentProfilesForCourse(
      {
        stageInfo: {
          name: outlines[0]?.title || requirement.slice(0, 50),
          description: requirement.slice(0, 200),
        },
        sceneOutlines: outlines.map((o) => ({
          title: o.title,
          description: o.description,
        })),
        languageDirective,
        availableAvatars: undefined,
        availableVoices: buildServerAvailableVoices(),
      },
      userLanguageModel,
      'generate-classroom-agents',
    );
    agents = toAgentInfoList(generatedAgentConfigs);
    log.info(`Generated ${agents.length} agent profiles`);
  }

  await options.onProgress?.({
    step: 'generating_scenes',
    progress: 30,
    message: '准备生成页面内容',
    scenesGenerated: 0,
    totalScenes: outlines.length,
  });

  const stageId = nanoid(10);
  const stage: Stage = {
    id: stageId,
    name: outlines[0]?.title || requirement.slice(0, 50),
    description: undefined,
    languageDirective,
    style: interactiveMode ? 'interactive' : 'professional',
    interactiveMode,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...(agentMode === 'auto' && generatedAgentConfigs
      ? {
          generatedAgentConfigs: generatedAgentConfigs.map((a) => ({
            id: a.id,
            name: a.name,
            role: a.role,
            persona: a.persona,
            avatar: a.avatar,
            color: a.color,
            priority: a.priority,
          })),
          agentIds: generatedAgentConfigs.map((a) => a.id),
        }
      : {
          agentIds: agents.map((a) => a.id),
        }),
  };

  await persistClassroom(
    options.userId,
    {
      id: stageId,
      stage,
      scenes: [],
      outlines,
    },
    options.baseUrl,
  );
  await options.onClassroomCreated?.(stageId);

  const store = createInMemoryStore(stage);
  const api = createStageAPI(store);

  log.info('Stage 2: Generating scene content and actions...');
  let generatedScenes = 0;
  const generationConcurrency = CLASSROOM_GENERATION_CONCURRENCY;

  await options.onProgress?.({
    step: 'generating_scenes',
    progress: 31,
    message: formatSceneGenerationProgressMessage(0, outlines.length),
    scenesGenerated: generatedScenes,
    totalScenes: outlines.length,
  });

  await runConcurrentQueue(outlines, generationConcurrency, async (outline) => {
    const content = await generateSceneContent(outline, aiCall, {
      languageModel: outline.type === 'pbl' ? userLanguageModel : undefined,
      agents,
      languageDirective,
    });
    if (!content) {
      throw new Error(`Scene content generation failed: ${outline.title}`);
    }

    const actions = await generateSceneActions(outline, content, aiCall, {
      agents,
      languageDirective,
    });
    log.info(`Scene "${outline.title}": ${actions.length} actions`);

    const sceneId = createSceneWithActions(outline, content, actions, api);
    if (!sceneId) {
      throw new Error(`Scene creation failed: ${outline.title}`);
    }

    generatedScenes += 1;
    await options.onProgress?.({
      step: 'generating_scenes',
      progress: Math.min(
        30 + Math.floor((generatedScenes / Math.max(outlines.length, 1)) * 60),
        90,
      ),
      message: formatSceneGenerationProgressMessage(generatedScenes, outlines.length),
      scenesGenerated: generatedScenes,
      totalScenes: outlines.length,
    });
  });

  const scenes = [...store.getState().scenes].sort((a, b) => a.order - b.order);
  log.info(`Pipeline complete: ${scenes.length} scenes generated`);

  if (scenes.length === 0) {
    throw new Error('No scenes were generated');
  }

  if (input.enableTTS) {
    await options.onProgress?.({
      step: 'generating_tts',
      progress: 94,
      message: '正在生成语音讲解',
      scenesGenerated: scenes.length,
      totalScenes: outlines.length,
    });

    await generateTTSForClassroom(scenes, stageId, options.userId);
    log.info('TTS generation complete');
  }

  await options.onProgress?.({
    step: 'persisting',
    progress: 98,
    message: '正在保存课程',
    scenesGenerated: scenes.length,
    totalScenes: outlines.length,
  });

  const persisted = await persistClassroom(
    options.userId,
    {
      id: stageId,
      stage,
      scenes,
      outlines,
    },
    options.baseUrl,
  );

  log.info(`Classroom persisted: ${persisted.id}, URL: ${persisted.url}`);

  await options.onProgress?.({
    step: 'completed',
    progress: 100,
    message: '课程生成完成',
    scenesGenerated: scenes.length,
    totalScenes: outlines.length,
  });

  return {
    id: persisted.id,
    url: persisted.url,
    stage,
    scenes,
    scenesCount: scenes.length,
    createdAt: persisted.createdAt,
  };
}
