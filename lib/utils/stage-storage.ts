/**
 * Account-backed classroom storage.
 *
 * All classroom data is saved through MongoDB API routes. Browser IndexedDB is
 * not used for account data.
 */

import type { Stage, Scene } from '../types/stage';
import type { ChatSession } from '../types/chat';
import type { SceneOutline } from '@/lib/types/generation';
import { createLogger } from '@/lib/logger';

const log = createLogger('StageStorage');

export interface StageStoreData {
  stage: Stage;
  scenes: Scene[];
  currentSceneId: string | null;
  chats: ChatSession[];
  outlines?: SceneOutline[];
}

export interface StageListItem {
  id: string;
  name: string;
  description?: string;
  sceneCount: number;
  createdAt: number;
  updatedAt: number;
  interactiveMode?: boolean;
}

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.success) {
    throw new Error(data?.error || `请求失败：${response.status}`);
  }
  return data as T;
}

export async function saveStageData(
  stageId: string,
  data: StageStoreData & { outlines?: SceneOutline[] },
): Promise<void> {
  const response = await fetch(`/api/classrooms/${encodeURIComponent(stageId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      stage: data.stage,
      scenes: data.scenes,
      currentSceneId: data.currentSceneId,
      chats: data.chats,
      outlines: data.outlines || [],
    }),
  });
  await readJson(response);
  log.info(`Saved stage: ${stageId}`);
}

export async function loadStageData(stageId: string): Promise<StageStoreData | null> {
  const response = await fetch(`/api/classrooms/${encodeURIComponent(stageId)}`);
  if (response.status === 404) return null;
  const data = await readJson<{ classroom: StageStoreData & { outlines?: SceneOutline[] } }>(
    response,
  );
  log.info(`Loaded stage: ${stageId}`);
  return data.classroom;
}

export async function deleteStageData(stageId: string): Promise<void> {
  const response = await fetch(`/api/classrooms/${encodeURIComponent(stageId)}`, {
    method: 'DELETE',
  });
  await readJson(response);
  log.info(`Deleted stage: ${stageId}`);
}

export async function listStages(): Promise<StageListItem[]> {
  const response = await fetch('/api/classrooms');
  const data = await readJson<{ classrooms: StageListItem[] }>(response);
  return data.classrooms;
}

export async function getFirstSlideByStages(
  stageIds: string[],
): Promise<Record<string, import('../types/slides').Slide>> {
  const result: Record<string, import('../types/slides').Slide> = {};
  await Promise.all(
    stageIds.map(async (stageId) => {
      const data = await loadStageData(stageId);
      const firstSlide = data?.scenes.find((s) => s.content?.type === 'slide');
      if (firstSlide?.content.type === 'slide') {
        result[stageId] = firstSlide.content.canvas;
      }
    }),
  );
  return result;
}

export async function renameStage(stageId: string, newName: string): Promise<void> {
  const response = await fetch(`/api/classrooms/${encodeURIComponent(stageId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName }),
  });
  await readJson(response);
  log.info(`Renamed stage ${stageId} to "${newName}"`);
}

export async function stageExists(stageId: string): Promise<boolean> {
  const response = await fetch(`/api/classrooms/${encodeURIComponent(stageId)}`);
  if (response.status === 404) return false;
  await readJson(response);
  return true;
}
