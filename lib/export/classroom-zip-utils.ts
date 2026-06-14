import type { Action, SpeechAction } from '@/lib/types/action';
import type { ManifestAction } from './classroom-zip-types';
import type { Scene } from '@/lib/types/stage';

// ─── Export: Collect Media ─────────────────────────────────────

export interface AccountAudioRecord {
  id: string;
  blob: Blob;
  format: string;
  duration?: number;
  voice?: string;
}

export interface AccountMediaRecord {
  id: string;
  blob: Blob;
  mimeType: string;
  size: number;
  prompt: string;
  poster?: Blob;
}

export interface CollectedAudio {
  zipPath: string;
  record: AccountAudioRecord;
}

export interface CollectedMedia {
  zipPath: string;
  record: AccountMediaRecord;
  elementId: string;
}

export async function collectAudioFiles(scenes: Scene[]): Promise<CollectedAudio[]> {
  const audioRefs = new Map<string, string>();
  for (const scene of scenes) {
    for (const action of scene.actions ?? []) {
      if (action.type === 'speech' && (action as SpeechAction).audioId && (action as SpeechAction).audioUrl) {
        audioRefs.set((action as SpeechAction).audioId!, (action as SpeechAction).audioUrl!);
      }
    }
  }
  const collected: CollectedAudio[] = [];
  for (const [audioId, audioUrl] of audioRefs) {
    const response = await fetch(audioUrl);
    if (!response.ok) continue;
    const blob = await response.blob();
    const format = blob.type.split('/')[1] || 'mp3';
    collected.push({
      zipPath: `audio/${audioId}.${format}`,
      record: { id: audioId, blob, format },
    });
  }
  return collected;
}

export async function collectMediaFiles(scenes: Scene[]): Promise<CollectedMedia[]> {
  const collected: CollectedMedia[] = [];
  for (const scene of scenes) {
    if (scene.content?.type !== 'slide') continue;
    for (const element of scene.content.canvas.elements) {
      if (!('src' in element) || typeof element.src !== 'string') continue;
      const filePath = getAccountFilePath(element.src);
      if (!filePath) continue;
      const response = await fetch(element.src);
      if (!response.ok) continue;
      const blob = await response.blob();
      const mimeType = blob.type || (element.type === 'video' ? 'video/mp4' : 'image/jpeg');
      const ext = mimeType.split('/')[1] || 'jpg';
      collected.push({
        zipPath: `media/${element.id}.${ext}`,
        record: {
          id: element.src.split('/').pop() || element.id,
          blob,
          mimeType,
          size: blob.size,
          prompt: '',
        },
        elementId: element.id,
      });
    }
  }
  return collected;
}

function getAccountFilePath(src: string): string | null {
  const url = new URL(src, window.location.origin);
  return url.pathname.startsWith('/api/files/') ? url.pathname : null;
}

// ─── Export: Action Serialization ──────────────────────────────

export function actionsToManifest(
  actions: Action[],
  audioIdToPath: Map<string, string>,
): ManifestAction[] {
  return actions.map((action) => {
    if (action.type === 'speech') {
      const speech = action as SpeechAction;
      const { audioId, ...rest } = speech;
      const audioRef = audioId ? audioIdToPath.get(audioId) : undefined;
      return {
        ...rest,
        ...(audioRef ? { audioRef } : {}),
        ...(speech.audioUrl ? { audioUrl: speech.audioUrl } : {}),
      } as ManifestAction;
    }
    return action as ManifestAction;
  });
}
