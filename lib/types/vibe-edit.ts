import type { SceneOutline } from '@/lib/types/generation';
import type { Scene } from '@/lib/types/stage';
import type { AgentInfo } from '@/lib/generation/generation-pipeline';

export interface VibeEditMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface VibeEditDraft {
  summary: string;
  outline: SceneOutline;
  scene: Scene;
  previewScene: Scene;
  previewMediaMap: Record<string, string>;
}

export interface VibeEditPreviewRequest {
  scene: Scene;
  outline: SceneOutline;
  allOutlines: SceneOutline[];
  messages: VibeEditMessage[];
  agents?: AgentInfo[];
  userProfile?: string;
  languageDirective?: string;
  allowImageGeneration: boolean;
  allowVideoGeneration: boolean;
}

export interface VibeEditPreviewResponse {
  draft: VibeEditDraft;
}

export interface VibeEditApplyRequest {
  stageId: string;
  sceneId: string;
  outline: SceneOutline;
  scene: Scene;
  mediaMap: Record<string, string>;
  ttsEnabled: boolean;
}

export interface VibeEditApplyResponse {
  outline: SceneOutline;
  scene: Scene;
}
