import { useSettingsStore } from '@/lib/store/settings';
import type {
  SceneOutline,
  UserRequirements,
  PdfImage,
} from '@/lib/types/generation';
import {
  ALL_GENERATION_STEPS,
} from '@/lib/generation/generation-steps';

export { ALL_GENERATION_STEPS as ALL_STEPS };

// Session state stored in sessionStorage
export interface GenerationSessionState {
  sessionId: string;
  requirements: UserRequirements;
  pdfText: string;
  pdfImages?: PdfImage[];
  imageStorageIds?: string[];
  sceneOutlines?: SceneOutline[] | null;
  currentStep: 'generating' | 'complete';
  pdfStorageKey?: string;
  pdfFileName?: string;
  pdfProviderId?: string;
  researchContext?: string;
  researchSources?: Array<{ title: string; url: string }>;
  languageDirective?: string;
}

export const getActiveSteps = (session: GenerationSessionState | null) => {
  return ALL_GENERATION_STEPS.filter((step) => {
    if (step.id === 'pdf-analysis') return !!session?.pdfStorageKey;
    if (step.id === 'web-search') return !!session?.requirements?.webSearch;
    if (step.id === 'agent-generation') return useSettingsStore.getState().agentMode === 'auto';
    return true;
  });
};
