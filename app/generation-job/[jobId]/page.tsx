'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SceneOutline } from '@/lib/types/generation';
import {
  getActiveStepsForJob,
  resolveJobProgressStep,
  type JobDisplayContext,
} from '@/lib/generation/generation-steps';
import {
  GenerationProgressCard,
  GenerationProgressFooter,
} from '@/components/generation/generation-progress-card';

interface GenerationJobStatus {
  jobId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  step: string;
  progress: number;
  message: string;
  scenesGenerated: number;
  totalScenes?: number;
  displayContext?: JobDisplayContext;
  result?: {
    classroomId: string;
    url: string;
    scenesCount: number;
  };
  error?: string;
  done: boolean;
  pollIntervalMs: number;
}

export default function GenerationJobPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.jobId as string;
  const [job, setJob] = useState<GenerationJobStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (!jobId) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const response = await fetch(`/api/generate-classroom/${encodeURIComponent(jobId)}`);
        const data = await response.json().catch(() => null);
        if (cancelled) return;

        if (!response.ok || !data?.success) {
          setLoadError(data?.error || '无法读取生成进度');
          return;
        }

        setJob(data);
        setLoadError(null);

        if (data.status === 'succeeded' && data.result?.classroomId && !redirectedRef.current) {
          redirectedRef.current = true;
          timer = setTimeout(() => {
            router.push(`/classroom/${data.result.classroomId}`);
          }, 1200);
          return;
        }

        if (!data.done) {
          timer = setTimeout(poll, data.pollIntervalMs || 5000);
        }
      } catch {
        if (!cancelled) {
          setLoadError('网络异常，正在重试…');
          timer = setTimeout(poll, 5000);
        }
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId, router]);

  const displayContext: JobDisplayContext = job?.displayContext ?? {
    webSearch: true,
    agentMode: 'auto',
  };

  const activeSteps = useMemo(
    () => getActiveStepsForJob(displayContext),
    [displayContext],
  );

  const { stepIndex } = useMemo(() => {
    if (!job) return { stepIndex: 0, stepId: activeSteps[0]?.id ?? 'outline' };
    return resolveJobProgressStep(job, activeSteps);
  }, [job, activeSteps]);

  const placeholderOutlines = useMemo((): SceneOutline[] | null => {
    if (!job?.totalScenes) return null;
    return Array.from({ length: job.totalScenes }, (_, index) => ({
      id: `placeholder-${index}`,
      type: 'slide' as const,
      title: `第 ${index + 1} 页`,
      description: '',
      order: index + 1,
      keyPoints: [],
    }));
  }, [job?.totalScenes]);

  const isComplete = job?.status === 'succeeded';
  const error = job?.status === 'failed' ? job.error || loadError : loadError;

  return (
    <div className="min-h-[100dvh] w-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div
          className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse"
          style={{ animationDuration: '4s' }}
        />
        <div
          className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse"
          style={{ animationDuration: '6s' }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute top-4 left-4 z-20"
      >
        <Button variant="ghost" size="sm" onClick={() => router.push('/')}>
          <ArrowLeft className="size-4 mr-2" />
          返回首页
        </Button>
      </motion.div>

      <div className="z-10 w-full max-w-lg space-y-8 flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full"
        >
          <GenerationProgressCard
            activeSteps={activeSteps}
            currentStepIndex={stepIndex}
            statusMessage={job?.message}
            error={error}
            isComplete={isComplete}
            outlines={
              job && (job.step === 'generating_outlines' || job.totalScenes)
                ? placeholderOutlines
                : null
            }
          />
        </motion.div>

        <GenerationProgressFooter error={error} />

        {job?.status === 'failed' && (
          <Button
            className="w-full max-w-xs"
            onClick={async () => {
              const response = await fetch('/api/generate-classroom', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ retryFromJobId: jobId }),
              });
              const data = await response.json().catch(() => null);
              if (data?.success && data.jobId) {
                router.push(`/generation-job/${data.jobId}`);
              }
            }}
          >
            重新生成
          </Button>
        )}
      </div>
    </div>
  );
}
