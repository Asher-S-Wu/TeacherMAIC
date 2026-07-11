/**
 * Two-Stage Generation Pipeline
 *
 * Barrel re-export — all symbols previously exported from this file
 * are now spread across focused sub-modules.
 */

// Types
export type {
  AgentInfo,
  SceneGenerationContext,
  AICallFn,
} from './pipeline-types';

// Prompt formatters
export {
  formatTeacherPersonaForPrompt,
  buildVisionUserContent,
} from './prompt-formatters';

// JSON repair
export { parseJsonResponse } from './json-repair';

// Scene generator (Stage 2)
export {
  generateSceneContent,
  generateSceneActions,
} from './scene-generator';

// Scene builder
export {
  buildCompleteScene,
} from './scene-builder';
