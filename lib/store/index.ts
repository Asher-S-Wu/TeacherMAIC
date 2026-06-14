// Core stores
import { useCanvasStore } from './canvas';
import { useKeyboardStore } from './keyboard';
import { useStageStore } from './stage';

export {
  // New architecture
  useCanvasStore,
  useStageStore,
  useKeyboardStore,
};

// Scene Context API (for extensible scene types)
export { useSceneSelector } from '@/lib/contexts/scene-context';
