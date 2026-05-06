'use client';

import { useState, useRef } from 'react';
import { Bot, Paperclip, FileImage, FileText, X, Globe2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useSettingsStore } from '@/lib/store/settings';
import { PDF_PROVIDERS } from '@/lib/pdf/constants';
import { WEB_SEARCH_PROVIDERS } from '@/lib/web-search/constants';
import type { SettingsSection } from '@/lib/types/settings';
import { MediaPopover } from '@/components/generation/media-popover';

// ─── Constants ───────────────────────────────────────────────
const MAX_PDF_SIZE_MB = 50;
const MAX_PDF_SIZE_BYTES = MAX_PDF_SIZE_MB * 1024 * 1024;
const MAX_IMAGE_SIZE_MB = 20;
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;
const MAX_IMAGE_COUNT = 10;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

// ─── Types ───────────────────────────────────────────────────
export interface GenerationToolbarProps {
  webSearch: boolean;
  onWebSearchChange: (v: boolean) => void;
  onSettingsOpen: (section?: SettingsSection) => void;
  pdfFile: File | null;
  onPdfFileChange: (file: File | null) => void;
  imageFiles: File[];
  onImageFilesChange: (files: File[]) => void;
  onPdfError: (error: string | null) => void;
}

// ─── Component ───────────────────────────────────────────────
export function GenerationToolbar({
  webSearch,
  onWebSearchChange,
  onSettingsOpen,
  pdfFile,
  onPdfFileChange,
  imageFiles,
  onImageFilesChange,
  onPdfError,
}: GenerationToolbarProps) {
  const { t } = useI18n();
  const currentProviderId = useSettingsStore((s) => s.providerId);
  const currentModelId = useSettingsStore((s) => s.modelId);
  const providersConfig = useSettingsStore((s) => s.providersConfig);
  const pdfProviderId = useSettingsStore((s) => s.pdfProviderId);
  const webSearchProviderId = useSettingsStore((s) => s.webSearchProviderId);
  const webSearchProvidersConfig = useSettingsStore((s) => s.webSearchProvidersConfig);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Check if the selected web search provider is configured on the server.
  const webSearchProvider = WEB_SEARCH_PROVIDERS[webSearchProviderId];
  const webSearchConfig = webSearchProvidersConfig[webSearchProviderId];
  const webSearchAvailable = webSearchProvider
    ? !webSearchProvider.requiresApiKey ||
      !!webSearchConfig?.isServerConfigured
    : false;

  const currentProviderConfig = providersConfig?.[currentProviderId];
  const currentModel = currentProviderConfig?.models.find((model) => model.id === currentModelId);

  const attachmentCount = (pdfFile ? 1 : 0) + imageFiles.length;

  const removeImageFile = (index: number) => {
    onImageFilesChange(imageFiles.filter((_, i) => i !== index));
  };

  const handleFileSelect = (files: FileList | File[]) => {
    let nextPdf = pdfFile;
    const nextImages = [...imageFiles];

    for (const file of Array.from(files)) {
      if (file.type === 'application/pdf') {
        if (file.size > MAX_PDF_SIZE_BYTES) {
          onPdfError(t('upload.fileTooLarge'));
          return;
        }
        nextPdf = file;
        continue;
      }

      if (IMAGE_TYPES.includes(file.type)) {
        if (file.size > MAX_IMAGE_SIZE_BYTES) {
          onPdfError(t('upload.imageFileTooLarge'));
          return;
        }
        if (nextImages.length >= MAX_IMAGE_COUNT) {
          onPdfError(t('upload.imageCountLimit'));
          return;
        }
        nextImages.push(file);
        continue;
      }

      onPdfError(t('upload.unsupportedAttachment'));
      return;
    }

    onPdfError(null);
    onPdfFileChange(nextPdf);
    onImageFilesChange(nextImages);
  };

  // ─── Pill button helper ─────────────────────────────
  const pillCls =
    'inline-flex h-[32px] min-w-0 items-center justify-center gap-[6px] rounded-full border px-[12px] text-[12px] font-medium leading-none transition-all cursor-pointer select-none whitespace-nowrap';
  const iconPillCls =
    'inline-flex size-[32px] items-center justify-center rounded-full border text-[12px] font-medium leading-none transition-all cursor-pointer select-none';
  const pillMuted = `${pillCls} border-border/50 text-muted-foreground/70 hover:text-foreground hover:bg-muted/60`;
  const pillActive = `${pillCls} border-violet-200/60 dark:border-violet-700/50 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300`;

  return (
    <div className="flex min-w-0 flex-nowrap items-center gap-[8px] overflow-hidden">
      {/* ── Server-managed model ── */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={cn(
              pillCls,
              'border-violet-200/70 bg-violet-50 text-violet-700 dark:border-violet-800/70 dark:bg-violet-950/30 dark:text-violet-300 cursor-default',
            )}
          >
            {currentProviderConfig?.icon ? (
              <img
                src={currentProviderConfig.icon}
                alt={currentProviderConfig.name}
                className="size-[14px] shrink-0 rounded-sm"
              />
            ) : (
              <Bot className="size-[14px] shrink-0" />
            )}
            <span>{currentModel?.name || t('settings.serverManagedModel')}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent>{t('settings.serverManagedModelDesc')}</TooltipContent>
      </Tooltip>

      {/* ── Separator ── */}
      <div className="h-[18px] w-px shrink-0 bg-border/60" />

      {/* ── Attachments ── */}
      <Popover>
        <PopoverTrigger asChild>
          {attachmentCount > 0 ? (
            <button className={pillActive}>
              <Paperclip className="size-[14px]" />
              <span className="max-w-[120px] truncate">
                {pdfFile?.name || imageFiles[0]?.name}
                {attachmentCount > 1 ? ` +${attachmentCount - 1}` : ''}
              </span>
              <span
                role="button"
                className="inline-flex size-[16px] items-center justify-center rounded-full transition-colors hover:bg-violet-200 dark:hover:bg-violet-800"
                onClick={(e) => {
                  e.stopPropagation();
                  onPdfFileChange(null);
                  onImageFilesChange([]);
                }}
              >
                <X className="size-[10px]" />
              </span>
            </button>
          ) : (
            <button
              className={cn(
                iconPillCls,
                'border-border/50 text-muted-foreground/70 hover:text-foreground hover:bg-muted/60',
              )}
            >
              <Paperclip className="size-[14px] shrink-0" />
            </button>
          )}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          <div className="flex items-center gap-2 px-3 pt-3 pb-2">
            <span className="text-xs font-medium text-muted-foreground shrink-0">
              {t('toolbar.attachmentParser')}
            </span>
            <span className="min-w-0 flex-1 truncate rounded-md bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
              {PDF_PROVIDERS[pdfProviderId]?.name || t('settings.serverManaged')}
            </span>
          </div>

          {/* Upload area / file info */}
          <div className="px-3 pb-3">
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept=".pdf,image/png,image/jpeg,image/webp"
              multiple
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
                {imageFiles.map((file, index) => (
                  <div key={`${file.name}-${file.size}-${index}`} className="flex items-center gap-2">
                    <div className="size-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                      <FileImage className="size-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                    <button
                      onClick={() => removeImageFile(index)}
                      className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full rounded-lg border border-dashed border-muted-foreground/25 px-3 py-2 text-xs text-muted-foreground hover:border-violet-300 hover:text-foreground"
                >
                  {t('toolbar.addAttachment')}
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
                <p className="text-xs font-medium">{t('toolbar.attachmentUpload')}</p>
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                  {t('upload.attachmentSizeLimit')}
                </p>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* ── Web Search ── */}
      {webSearchAvailable ? (
        <Popover>
          <PopoverTrigger asChild>
            <button
              className={cn(
                webSearch ? pillActive : iconPillCls,
                !webSearch &&
                  'border-border/50 text-muted-foreground/70 hover:text-foreground hover:bg-muted/60',
              )}
            >
              <Globe2 className={cn('size-[14px] shrink-0', webSearch && 'animate-pulse')} />
              {webSearch && (
                <span>{WEB_SEARCH_PROVIDERS[webSearchProviderId]?.name || 'Search'}</span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-3 space-y-3">
            {/* Toggle */}
            <button
              onClick={() => onWebSearchChange(!webSearch)}
              className={cn(
                'w-full flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-all',
                webSearch
                  ? 'bg-violet-50 dark:bg-violet-950/20 border-violet-200 dark:border-violet-800'
                  : 'border-border hover:bg-muted/50',
              )}
            >
              <Globe2
                className={cn(
                  'size-4 shrink-0',
                  webSearch ? 'text-violet-600 dark:text-violet-400' : 'text-muted-foreground',
                )}
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium">
                  {webSearch ? t('toolbar.webSearchOn') : t('toolbar.webSearchOff')}
                </p>
                <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                  {t('toolbar.webSearchDesc')}
                </p>
              </div>
            </button>

            <p className="text-[10px] text-muted-foreground/70">
              {WEB_SEARCH_PROVIDERS[webSearchProviderId]?.name || t('settings.serverManaged')}
            </p>
          </PopoverContent>
        </Popover>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className={cn(
                iconPillCls,
                'border-border/50 text-muted-foreground/40 cursor-not-allowed',
              )}
              disabled
            >
              <Globe2 className="size-[14px]" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{t('toolbar.webSearchNoProvider')}</TooltipContent>
        </Tooltip>
      )}

      {/* ── Separator ── */}
      <div className="h-[18px] w-px shrink-0 bg-border/60" />

      {/* ── Media popover ── */}
      <MediaPopover onSettingsOpen={onSettingsOpen} />
    </div>
  );
}
