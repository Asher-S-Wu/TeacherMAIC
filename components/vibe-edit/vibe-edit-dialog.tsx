'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Send, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { Scene } from '@/lib/types/stage';
import type { SceneOutline } from '@/lib/types/generation';
import type {
  VibeEditApplyResponse,
  VibeEditDraft,
  VibeEditMessage,
  VibeEditPreviewResponse,
} from '@/lib/types/vibe-edit';
import { useStageStore } from '@/lib/store/stage';
import { useSettingsStore } from '@/lib/store/settings';
import { useUserProfileStore } from '@/lib/store/user-profile';
import { useAgentRegistry } from '@/lib/orchestration/registry/store';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { VibePreview } from './vibe-preview';

interface VibeEditDialogProps {
  readonly open: boolean;
  readonly scene: Scene;
  readonly onOpenChange: (open: boolean) => void;
  readonly onApply: (scene: Scene, outline: SceneOutline) => Promise<void> | void;
}

const VIBE_TYPE_LABELS: Record<string, string> = {
  slide: '幻灯片',
  quiz: '测验',
  interactive: '互动',
  pbl: '项目实践',
};

export function VibeEditDialog({
  open,
  scene,
  onOpenChange,
  onApply,
}: VibeEditDialogProps) {
  const outlines = useStageStore((state) => state.outlines);
  const stageLanguageDirective = useStageStore((state) => state.stage?.languageDirective);
  const ttsEnabled = useSettingsStore((state) => state.ttsEnabled);
  const imageGenerationEnabled = useSettingsStore((state) => state.imageGenerationEnabled);
  const videoGenerationEnabled = useSettingsStore((state) => state.videoGenerationEnabled);
  const selectedAgentIds = useSettingsStore((state) => state.selectedAgentIds);
  const agentsRecord = useAgentRegistry((state) => state.agents);
  const userBio = useUserProfileStore((state) => state.bio);

  const baseOutline = useMemo(
    () => outlines.find((outline) => outline.order === scene.order) || null,
    [outlines, scene.order],
  );
  const agents = useMemo(
    () =>
      selectedAgentIds
        .map((id) => agentsRecord[id])
        .filter((agent): agent is NonNullable<typeof agent> => agent != null)
        .map((agent) => ({
          id: agent.id,
          name: agent.name,
          role: agent.role,
          persona: agent.persona,
        })),
    [agentsRecord, selectedAgentIds],
  );

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<VibeEditMessage[]>([]);
  const [draft, setDraft] = useState<VibeEditDraft | null>(null);
  const [workingScene, setWorkingScene] = useState(scene);
  const [workingOutline, setWorkingOutline] = useState<SceneOutline | null>(baseOutline);
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!open) {
      setInput('');
      setMessages([]);
      setDraft(null);
      setWorkingScene(scene);
      setWorkingOutline(baseOutline);
      setGenerating(false);
      setApplying(false);
      return;
    }

    setWorkingScene(scene);
    setWorkingOutline(baseOutline);
  }, [baseOutline, open, scene]);

  const handleGenerate = async () => {
    const content = input.trim();
    if (!content || !workingOutline || generating || applying) return;

    const nextMessages: VibeEditMessage[] = [...messages, { role: 'user', content }];
    setMessages(nextMessages);
    setInput('');
    setGenerating(true);

    try {
      const response = await fetch('/api/vibe-edit/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scene: workingScene,
          outline: workingOutline,
          allOutlines: outlines.map((outline) =>
            outline.id === workingOutline.id ? workingOutline : outline,
          ),
          messages: nextMessages,
          agents,
          userProfile: userBio,
          languageDirective: stageLanguageDirective,
          allowImageGeneration: imageGenerationEnabled,
          allowVideoGeneration: videoGenerationEnabled,
        }),
      });
      const data = (await response.json()) as
        | ({ success: true } & VibeEditPreviewResponse)
        | { success: false; error?: string };

      if (!response.ok || !data.success) {
        throw new Error(
          'error' in data && data.error ? data.error : '页面预览生成失败',
        );
      }

      setDraft(data.draft);
      setWorkingScene(data.draft.scene);
      setWorkingOutline(data.draft.outline);
      setMessages([...nextMessages, { role: 'assistant', content: data.draft.summary }]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '页面预览生成失败');
    } finally {
      setGenerating(false);
    }
  };

  const handleApply = async () => {
    if (!draft || applying) return;
    setApplying(true);

    try {
      const response = await fetch('/api/vibe-edit/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stageId: draft.scene.stageId,
          sceneId: draft.scene.id,
          outline: draft.outline,
          scene: draft.scene,
          mediaMap: draft.previewMediaMap,
          ttsEnabled,
        }),
      });
      const data = (await response.json()) as
        | ({ success: true } & VibeEditApplyResponse)
        | { success: false; error?: string };

      if (!response.ok || !data.success) {
        throw new Error(
          'error' in data && data.error ? data.error : '应用修改失败',
        );
      }

      await onApply(data.scene, data.outline);
      await useStageStore.getState().saveToStorage();
      toast.success('这一页已更新');
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '应用修改失败');
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[min(78vh,760px)] max-w-[min(1180px,92vw)] gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-violet-500" />
            修改当前页
          </DialogTitle>
          <DialogDescription>告诉我你想怎么改，我会先给你看改完的样子。</DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(280px,1fr)_minmax(260px,1fr)] lg:grid-cols-[minmax(320px,380px)_minmax(0,1fr)] lg:grid-rows-1">
          <div className="flex min-h-0 flex-col border-b border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-950/40 lg:border-b-0 lg:border-r">
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {!workingOutline ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-5 text-sm leading-relaxed text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                  这一页缺少生成信息，暂时不能这样修改。
                </div>
              ) : messages.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-5 text-sm leading-relaxed text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                  例如：把这一页改得更适合初学者，少一点字，多一个例子。
                </div>
              ) : (
                messages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={
                      message.role === 'user'
                        ? 'ml-8 rounded-lg bg-violet-600 px-3 py-2 text-sm leading-relaxed text-white'
                        : 'mr-8 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-relaxed text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                    }
                  >
                    {message.content}
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-slate-200 p-4 dark:border-slate-800">
              <Textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="输入你想怎么改这页..."
                className="min-h-24 resize-none bg-white dark:bg-slate-900"
                disabled={generating || applying || !workingOutline}
                onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                    event.preventDefault();
                    handleGenerate();
                  }
                }}
              />
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-xs text-slate-400">Ctrl + Enter 生成预览</span>
                <Button
                  onClick={handleGenerate}
                  disabled={!input.trim() || generating || applying || !workingOutline}
                >
                  {generating ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Send data-icon="inline-start" />
                  )}
                  {generating ? '生成中...' : '生成预览'}
                </Button>
              </div>
            </div>
          </div>

          <div className="flex min-h-0 flex-col bg-white dark:bg-slate-950">
            <div className="border-b border-slate-200 px-5 py-3 dark:border-slate-800">
              <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
                {draft?.previewScene.title || scene.title}
              </div>
              <div className="mt-0.5 text-xs text-slate-400">
                {draft ? '这是改完后的样子' : '还没有新预览'}
              </div>
              {draft && baseOutline && draft.outline.type !== baseOutline.type && (
                <div className="mt-1.5 inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                  {`页面类型：${VIBE_TYPE_LABELS[baseOutline.type] || baseOutline.type} → ${VIBE_TYPE_LABELS[draft.outline.type] || draft.outline.type}`}
                </div>
              )}
            </div>
            <div className="min-h-0 flex-1">
              {draft ? (
                <VibePreview scene={draft.previewScene} />
              ) : (
                <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-400">
                  先在左侧说出你的修改要求，这里会显示改完后的页面。
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-slate-200 px-6 py-4 dark:border-slate-800">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={applying}>
            取消
          </Button>
          <Button onClick={handleApply} disabled={!draft || generating || applying}>
            {applying && <Loader2 className="animate-spin" />}
            {applying ? '应用中...' : '应用修改'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
