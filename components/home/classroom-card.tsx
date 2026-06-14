'use client';

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Copy, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { ThumbnailSlide } from '@/components/slide-renderer/components/ThumbnailSlide';
import type { StageListItem } from '@/lib/utils/stage-storage';
import type { Slide } from '@/lib/types/slides';

export interface ClassroomGenerationOverlay {
  jobId: string;
  status: 'queued' | 'running' | 'failed';
  progress: number;
  message: string;
  scenesGenerated: number;
  totalScenes?: number;
  error?: string;
}

interface ClassroomCardProps {
  readonly classroom: StageListItem;
  readonly slide?: Slide;
  readonly formatDate: (ts: number) => string;
  readonly generation?: ClassroomGenerationOverlay;
  readonly onDelete: (id: string, e: MouseEvent) => void;
  readonly onRename: (id: string, newName: string) => void;
  readonly confirmingDelete: boolean;
  readonly onConfirmDelete: () => void;
  readonly onCancelDelete: () => void;
  readonly onClick: () => void;
  readonly allowRename?: boolean;
  readonly deleteConfirmText?: string;
}

export function ClassroomCard({
  classroom,
  slide,
  formatDate,
  onDelete,
  onRename,
  confirmingDelete,
  onConfirmDelete,
  onCancelDelete,
  onClick,
  generation,
  allowRename = true,
  deleteConfirmText = '删除课堂?',
}: ClassroomCardProps) {
  const isGenerating = generation?.status === 'queued' || generation?.status === 'running';
  const isFailed = generation?.status === 'failed';
  const thumbRef = useRef<HTMLDivElement>(null);
  const [thumbWidth, setThumbWidth] = useState(0);
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = thumbRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setThumbWidth(Math.round(entry.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (editing) nameInputRef.current?.focus();
  }, [editing]);

  const startRename = (e: MouseEvent) => {
    e.stopPropagation();
    if (!allowRename) return;
    setNameDraft(classroom.name);
    setEditing(true);
  };

  const commitRename = () => {
    if (!editing) return;
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== classroom.name) {
      onRename(classroom.id, trimmed);
    }
    setEditing(false);
  };

  return (
    <div className="group cursor-pointer" onClick={confirmingDelete ? undefined : onClick}>
      <div
        ref={thumbRef}
        className="relative w-full aspect-[16/9] rounded-2xl bg-slate-100 dark:bg-slate-800/80 overflow-hidden transition-transform duration-200 group-hover:scale-[1.02]"
      >
        {isGenerating && (
          <div className="absolute inset-0 z-[1] bg-black/20 pointer-events-none" />
        )}

        {slide && thumbWidth > 0 ? (
          <ThumbnailSlide
            slide={slide}
            size={thumbWidth}
            viewportSize={slide.viewportSize ?? 1000}
            viewportRatio={slide.viewportRatio ?? 0.5625}
          />
        ) : !slide ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="size-12 rounded-2xl bg-gradient-to-br from-violet-100 to-blue-100 dark:from-violet-900/30 dark:to-blue-900/30 flex items-center justify-center">
              <span className="text-xl opacity-50">📄</span>
            </div>
          </div>
        ) : null}

        {generation && (isGenerating || isFailed) && (
          <div className="absolute inset-x-0 bottom-0 z-[2] px-3 pb-3 pt-8 bg-gradient-to-t from-black/70 via-black/40 to-transparent pointer-events-none">
            {isGenerating ? (
              <>
                <p className="text-[11px] text-white/90 truncate mb-1.5">
                  {generation.message}
                </p>
                <div className="h-1 rounded-full bg-white/20 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-violet-400 transition-all duration-500"
                    style={{ width: `${generation.progress}%` }}
                  />
                </div>
              </>
            ) : (
              <p className="text-[11px] text-red-200 truncate">
                {generation.error || '生成失败'}
              </p>
            )}
          </div>
        )}

        <AnimatePresence>
          {!confirmingDelete && !isGenerating && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <Button
                size="icon"
                variant="ghost"
                className="absolute top-2 right-2 size-7 opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 hover:bg-destructive/80 text-white hover:text-white backdrop-blur-sm rounded-full"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(classroom.id, e);
                }}
              >
                <Trash2 className="size-3.5" />
              </Button>
              {allowRename && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute top-2 right-11 size-7 opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 hover:bg-black/50 text-white hover:text-white backdrop-blur-sm rounded-full"
                  onClick={startRename}
                >
                  <Pencil className="size-3.5" />
                </Button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {confirmingDelete && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/50 backdrop-blur-[6px]"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="text-sm font-medium text-white/90">{deleteConfirmText}</span>
              <div className="flex gap-2">
                <button
                  className="px-3.5 py-1 rounded-lg text-sm font-medium bg-white/15 text-white/80 hover:bg-white/25 backdrop-blur-sm transition-colors"
                  onClick={onCancelDelete}
                >
                  取消
                </button>
                <button
                  className="px-3.5 py-1 rounded-lg text-sm font-medium bg-red-500/90 text-white hover:bg-red-500 transition-colors"
                  onClick={onConfirmDelete}
                >
                  删除
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-2.5 px-1 flex items-center gap-2">
        <span
          className={cn(
            'shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
            isGenerating
              ? 'bg-violet-500/15 text-violet-600 dark:text-violet-400'
              : isFailed
                ? 'bg-destructive/10 text-destructive'
                : 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400',
          )}
        >
          {isGenerating
            ? generation.totalScenes
              ? `生成中 ${generation.scenesGenerated}/${generation.totalScenes} 页`
              : '生成中'
            : isFailed
              ? '生成失败'
              : `${classroom.sceneCount} 页 · ${formatDate(classroom.updatedAt)}`}
        </span>
        {editing ? (
          <div className="flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
            <input
              ref={nameInputRef}
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') setEditing(false);
              }}
              onBlur={commitRename}
              maxLength={100}
              placeholder="输入课堂名称"
              className="w-full bg-transparent border-b border-violet-400/60 text-[15px] font-medium text-foreground/90 outline-none placeholder:text-muted-foreground/40"
            />
          </div>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <p
                className={cn(
                  'font-medium text-[15px] truncate text-foreground/90 min-w-0',
                  allowRename ? 'cursor-text' : 'cursor-default',
                )}
                onDoubleClick={allowRename ? startRename : undefined}
              >
                {classroom.name}
              </p>
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              sideOffset={4}
              className="!max-w-[min(90vw,32rem)] break-words whitespace-normal"
            >
              <div className="flex items-center gap-1.5">
                <span className="break-all">{classroom.name}</span>
                <button
                  className="shrink-0 p-0.5 rounded hover:bg-foreground/10 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(classroom.name);
                    toast.success('课堂名称已复制');
                  }}
                >
                  <Copy className="size-3 opacity-60" />
                </button>
              </div>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
