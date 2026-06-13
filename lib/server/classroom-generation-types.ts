import type { AgentInfo } from '@/lib/generation/pipeline-types';
import type { PdfImage } from '@/lib/types/generation';

export interface GenerateClassroomInput {
  requirement: string;
  pdfContent?: { text: string; images?: string[] };
  pdfImages?: PdfImage[];
  userNickname?: string;
  userBio?: string;
  enableWebSearch?: boolean;
  enableImageGeneration?: boolean;
  enableVideoGeneration?: boolean;
  enableTTS?: boolean;
  agentMode?: 'preset' | 'auto';
  presetAgents?: AgentInfo[];
}

export type ClassroomGenerationStep =
  | 'initializing'
  | 'researching'
  | 'generating_outlines'
  | 'generating_agents'
  | 'generating_scenes'
  | 'generating_media'
  | 'generating_tts'
  | 'persisting'
  | 'completed';

export interface ClassroomGenerationProgress {
  step: ClassroomGenerationStep;
  progress: number;
  message: string;
  scenesGenerated: number;
  totalScenes?: number;
}

export interface GenerateClassroomResult {
  id: string;
  url: string;
  stage: import('@/lib/types/stage').Stage;
  scenes: import('@/lib/types/stage').Scene[];
  scenesCount: number;
  createdAt: string;
}
