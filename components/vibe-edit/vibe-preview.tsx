'use client';

import { useMemo } from 'react';
import type { Scene } from '@/lib/types/stage';
import { ThumbnailSlide } from '@/components/slide-renderer/components/ThumbnailSlide';
import { patchHtmlForIframe } from '@/lib/utils/iframe';
import { useTheme } from '@/lib/hooks/use-theme';

interface VibePreviewProps {
  readonly scene: Scene;
}

export function VibePreview({ scene }: VibePreviewProps) {
  if (scene.content.type === 'slide') {
    return (
      <div className="flex h-full w-full items-center justify-center overflow-auto bg-slate-100/80 p-4 dark:bg-slate-900/70">
        <ThumbnailSlide
          slide={scene.content.canvas}
          size={720}
          viewportSize={1000}
          viewportRatio={0.5625}
        />
      </div>
    );
  }

  if (scene.content.type === 'interactive') {
    return <InteractivePreview scene={scene} />;
  }

  if (scene.content.type === 'quiz') {
    return (
      <div className="h-full overflow-y-auto bg-gradient-to-b from-slate-50 to-white p-5 dark:from-slate-900 dark:to-slate-900">
        <div className="mb-4">
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">{scene.title}</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            共 {scene.content.questions.length} 道题
          </p>
        </div>
        <div className="space-y-3">
          {scene.content.questions.map((question, index) => (
            <div
              key={question.id}
              className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
            >
              <div className="mb-3 flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-violet-100 text-xs font-bold text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                  {index + 1}
                </span>
                <div>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                    {question.question}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {question.type === 'single'
                      ? '单选'
                      : question.type === 'multiple'
                        ? '多选'
                        : '简答'}
                  </p>
                </div>
              </div>
              {question.options && (
                <div className="grid gap-2">
                  {question.options.map((option) => (
                    <div
                      key={option.value}
                      className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300"
                    >
                      {option.value}. {option.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-b from-sky-50 to-white p-5 dark:from-slate-900 dark:to-slate-900">
      <div className="mb-5">
        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
          {scene.content.projectConfig.projectInfo.title}
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          {scene.content.projectConfig.projectInfo.description}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h4 className="mb-2 text-xs font-bold uppercase text-slate-400">角色</h4>
          <div className="space-y-2">
            {scene.content.projectConfig.agents
              .filter((agent) => !agent.is_system_agent)
              .map((agent) => (
                <div
                  key={agent.name}
                  className="rounded-lg border border-sky-100 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
                >
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
                    {agent.name}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {agent.actor_role}
                  </div>
                </div>
              ))}
          </div>
        </div>

        <div>
          <h4 className="mb-2 text-xs font-bold uppercase text-slate-400">任务</h4>
          <div className="space-y-2">
            {scene.content.projectConfig.issueboard.issues.map((issue) => (
              <div
                key={issue.id}
                className="rounded-lg border border-sky-100 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
              >
                <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
                  {issue.title}
                </div>
                <div className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  {issue.description}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function InteractivePreview({ scene }: { readonly scene: Scene }) {
  const { resolvedTheme } = useTheme();
  const srcDoc = useMemo(
    () =>
      scene.content.type === 'interactive' && scene.content.html
        ? patchHtmlForIframe(scene.content.html, resolvedTheme)
        : undefined,
    [scene, resolvedTheme],
  );

  if (scene.content.type !== 'interactive') {
    return null;
  }

  return (
    <iframe
      srcDoc={srcDoc}
      src={srcDoc ? undefined : scene.content.url}
      className="pointer-events-none h-full w-full border-0 bg-white"
      title={`Vibe preview ${scene.id}`}
      sandbox="allow-scripts allow-forms allow-popups"
    />
  );
}
