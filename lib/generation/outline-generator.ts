/**
 * Stage 1: Generate scene outlines from user requirements.
 */

import type { UserRequirements, SceneOutline } from '@/lib/types/generation';
import { buildPrompt, PROMPT_IDS } from '@/lib/prompts';
import { parseJsonResponse } from './json-repair';
import { validateSceneOutline } from './outline-validation';
import type { AICallFn, GenerationResult, GenerationCallbacks } from './pipeline-types';
import { generateWithStructuredRetries } from './retry';

/**
 * Generate scene outlines from user requirements
 * Now uses simplified UserRequirements with just requirement text and language
 */
export async function generateSceneOutlinesFromRequirements(
  requirements: UserRequirements,
  aiCall: AICallFn,
  callbacks?: GenerationCallbacks,
  options?: {
    researchContext?: string;
    teacherContext?: string;
  },
): Promise<GenerationResult<{ languageDirective: string; outlines: SceneOutline[] }>> {
  // Build user profile string for prompt injection
  const userProfileText =
    requirements.userNickname || requirements.userBio
      ? `## Student Profile\n\nStudent: ${requirements.userNickname || 'Unknown'}${requirements.userBio ? ` — ${requirements.userBio}` : ''}\n\nConsider this student's background when designing the course. Adapt difficulty, examples, and teaching approach accordingly.\n\n---`
      : '';

  const promptId = requirements.interactiveMode
    ? PROMPT_IDS.INTERACTIVE_OUTLINES
    : PROMPT_IDS.REQUIREMENTS_TO_OUTLINES;

  // Use simplified prompt variables
  const prompts = buildPrompt(promptId, {
    // New simplified variables
    requirement: requirements.requirement,
    userProfile: userProfileText,
    researchContext: options?.researchContext || 'None',
    // Server-side generation populates this via options; client-side populates via formatTeacherPersonaForPrompt
    teacherContext: options?.teacherContext || '',
  });

  if (!prompts) {
    return { success: false, error: 'Prompt template not found' };
  }

  try {
    callbacks?.onProgress?.({
      currentStage: 1,
      overallProgress: 20,
      stageProgress: 50,
      statusMessage: '正在分析需求，生成场景大纲...',
      scenesGenerated: 0,
      totalScenes: 0,
    });

    const { languageDirective, outlines: result } = await generateWithStructuredRetries({
      label: 'Scene outlines',
      systemPrompt: prompts.system,
      userPrompt: prompts.user,
      aiCall,
      parse: (response) => {
        const parsed = parseJsonResponse<{ languageDirective: string; outlines: SceneOutline[] }>(
          response,
        );

        if (
          !parsed ||
          typeof parsed.languageDirective !== 'string' ||
          parsed.languageDirective.trim().length === 0 ||
          !Array.isArray(parsed.outlines) ||
          parsed.outlines.length === 0
        ) {
          throw new Error('Failed to parse scene outlines response');
        }

        const validated = parsed.outlines.map(validateSceneOutline);
        return {
          languageDirective: parsed.languageDirective,
          outlines: validated,
        };
      },
    });

    callbacks?.onProgress?.({
      currentStage: 1,
      overallProgress: 50,
      stageProgress: 100,
      statusMessage: `已生成 ${result.length} 个场景大纲`,
      scenesGenerated: 0,
      totalScenes: result.length,
    });

    return { success: true, data: { languageDirective, outlines: result } };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
