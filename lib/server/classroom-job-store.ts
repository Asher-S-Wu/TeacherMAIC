import { ObjectId } from 'mongodb';
import type {
  ClassroomGenerationProgress,
  ClassroomGenerationStep,
  GenerateClassroomInput,
  GenerateClassroomResult,
} from '@/lib/server/classroom-generation';
import { getCollections, getMongo, type ClassroomJobDoc } from '@/lib/server/mongodb';

export type ClassroomGenerationJobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface ClassroomGenerationJob {
  id: string;
  status: ClassroomGenerationJobStatus;
  step: ClassroomGenerationStep | 'queued' | 'failed';
  progress: number;
  message: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  inputSummary: {
    requirementPreview: string;
    hasPdf: boolean;
    pdfTextLength: number;
    pdfImageCount: number;
  };
  scenesGenerated: number;
  totalScenes?: number;
  result?: {
    classroomId: string;
    url: string;
    scenesCount: number;
  };
  error?: string;
}

function buildInputSummary(input: GenerateClassroomInput): ClassroomGenerationJob['inputSummary'] {
  return {
    requirementPreview:
      input.requirement.length > 200 ? `${input.requirement.slice(0, 197)}...` : input.requirement,
    hasPdf: !!input.pdfContent,
    pdfTextLength: input.pdfContent?.text.length || 0,
    pdfImageCount: input.pdfContent?.images.length || 0,
  };
}

const STALE_JOB_TIMEOUT_MS = 30 * 60 * 1000;

function toPublicJob(job: ClassroomJobDoc): ClassroomGenerationJob {
  return {
    id: job.id,
    status: job.status,
    step: job.step as ClassroomGenerationJob['step'],
    progress: job.progress,
    message: job.message,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    ...(job.startedAt ? { startedAt: job.startedAt.toISOString() } : {}),
    ...(job.completedAt ? { completedAt: job.completedAt.toISOString() } : {}),
    inputSummary: job.inputSummary,
    scenesGenerated: job.scenesGenerated,
    ...(job.totalScenes !== undefined ? { totalScenes: job.totalScenes } : {}),
    ...(job.result ? { result: job.result } : {}),
    ...(job.error ? { error: job.error } : {}),
  };
}

async function markStaleIfNeeded(job: ClassroomJobDoc): Promise<ClassroomJobDoc> {
  if (job.status !== 'running') return job;
  if (Date.now() - job.updatedAt.getTime() <= STALE_JOB_TIMEOUT_MS) return job;

  const { db } = await getMongo();
  const c = getCollections(db);
  const now = new Date();
  const patch = {
    status: 'failed' as const,
    step: 'failed',
    message: '任务长时间没有进度，已停止',
    error: '任务进程可能已重启',
    completedAt: now,
    updatedAt: now,
  };
  await c.classroomJobs.updateOne({ _id: job._id }, { $set: patch });
  return { ...job, ...patch };
}

export function isValidClassroomJobId(jobId: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(jobId);
}

export async function createClassroomGenerationJob(
  jobId: string,
  input: GenerateClassroomInput,
  userId: ObjectId,
): Promise<ClassroomGenerationJob> {
  const { db } = await getMongo();
  const now = new Date();
  const job: ClassroomJobDoc = {
    _id: new ObjectId(),
    userId,
    id: jobId,
    status: 'queued',
    step: 'queued',
    progress: 0,
    message: '课堂生成任务已排队',
    createdAt: now,
    updatedAt: now,
    inputSummary: buildInputSummary(input),
    scenesGenerated: 0,
  };

  await getCollections(db).classroomJobs.insertOne(job);
  return toPublicJob(job);
}

export async function readClassroomGenerationJob(
  jobId: string,
  userId: ObjectId,
): Promise<ClassroomGenerationJob | null> {
  const { db } = await getMongo();
  const job = await getCollections(db).classroomJobs.findOne({ id: jobId, userId });
  if (!job) return null;
  return toPublicJob(await markStaleIfNeeded(job));
}

async function updateClassroomGenerationJob(
  jobId: string,
  patch: Partial<ClassroomJobDoc>,
): Promise<ClassroomGenerationJob> {
  const { db } = await getMongo();
  const c = getCollections(db);
  const updatedAt = new Date();
  const result = await c.classroomJobs.findOneAndUpdate(
    { id: jobId },
    { $set: { ...patch, updatedAt } },
    { returnDocument: 'after' },
  );
  if (!result) {
    throw new Error(`课堂生成任务不存在: ${jobId}`);
  }
  return toPublicJob(result);
}

export async function markClassroomGenerationJobRunning(
  jobId: string,
): Promise<ClassroomGenerationJob> {
  const { db } = await getMongo();
  const c = getCollections(db);
  const now = new Date();
  const result = await c.classroomJobs.findOneAndUpdate(
    { id: jobId },
    {
      $set: {
        status: 'running',
        message: '课堂生成已开始',
        updatedAt: now,
      },
      $setOnInsert: {
        startedAt: now,
      },
    },
    { returnDocument: 'after' },
  );
  if (!result) {
    throw new Error(`课堂生成任务不存在: ${jobId}`);
  }
  if (!result.startedAt) {
    await c.classroomJobs.updateOne({ id: jobId }, { $set: { startedAt: now } });
    result.startedAt = now;
  }
  return toPublicJob(result);
}

export async function updateClassroomGenerationJobProgress(
  jobId: string,
  progress: ClassroomGenerationProgress,
): Promise<ClassroomGenerationJob> {
  return updateClassroomGenerationJob(jobId, {
    status: 'running',
    step: progress.step,
    progress: progress.progress,
    message: progress.message,
    scenesGenerated: progress.scenesGenerated,
    totalScenes: progress.totalScenes,
  });
}

export async function markClassroomGenerationJobSucceeded(
  jobId: string,
  result: GenerateClassroomResult,
): Promise<ClassroomGenerationJob> {
  return updateClassroomGenerationJob(jobId, {
    status: 'succeeded',
    step: 'completed',
    progress: 100,
    message: '课堂生成完成',
    completedAt: new Date(),
    scenesGenerated: result.scenesCount,
    result: {
      classroomId: result.id,
      url: result.url,
      scenesCount: result.scenesCount,
    },
  });
}

export async function markClassroomGenerationJobFailed(
  jobId: string,
  error: string,
): Promise<ClassroomGenerationJob> {
  return updateClassroomGenerationJob(jobId, {
    status: 'failed',
    step: 'failed',
    message: '课堂生成失败',
    completedAt: new Date(),
    error,
  });
}

export async function readClassroomGenerationJobOwner(jobId: string): Promise<ObjectId | null> {
  const { db } = await getMongo();
  const job = await getCollections(db).classroomJobs.findOne(
    { id: jobId },
    { projection: { userId: 1 } },
  );
  return job?.userId ?? null;
}
