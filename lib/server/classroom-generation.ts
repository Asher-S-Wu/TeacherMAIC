import { nanoid } from 'nanoid';
import { collectStreamLLMText } from '@/lib/ai/llm';
import { createStageAPI } from '@/lib/api/stage-api';
import type { StageStore } from '@/lib/api/stage-api-types';
import { generateSceneOutlinesFromRequirements } from '@/lib/generation/outline-generator';
import {
  createSceneWithActions,
  generateSceneActions,
  generateSceneContent,
} from '@/lib/generation/scene-generator';
import type { AICallFn } from '@/lib/generation/pipeline-types';
import type { AgentInfo } from '@/lib/generation/pipeline-types';
import { getDefaultAgents } from '@/lib/orchestration/registry/store';
import { createLogger } from '@/lib/logger';
import { isProviderKeyRequired } from '@/lib/ai/providers';
import { resolveWebSearchApiKey } from '@/lib/server/provider-config';
import { resolveModel } from '@/lib/server/resolve-model';
import { runAgentDrivenWebResearch } from '@/lib/server/web-research';
import { persistClassroom } from '@/lib/server/classroom-storage';
import { runConcurrentQueue } from '@/lib/utils/concurrent-queue';
import {
  CLASSROOM_GENERATION_CONCURRENCY,
  formatConcurrencyLabel,
} from '@/lib/constants/classroom-generation';
import {
  generateMediaForClassroom,
  replaceMediaPlaceholders,
  generateTTSForClassroom,
} from '@/lib/server/classroom-media-generation';
import type { UserRequirements } from '@/lib/types/generation';
import type { Scene, Stage } from '@/lib/types/stage';
import type { ObjectId } from 'mongodb';
import { AGENT_COLOR_PALETTE, AGENT_DEFAULT_AVATARS } from '@/lib/constants/agent-defaults';
import { MAX_GENERATION_ATTEMPTS } from '@/lib/generation/retry';

const log = createLogger('Classroom');
const MAX_AGENT_PROFILE_ATTEMPTS = MAX_GENERATION_ATTEMPTS;

export interface GenerateClassroomInput {
  requirement: string;
  pdfContent?: { text: string; images: string[] };
  enableWebSearch?: boolean;
  enableImageGeneration?: boolean;
  enableVideoGeneration?: boolean;
  enableTTS?: boolean;
  agentMode?: 'default' | 'generate';
}

export type ClassroomGenerationStep =
  | 'initializing'
  | 'researching'
  | 'generating_outlines'
  | 'generating_scenes'
  | 'generating_media'
  | 'generating_tts'
  | 'persisting'
  | 'completed';

export interface ClassroomGenerationProgress {
  step: ClassroomGenerationStep;
  progress: number;
  message: string;
  scenesGenerated: number;
  totalScenes?: number;
}

export interface GenerateClassroomResult {
  id: string;
  url: string;
  stage: Stage;
  scenes: Scene[];
  scenesCount: number;
  createdAt: string;
}

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

function stripCodeFences(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  return cleaned.trim();
}

type ParsedServerAgentProfiles = {
  agents: Array<{ name: string; role: string; persona: string }>;
};

function buildAgentProfileRetryPrompt(
  userPrompt: string,
  previousResponse: string,
  reason: string,
): string {
  return `${userPrompt}

The previous response could not be used.

Problem:
${reason}

Previous response:
${previousResponse.slice(0, 8000)}

Regenerate the entire response now. Return ONLY one complete valid JSON object that exactly matches the requested schema. Do not include markdown, comments, trailing commas, or any text outside JSON.`;
}

function parseAndValidateServerAgentProfiles(rawText: string): ParsedServerAgentProfiles {
  const parsed = JSON.parse(rawText) as ParsedServerAgentProfiles;

  if (!parsed.agents || !Array.isArray(parsed.agents) || parsed.agents.length < 2) {
    throw new Error(`Expected at least 2 agents, got ${parsed.agents?.length ?? 0}`);
  }

  const teacherCount = parsed.agents.filter((a) => a.role === 'teacher').length;
  if (teacherCount !== 1) {
    throw new Error(`Expected exactly 1 teacher, got ${teacherCount}`);
  }

  return parsed;
}

async function generateAgentProfiles(
  requirement: string,
  languageDirective: string,
  aiCall: AICallFn,
): Promise<AgentInfo[]> {
  const systemPrompt =
    'You are an expert instructional designer. Generate agent profiles for a multi-agent classroom simulation. Return ONLY valid JSON, no markdown or explanation.';

  const userPrompt = `Generate agent profiles for a course with this requirement:
${requirement}

Requirements:
- Decide the appropriate number of agents based on the course content (typically 3-5)
- Exactly 1 agent must have role "teacher", the rest can be "assistant" or "student"
- Each agent needs: name, role, persona (2-3 sentences describing personality and teaching/learning style)
- Language directive for this course: ${languageDirective}
  Agent names and personas must follow this language directive.

Return a JSON object with this exact structure:
{
  "agents": [
    {
      "name": "string",
      "role": "teacher" | "assistant" | "student",
      "persona": "string (2-3 sentences)"
    }
  ]
}`;

  let parsed: ParsedServerAgentProfiles | null = null;
  let lastRawText = '';
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_AGENT_PROFILE_ATTEMPTS; attempt += 1) {
    const prompt =
      attempt === 1
        ? userPrompt
        : buildAgentProfileRetryPrompt(
            userPrompt,
            lastRawText,
            lastError?.message ?? 'The previous response was invalid JSON.',
          );
    try {
      const response = await aiCall(systemPrompt, prompt);
      const rawText = stripCodeFences(response);
      lastRawText = rawText;
      parsed = parseAndValidateServerAgentProfiles(rawText);
      if (attempt > 1) {
        log.info(`Agent profiles JSON fixed after retry ${attempt - 1}`);
      }
      break;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const message = `Agent profiles response invalid (attempt ${attempt}/${MAX_AGENT_PROFILE_ATTEMPTS}): ${lastError.message}`;

      if (attempt < MAX_AGENT_PROFILE_ATTEMPTS) {
        log.warn(message, 'Retrying with correction prompt.');
      } else {
        log.error(message, lastRawText.substring(0, 500));
      }
    }
  }

  if (!parsed) {
    throw new Error(
      `Failed to parse agent profiles from LLM response after ${MAX_AGENT_PROFILE_ATTEMPTS} attempts`,
    );
  }

  return parsed.agents.map((a, i) => ({
    id: `gen-server-${i}`,
    name: a.name,
    role: a.role,
    persona: a.persona,
  }));
}

export async function generateClassroom(
  input: GenerateClassroomInput,
  options: {
    baseUrl: string;
    userId: ObjectId;
    onProgress?: (progress: ClassroomGenerationProgress) => Promise<void> | void;
  },
): Promise<GenerateClassroomResult> {
  const { requirement, pdfContent } = input;

  await options.onProgress?.({
    step: 'initializing',
    progress: 5,
    message: 'Initializing classroom generation',
    scenesGenerated: 0,
  });

  const {
    model: languageModel,
    modelInfo,
    modelString,
    providerId,
    apiKey,
    thinkingConfig,
  } = await resolveModel();
  const interactiveMode = false;
  log.info(`Using server-configured model: ${modelString}`);

  // Fail fast if the resolved provider has no API key configured
  if (isProviderKeyRequired(providerId) && !apiKey) {
    throw new Error(
      `No API key configured for provider "${providerId}". ` +
        'Please configure the matching API key in Vercel Environment Variables.',
    );
  }

  const aiCall: AICallFn = async (systemPrompt, userPrompt, _images) => {
    // 后台课堂生成需要完整文本再解析；底层走流式，避免等待响应头超时。
    return collectStreamLLMText(
      {
        model: languageModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        maxOutputTokens: modelInfo?.outputWindow,
      },
      'generate-classroom',
      thinkingConfig,
    );
  };

  const createSearchAiCall = (operation: string): AICallFn => async (
    systemPrompt,
    userPrompt,
    _images,
  ) => {
    const maxOutputTokens = operation === 'web-search-research-summary' ? 1600 : 256;
    // 后台联网搜索中的模型步骤也走流式，返回值仍是完整文本。
    return collectStreamLLMText(
      {
        model: languageModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        maxOutputTokens,
      },
      operation,
      thinkingConfig,
    );
  };

  const requirements: UserRequirements = {
    requirement,
    interactiveMode,
  };
  const pdfText = pdfContent?.text || undefined;

  await options.onProgress?.({
    step: 'researching',
    progress: 10,
    message: 'Researching topic',
    scenesGenerated: 0,
  });

  // Web search
  let researchContext: string | undefined;
  if (input.enableWebSearch ?? true) {
    const xcrawlApiKey = resolveWebSearchApiKey();
    if (!xcrawlApiKey) {
      throw new Error('已开启联网搜索，但 XCrawl API Key 未配置，请在 Vercel 配置 XCRAWL_API_KEY');
    }
    const searchResult = await runAgentDrivenWebResearch({
      requirement,
      pdfText,
      apiKey: xcrawlApiKey,
      createAiCall: createSearchAiCall,
      // 把多轮检索的进度桥接到上层 onProgress：每轮开始时刷新一次文案，
      // progress 限制在 10..14，紧贴下一阶段 generating_outlines 的 15
      onProgress: (event) => {
        if (event.phase === 'round_start') {
          void options.onProgress?.({
            step: 'researching',
            progress: 10 + Math.min(event.round, 4),
            message: `联网检索 第 ${event.round} 轮：${event.query}`,
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
        log.info(`XCrawl research returned ${searchResult.sources.length} sources`);
      }
    }
  }

  await options.onProgress?.({
    step: 'generating_outlines',
    progress: 15,
    message: 'Generating scene outlines',
    scenesGenerated: 0,
  });

  const outlinesResult = await generateSceneOutlinesFromRequirements(
    requirements,
    pdfText,
    undefined,
    aiCall,
    undefined,
    {
      imageGenerationEnabled: input.enableImageGeneration,
      videoGenerationEnabled: input.enableVideoGeneration,
      researchContext,
      // NO teacherContext — agents haven't been generated yet
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
    progress: 30,
    message: `Generated ${outlines.length} scene outlines`,
    scenesGenerated: 0,
    totalScenes: outlines.length,
  });

  // Resolve agents based on agentMode — now AFTER outlines so we can use languageDirective
  let agents: AgentInfo[];
  const agentMode = input.agentMode || 'default';
  if (agentMode === 'generate') {
    log.info('Generating custom agent profiles via LLM...');
    agents = await generateAgentProfiles(requirement, languageDirective, aiCall);
    log.info(`Generated ${agents.length} agent profiles`);
  } else {
    agents = getDefaultAgents();
  }

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
    // For LLM-generated agents, embed full configs so the client can
    // hydrate the agent registry from the saved classroom data.
    // For default agents, just record IDs — the client already has them.
    ...(agentMode === 'generate'
      ? {
          generatedAgentConfigs: agents.map((a, i) => ({
            id: a.id,
            name: a.name,
            role: a.role,
            persona: a.persona || '',
            avatar: AGENT_DEFAULT_AVATARS[i % AGENT_DEFAULT_AVATARS.length],
            color: AGENT_COLOR_PALETTE[i % AGENT_COLOR_PALETTE.length],
            priority: a.role === 'teacher' ? 10 : a.role === 'assistant' ? 7 : 5,
          })),
        }
      : {
          agentIds: agents.map((a) => a.id),
        }),
  };

  const store = createInMemoryStore(stage);
  const api = createStageAPI(store);

  log.info('Stage 2: Generating scene content and actions...');
  let generatedScenes = 0;

  const generationConcurrency = CLASSROOM_GENERATION_CONCURRENCY;
  const concurrencyLabel = formatConcurrencyLabel(generationConcurrency);

  await options.onProgress?.({
    step: 'generating_scenes',
    progress: 31,
    message: `正在${concurrencyLabel}并行生成页面：已完成 0/${outlines.length}`,
    scenesGenerated: generatedScenes,
    totalScenes: outlines.length,
  });

  await runConcurrentQueue(outlines, generationConcurrency, async (outline) => {
    const content = await generateSceneContent(outline, aiCall, {
      agents,
      languageDirective,
      languageModel: outline.type === 'pbl' ? languageModel : undefined,
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
      message: `正在${concurrencyLabel}并行生成页面：已完成 ${generatedScenes}/${outlines.length}`,
      scenesGenerated: generatedScenes,
      totalScenes: outlines.length,
    });
  });

  const scenes = [...store.getState().scenes].sort((a, b) => a.order - b.order);
  log.info(`Pipeline complete: ${scenes.length} scenes generated`);

  if (scenes.length === 0) {
    throw new Error('No scenes were generated');
  }

  // Phase: Media generation (after all scenes generated)
  if (input.enableImageGeneration || input.enableVideoGeneration) {
    await options.onProgress?.({
      step: 'generating_media',
      progress: 90,
      message: 'Generating media files',
      scenesGenerated: scenes.length,
      totalScenes: outlines.length,
    });

    const mediaMap = await generateMediaForClassroom(
      outlines,
      stageId,
      options.baseUrl,
      options.userId,
    );
    replaceMediaPlaceholders(scenes, mediaMap);
    log.info(`Media generation complete: ${Object.keys(mediaMap).length} files`);
  }

  // Phase: TTS generation
  if (input.enableTTS) {
    await options.onProgress?.({
      step: 'generating_tts',
      progress: 94,
      message: 'Generating TTS audio',
      scenesGenerated: scenes.length,
      totalScenes: outlines.length,
    });

    await generateTTSForClassroom(scenes, stageId, options.baseUrl, options.userId);
    log.info('TTS generation complete');
  }

  await options.onProgress?.({
    step: 'persisting',
    progress: 98,
    message: 'Persisting classroom data',
    scenesGenerated: scenes.length,
    totalScenes: outlines.length,
  });

  const persisted = await persistClassroom(
    options.userId,
    {
      id: stageId,
      stage,
      scenes,
    },
    options.baseUrl,
  );

  log.info(`Classroom persisted: ${persisted.id}, URL: ${persisted.url}`);

  await options.onProgress?.({
    step: 'completed',
    progress: 100,
    message: 'Classroom generation completed',
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
