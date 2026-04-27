export interface PlaybackSnapshot {
  sceneIndex: number;
  actionIndex: number;
  consumedDiscussions: string[];
  sceneId?: string;
}

const playbackMemory = new Map<string, PlaybackSnapshot>();

export async function savePlaybackState(
  stageId: string,
  snapshot: PlaybackSnapshot,
): Promise<void> {
  playbackMemory.set(stageId, snapshot);
}

export async function loadPlaybackState(stageId: string): Promise<PlaybackSnapshot | null> {
  return playbackMemory.get(stageId) || null;
}

export async function clearPlaybackState(stageId: string): Promise<void> {
  playbackMemory.delete(stageId);
}
