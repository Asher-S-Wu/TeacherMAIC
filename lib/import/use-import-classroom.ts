'use client';

import { useState, useCallback, useRef } from 'react';
import { nanoid } from 'nanoid';
import { toast } from 'sonner';
import type { ClassroomManifest, ManifestScene } from '@/lib/export/classroom-zip-types';
import { createLogger } from '@/lib/logger';
import { uploadAccountFile } from '@/lib/utils/account-file-storage';
import { saveStageData } from '@/lib/utils/stage-storage';
import type { Action } from '@/lib/types/action';
import type { Scene, Stage } from '@/lib/types/stage';

const log = createLogger('ImportClassroom');

async function uploadZipBlob(blob: Blob, filename: string, kind: string): Promise<string> {
  const saved = await uploadAccountFile(
    new Blob([blob], { type: blob.type || mimeFromFilename(filename) }),
    filename,
    kind,
  );
  return saved.url;
}

function mimeFromFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'mp4') return 'video/mp4';
  if (ext === 'webm') return 'video/webm';
  if (ext === 'mp3') return 'audio/mpeg';
  if (ext === 'wav') return 'audio/wav';
  if (ext === 'ogg') return 'audio/ogg';
  return 'application/octet-stream';
}

function rewriteImportedActions(
  actions: ManifestScene['actions'],
  audioRefMap: Record<string, { id: string; url: string }>,
): Action[] | undefined {
  if (!actions) return undefined;
  return actions.map((action) => {
    if (action.type === 'speech' && 'audioRef' in action) {
      const { audioRef, ...rest } = action;
      const audio = audioRef ? audioRefMap[audioRef] : undefined;
      return {
        ...rest,
        ...(audio ? { audioId: audio.id, audioUrl: audio.url } : {}),
      } as Action;
    }
    return action as Action;
  });
}

export type ImportPhase =
  | 'idle'
  | 'parsing'
  | 'validating'
  | 'writingMedia'
  | 'writingCourse'
  | 'done';

export function useImportClassroom(onSuccess?: () => void) {
  const [importing, setImporting] = useState(false);
  const [phase, setPhase] = useState<ImportPhase>('idle');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const triggerFileSelect = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Reset input so same file can be re-selected
      e.target.value = '';

      setImporting(true);
      setPhase('parsing');
      const toastId = toast.loading('正在解析 ZIP...');

      try {
        // 0. Size check — warn for files over 200MB
        const MAX_SAFE_SIZE = 200 * 1024 * 1024;
        if (file.size > MAX_SAFE_SIZE) {
          log.warn(`Large ZIP file: ${(file.size / 1024 / 1024).toFixed(0)}MB`);
        }

        // 1. Parse ZIP
        const JSZip = (await import('jszip')).default;
        const zip = await JSZip.loadAsync(file);

        const manifestFile = zip.file('manifest.json');
        if (!manifestFile) {
          toast.error('无效课堂文件：manifest.json 缺失或已损坏。', { id: toastId });
          return;
        }

        // 2. Validate
        setPhase('validating');
        toast.loading('正在验证数据...', { id: toastId });

        const manifestText = await manifestFile.async('text');
        let manifest: ClassroomManifest;
        try {
          manifest = JSON.parse(manifestText);
        } catch {
          toast.error('无效课堂文件：manifest.json 缺失或已损坏。', { id: toastId });
          return;
        }

        if (!manifest.stage || !manifest.scenes || !Array.isArray(manifest.scenes)) {
          toast.error('无效课堂文件：缺少必需的课程数据。', { id: toastId });
          return;
        }

        // 3. Generate new IDs
        const newStageId = nanoid();
        const now = Date.now();

        // Agent ID mapping: index → new ID
        const newAgentIds: string[] = (manifest.agents ?? []).map(() => nanoid());

        // Audio ref → new ID mapping
        const audioRefToNewId: Record<string, string> = {};
        for (const [zipPath, entry] of Object.entries(manifest.mediaIndex ?? {})) {
          if (entry.type === 'audio' && !entry.missing) {
            audioRefToNewId[zipPath] = nanoid();
          }
        }

        // Media ref → new ID mapping
        const mediaRefToUrl: Record<string, string> = {};
        for (const [zipPath, entry] of Object.entries(manifest.mediaIndex ?? {})) {
          if ((entry.type === 'generated' || entry.type === 'image') && !entry.missing) {
            mediaRefToUrl[zipPath] = '';
          }
        }

        // 4. Upload media to the account
        setPhase('writingMedia');
        toast.loading('正在写入媒体文件...', { id: toastId });

        const audioRefMap: Record<string, { id: string; url: string }> = {};
        for (const [zipPath, newId] of Object.entries(audioRefToNewId)) {
          const zipEntry = zip.file(zipPath);
          if (!zipEntry) continue;
          const blob = await zipEntry.async('blob');
          audioRefMap[zipPath] = {
            id: newId,
            url: await uploadZipBlob(blob, zipPath.split('/').pop() || `${newId}.mp3`, 'audio'),
          };
        }

        for (const zipPath of Object.keys(mediaRefToUrl)) {
          const zipEntry = zip.file(zipPath);
          if (!zipEntry) continue;
          const blob = await zipEntry.async('blob');
          mediaRefToUrl[zipPath] = await uploadZipBlob(
            blob,
            zipPath.split('/').pop() || `media-${nanoid()}`,
            'media',
          );
        }

        // 5. Write course data
        setPhase('writingCourse');
        toast.loading('正在写入课程数据...', { id: toastId });

        const stage: Stage = {
          id: newStageId,
          name: manifest.stage.name || 'Imported Classroom',
          description: manifest.stage.description,
          languageDirective: manifest.stage.language,
          style: manifest.stage.style,
          createdAt: manifest.stage.createdAt || now,
          updatedAt: now,
          agentIds: newAgentIds.length > 0 ? newAgentIds : undefined,
          generatedAgentConfigs: manifest.agents?.map((a, i) => ({ ...a, id: newAgentIds[i] })),
        };

        // Write scenes with rewritten references
        const sceneRecords: Scene[] = manifest.scenes.map((mScene: ManifestScene, index: number) => {
          const newSceneId = nanoid();

          const actions = rewriteImportedActions(mScene.actions, audioRefMap);

          let multiAgent = undefined;
          if (mScene.multiAgent?.enabled) {
            multiAgent = {
              enabled: true,
              agentIds: (mScene.multiAgent.agentIndices ?? [])
                .map((idx) => newAgentIds[idx])
                .filter(Boolean),
              directorPrompt: mScene.multiAgent.directorPrompt,
            };
          }

          const content = JSON.parse(
            Object.entries(mediaRefToUrl).reduce(
              (text, [zipPath, url]) => text.split(zipPath).join(url),
              JSON.stringify(mScene.content),
            ),
          );

          return {
            id: newSceneId,
            stageId: newStageId,
            type: mScene.type,
            title: mScene.title,
            order: mScene.order ?? index,
            content,
            actions,
            whiteboards: mScene.whiteboards,
            multiAgent,
            createdAt: now,
            updatedAt: now,
          };
        });
        await saveStageData(newStageId, {
          stage,
          scenes: sceneRecords,
          currentSceneId: sceneRecords[0]?.id ?? null,
          chats: [],
          outlines: [],
        });

        // 6. Done
        setPhase('done');
        toast.success('课堂导入成功', { id: toastId });
        onSuccess?.();
      } catch (error) {
        log.error('Classroom ZIP import failed:', error);
        const isQuotaError = error instanceof DOMException && error.name === 'QuotaExceededError';
        toast.error(
          isQuotaError
            ? '导入失败：浏览器存储空间已满，请清理旧课堂后重试。'
            : '无效文件，请选择有效的 .lixue.zip 文件。',
          {
            id: toastId,
          },
        );
      } finally {
        setImporting(false);
        setPhase('idle');
      }
    },
    [onSuccess],
  );

  return {
    importing,
    phase,
    fileInputRef,
    triggerFileSelect,
    handleFileChange,
  };
}
