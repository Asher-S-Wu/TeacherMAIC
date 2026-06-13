/**
 * Agent Profiles Generation API
 *
 * Generates agent profiles (teacher, assistant, student) for a course stage
 * based on stage info and scene outlines.
 */

import { NextRequest } from 'next/server';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { resolveModelFromRequest } from '@/lib/server/resolve-model';
import {
  generateAgentProfilesForCourse,
  type GenerateAgentProfilesInput,
} from '@/lib/generation/agent-profiles-generator';

const log = createLogger('Agent Profiles API');

type RequestBody = GenerateAgentProfilesInput;

export async function POST(req: NextRequest) {
  let stageName: string | undefined;
  let modelString: string | undefined;
  try {
    const body = (await req.json()) as RequestBody;
    const { stageInfo, languageDirective, availableAvatars } = body;
    stageName = stageInfo?.name;

    if (!stageInfo?.name) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'stageInfo.name is required');
    }
    if (!languageDirective) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'languageDirective is required');
    }
    if (!availableAvatars || availableAvatars.length === 0) {
      return apiError(
        'MISSING_REQUIRED_FIELD',
        400,
        'availableAvatars is required and must not be empty',
      );
    }

    const { model: languageModel, modelString: _modelString } = await resolveModelFromRequest(
      req,
      body,
    );
    modelString = _modelString;

    log.info(`Generating agent profiles for "${stageInfo.name}" [model=${modelString}]`);

    const agents = await generateAgentProfilesForCourse(body, languageModel);

    log.info(`Successfully generated ${agents.length} agent profiles for "${stageInfo.name}"`);

    return apiSuccess({ agents });
  } catch (error) {
    log.error(
      `Agent profiles generation failed [stage="${stageName ?? 'unknown'}", model=${modelString ?? 'unknown'}]:`,
      error,
    );
    return apiError('INTERNAL_ERROR', 500, error instanceof Error ? error.message : String(error));
  }
}
