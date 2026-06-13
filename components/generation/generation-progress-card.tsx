'use client';

import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, CheckCircle2, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { GenerationStep } from '@/lib/generation/generation-steps';
import type { SceneOutline } from '@/lib/types/generation';
import { StepVisualizer } from '@/app/generation-preview/components/visualizers';

export interface GenerationProgressCardProps {
  activeSteps: GenerationStep[];
  currentStepIndex: number;
  statusMessage?: string;
  error?: string | null;
  isComplete?: boolean;
  outlines?: SceneOutline[] | null;
  webSearchSources?: Array<{ title: string; url: string }>;
  footerHint?: string;
}

export function GenerationProgressCard({
  activeSteps,
  currentStepIndex,
  statusMessage,
  error,
  isComplete = false,
  outlines,
  webSearchSources,
  footerHint = '可以关闭此页面，课程会继续在后台生成',
}: GenerationProgressCardProps) {
  const activeStep =
    activeSteps.length > 0
      ? activeSteps[Math.min(currentStepIndex, activeSteps.length - 1)]
      : null;

  return (
    <Card className="relative overflow-hidden border-muted/40 shadow-2xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl min-h-[400px] flex flex-col items-center justify-center p-8 md:p-12 w-full">
      {activeSteps.length > 0 && (
        <div className="absolute top-6 left-0 right-0 flex justify-center gap-2">
          {activeSteps.map((step, idx) => (
            <div
              key={step.id}
              className={cn(
                'h-1.5 rounded-full transition-all duration-500',
                idx < currentStepIndex
                  ? 'w-1.5 bg-blue-500/30'
                  : idx === currentStepIndex
                    ? 'w-8 bg-blue-500'
                    : 'w-1.5 bg-muted/50',
              )}
            />
          ))}
        </div>
      )}

      <div className="flex-1 flex flex-col items-center justify-center w-full space-y-8 mt-4">
        <div className="relative size-48 flex items-center justify-center">
          <AnimatePresence mode="popLayout">
            {error ? (
              <motion.div
                key="error"
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="size-32 rounded-full bg-red-500/10 flex items-center justify-center border-2 border-red-500/20"
              >
                <AlertCircle className="size-16 text-red-500" />
              </motion.div>
            ) : isComplete ? (
              <motion.div
                key="complete"
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="size-32 rounded-full bg-green-500/10 flex items-center justify-center border-2 border-green-500/20"
              >
                <CheckCircle2 className="size-16 text-green-500" />
              </motion.div>
            ) : activeStep ? (
              <motion.div
                key={activeStep.id}
                initial={{ scale: 0.8, opacity: 0, filter: 'blur(10px)' }}
                animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
                exit={{ scale: 1.2, opacity: 0, filter: 'blur(10px)' }}
                transition={{ duration: 0.4 }}
                className="absolute inset-0 flex items-center justify-center"
              >
                <StepVisualizer
                  stepId={activeStep.id}
                  outlines={outlines}
                  webSearchSources={webSearchSources}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        <div className="space-y-3 max-w-sm mx-auto text-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={error ? 'error' : isComplete ? 'done' : activeStep?.id ?? 'loading'}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-2"
            >
              <h2 className="text-2xl font-bold tracking-tight">
                {error
                  ? '生成失败'
                  : isComplete
                    ? '生成完成！'
                    : activeStep?.title ?? '正在准备'}
              </h2>
              <p className="text-muted-foreground text-base">
                {error
                  ? error
                  : isComplete
                    ? statusMessage || '你的个性化学习环境已准备好。'
                    : statusMessage || activeStep?.description}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {!error && !isComplete && footerHint && (
        <p className="absolute bottom-6 left-0 right-0 text-center text-xs text-muted-foreground/60 px-6">
          {footerHint}
        </p>
      )}
    </Card>
  );
}

export function GenerationProgressFooter({ error }: { error?: string | null }) {
  if (error) return null;

  return (
    <div className="h-16 flex items-center justify-center w-full">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center gap-3 text-sm text-muted-foreground/50 font-medium uppercase tracking-widest"
      >
        <Sparkles className="size-3 animate-pulse" />
        AI 智能体工作中...
      </motion.div>
    </div>
  );
}
