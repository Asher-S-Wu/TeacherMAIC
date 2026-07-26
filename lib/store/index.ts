// Core stores
import { useCanvasStore } from './canvas';
import { useStageStore } from './stage';

export {
  // New architecture
  useCanvasStore,
  useStageStore,
};

// Scene Context API (for extensible scene types)
export { useSceneSelector } from '@/lib/contexts/scene-context';
