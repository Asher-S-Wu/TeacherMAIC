import { create } from 'zustand';
import { useStageStore } from './stage';
import type { Scene } from '@/lib/types/stage';

interface Snapshot {
  index: number;
  slides: Scene[];
}

export interface SnapshotState {
  snapshotCursor: number;
  snapshotLength: number;
  canUndo: () => boolean;
  canRedo: () => boolean;
  setSnapshotCursor: (cursor: number) => void;
  setSnapshotLength: (length: number) => void;
  initSnapshotDatabase: () => Promise<void>;
  addSnapshot: () => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

const snapshots: Snapshot[] = [];
const snapshotLengthLimit = 20;

function currentSnapshot(): Snapshot {
  const stageStore = useStageStore.getState();
  return {
    index: stageStore.getSceneIndex(stageStore.currentSceneId || ''),
    slides: JSON.parse(JSON.stringify(stageStore.scenes)),
  };
}

export const useSnapshotStore = create<SnapshotState>((set, get) => ({
  snapshotCursor: -1,
  snapshotLength: 0,

  canUndo: () => get().snapshotCursor > 0,
  canRedo: () => get().snapshotCursor < get().snapshotLength - 1,

  setSnapshotCursor: (cursor: number) => set({ snapshotCursor: cursor }),
  setSnapshotLength: (length: number) => set({ snapshotLength: length }),

  initSnapshotDatabase: async () => {
    snapshots.length = 0;
    snapshots.push(currentSnapshot());
    set({ snapshotCursor: 0, snapshotLength: 1 });
  },

  addSnapshot: async () => {
    const { snapshotCursor } = get();
    if (snapshotCursor >= 0 && snapshotCursor < snapshots.length - 1) {
      snapshots.splice(snapshotCursor + 1);
    }
    snapshots.push(currentSnapshot());
    if (snapshots.length > snapshotLengthLimit) {
      snapshots.shift();
    }
    set({
      snapshotCursor: snapshots.length - 1,
      snapshotLength: snapshots.length,
    });
  },

  undo: async () => {
    const { snapshotCursor } = get();
    if (snapshotCursor <= 0) return;
    const nextCursor = snapshotCursor - 1;
    const snapshot = snapshots[nextCursor];
    const stageStore = useStageStore.getState();
    const sceneIndex = Math.min(snapshot.index, snapshot.slides.length - 1);
    stageStore.setScenes(snapshot.slides);
    if (snapshot.slides[sceneIndex]) {
      stageStore.setCurrentSceneId(snapshot.slides[sceneIndex].id);
    }
    set({ snapshotCursor: nextCursor });
  },

  redo: async () => {
    const { snapshotCursor, snapshotLength } = get();
    if (snapshotCursor >= snapshotLength - 1) return;
    const nextCursor = snapshotCursor + 1;
    const snapshot = snapshots[nextCursor];
    const stageStore = useStageStore.getState();
    const sceneIndex = Math.min(snapshot.index, snapshot.slides.length - 1);
    stageStore.setScenes(snapshot.slides);
    if (snapshot.slides[sceneIndex]) {
      stageStore.setCurrentSceneId(snapshot.slides[sceneIndex].id);
    }
    set({ snapshotCursor: nextCursor });
  },
}));
