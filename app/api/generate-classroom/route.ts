import { after, type NextRequest } from 'next/server';
import { nanoid } from 'nanoid';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import type { GenerateClassroomInput } from '@/lib/server/classroom-generation-types';
import { runClassroomGenerationJob } from '@/lib/server/classroom-job-runner';
import {
  createClassroomGenerationJob,
  listClassroomGenerationJobs,
  readClassroomGenerationJobInput,
} from '@/lib/server/classroom-job-store';
import { buildRequestOrigin } from '@/lib/server/classroom-storage';
import { createLogger } from '@/lib/logger';
import { requireCurrentUser } from '@/lib/server/auth';

const log = createLogger('GenerateClassroom API');

function parseGenerateClassroomInput(rawBody: Partial<GenerateClassroomInput>): GenerateClassroomInput {
  return {
    requirement: rawBody.requirement || '',
    ...(rawBody.pdfContent ? { pdfContent: rawBody.pdfContent } : {}),
    ...(rawBody.pdfImages?.length ? { pdfImages: rawBody.pdfImages } : {}),
    ...(rawBody.userNickname ? { userNickname: rawBody.userNickname } : {}),
    ...(rawBody.userBio ? { userBio: rawBody.userBio } : {}),
    enableWebSearch: rawBody.enableWebSearch ?? true,
    ...(rawBody.enableImageGeneration != null
      ? { enableImageGeneration: rawBody.enableImageGeneration }
      : {}),
    ...(rawBody.enableVideoGeneration != null
      ? { enableVideoGeneration: rawBody.enableVideoGeneration }
      : {}),
    ...(rawBody.enableTTS != null ? { enableTTS: rawBody.enableTTS } : {}),
    ...(rawBody.agentMode ? { agentMode: rawBody.agentMode } : {}),
    ...(rawBody.presetAgents?.length ? { presetAgents: rawBody.presetAgents } : {}),
  };
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireCurrentUser();
    const statusParam = req.nextUrl.searchParams.get('status');
    const limitParam = req.nextUrl.searchParams.get('limit');
    const status = statusParam
      ? (statusParam.split(',') as Array<'queued' | 'running' | 'succeeded' | 'failed'>)
      : undefined;
    const limit = limitParam ? Number.parseInt(limitParam, 10) : 20;

    const jobs = await listClassroomGenerationJobs(user._id, {
      limit: Number.isFinite(limit) ? limit : 20,
      ...(status?.length ? { status } : {}),
    });

    return apiSuccess({ jobs });
  } catch (error) {
    log.error('Classroom generation job list failed:', error);
    return apiError(
      'INTERNAL_ERROR',
      500,
      'Failed to list classroom generation jobs',
      error instanceof Error ? error.message : 'Unknown error',
    );
  }
}

export async function POST(req: NextRequest) {
  let requirementSnippet: string | undefined;
  try {
    const user = await requireCurrentUser();
    const rawBody = (await req.json()) as Partial<GenerateClassroomInput> & {
      retryFromJobId?: string;
    };

    let body: GenerateClassroomInput;
    if (rawBody.retryFromJobId) {
      const previous = await readClassroomGenerationJobInput(rawBody.retryFromJobId, user._id);
      if (!previous) {
        return apiError('INVALID_REQUEST', 404, '找不到可重试的生成任务');
      }
      if (previous.status !== 'failed') {
        return apiError('INVALID_REQUEST', 400, '只能重试已失败的任务');
      }
      if (!previous.input?.requirement) {
        return apiError('INVALID_REQUEST', 400, '任务数据不完整，无法重试');
      }
      body = previous.input;
    } else {
      body = parseGenerateClassroomInput(rawBody);
    }

    requirementSnippet = body.requirement?.substring(0, 60);
    const { requirement } = body;

    if (!requirement) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing required field: requirement');
    }

    const baseUrl = buildRequestOrigin(req);
    const jobId = nanoid(10);
    const job = await createClassroomGenerationJob(jobId, body, user._id);
    const pollUrl = `${baseUrl}/api/generate-classroom/${jobId}`;

    after(() => runClassroomGenerationJob(jobId, body, baseUrl, user._id));

    return apiSuccess(
      {
        jobId,
        status: job.status,
        step: job.step,
        message: job.message,
        pollUrl,
        pollIntervalMs: 5000,
      },
      202,
    );
  } catch (error) {
    log.error(
      `Classroom generation job creation failed [requirement="${requirementSnippet ?? 'unknown'}..."]:`,
      error,
    );
    return apiError(
      'INTERNAL_ERROR',
      500,
      'Failed to create classroom generation job',
      error instanceof Error ? error.message : 'Unknown error',
    );
  }
}
