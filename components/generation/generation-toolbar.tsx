'use client';

import { useState, useRef, type ReactNode } from 'react';
import { Paperclip, FileText, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { SettingsSection } from '@/lib/types/settings';
import { MediaPopover } from '@/components/generation/media-popover';
import { ModelSelectorPopover } from '@/components/generation/model-selector-popover';
import { getCurrentModelPreset } from '@/components/generation/model-presets';

// ─── Constants ───────────────────────────────────────────────
const MAX_PDF_SIZE_MB = 50;
const MAX_PDF_SIZE_BYTES = MAX_PDF_SIZE_MB * 1024 * 1024;

// ─── Types ───────────────────────────────────────────────────
export interface GenerationToolbarProps {
  webSearch: boolean;
  onWebSearchChange: (v: boolean) => void;
  onSettingsOpen: (section?: SettingsSection) => void;
  pdfFile: File | null;
  onPdfFileChange: (file: File | null) => void;
  onPdfError: (error: string | null) => void;
  voiceButton?: ReactNode;
}

// ─── Component ───────────────────────────────────────────────
export function GenerationToolbar({
  webSearch,
  onWebSearchChange,
  onSettingsOpen,
  pdfFile,
  onPdfFileChange,
  onPdfError,
  voiceButton,
}: GenerationToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const attachmentCount = pdfFile ? 1 : 0;

  const currentPreset = getCurrentModelPreset();

  const handleFileSelect = (files: FileList | File[]) => {
    let nextPdf = pdfFile;

    for (const file of Array.from(files)) {
      if (file.type === 'application/pdf') {
        if (file.size > MAX_PDF_SIZE_BYTES) {
          onPdfError('文件过大，请选择小于50MB的PDF文件');
          return;
        }
        nextPdf = file;
        continue;
      }

      onPdfError('请选择 PDF 文件');
      return;
    }

    onPdfError(null);
    onPdfFileChange(nextPdf);
  };

  // ─── Pill button helper ─────────────────────────────
  const pillCls =
    'inline-flex h-[32px] min-w-0 items-center justify-center gap-[6px] rounded-full border px-[12px] text-[12px] font-medium leading-none transition-all cursor-pointer select-none whitespace-nowrap';
  const attachmentTriggerCls =
    'order-1 inline-flex size-[32px] shrink-0 items-center justify-center text-muted-foreground/70 transition-colors hover:text-foreground cursor-pointer select-none';

  return (
    <div className="flex h-[32px] min-w-0 flex-1 flex-nowrap items-center gap-[8px] overflow-hidden">
      {/* ── Server-managed model ── */}
      <Tooltip>
        <ModelSelectorPopover>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={cn(
                pillCls,
                'order-3 ml-auto border-primary/20 bg-primary/10 text-primary hover:bg-primary/15 dark:border-primary/25 dark:bg-primary/15 dark:hover:bg-primary/20',
              )}
            >
              <currentPreset.icon className="size-[14px] shrink-0" />
              <span>{currentPreset.label}</span>
            </button>
          </TooltipTrigger>
        </ModelSelectorPopover>
        <TooltipContent>当前课程会使用这里显示的模型。</TooltipContent>
      </Tooltip>

      {/* ── Attachments ── */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="继续添加文件"
            className={cn(
              attachmentTriggerCls,
              attachmentCount > 0 && 'text-violet-600 dark:text-violet-300',
            )}
          >
            <Paperclip className="size-[16px] shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          {/* Upload area / file info */}
          <div className="px-3 pt-3 pb-3">
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept=".pdf,application/pdf"
              onChange={(e) => {
                if (e.target.files?.length) handleFileSelect(e.target.files);
                e.target.value = '';
              }}
            />
            {attachmentCount > 0 ? (
              <div className="space-y-2">
                {pdfFile && (
                  <div className="flex items-center gap-2">
                    <div className="size-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
                      <FileText className="size-4 text-violet-600 dark:text-violet-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{pdfFile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(pdfFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                    <button
                      onClick={() => onPdfFileChange(null)}
                      className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                )}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full rounded-lg border border-dashed border-muted-foreground/25 px-3 py-2 text-xs text-muted-foreground hover:border-violet-300 hover:text-foreground"
                >
                  继续添加文件
                </button>
              </div>
            ) : (
              <div
                className={cn(
                  'flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 transition-colors cursor-pointer',
                  isDragging
                    ? 'border-violet-400 bg-violet-50 dark:bg-violet-950/20'
                    : 'border-muted-foreground/20 hover:border-violet-300',
                )}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  if (e.dataTransfer.files?.length) handleFileSelect(e.dataTransfer.files);
                }}
              >
                <Paperclip className="size-5 text-muted-foreground/50 mb-1.5" />
                <p className="text-xs font-medium">添加 PDF</p>
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                  PDF 最大50MB
                </p>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {voiceButton && (
        <div className="order-2 flex h-[32px] shrink-0 items-center">{voiceButton}</div>
      )}

      {/* ── Separator ── */}
      <div className="order-4 h-[18px] w-px shrink-0 bg-border/60" />

      {/* ── Media popover ── */}
      <div className="order-5 shrink-0">
        <MediaPopover
          webSearch={webSearch}
          onWebSearchChange={onWebSearchChange}
          onSettingsOpen={onSettingsOpen}
        />
      </div>
    </div>
  );
}
