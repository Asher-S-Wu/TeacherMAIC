import { create } from 'zustand';
import { createSelectors } from '@/lib/utils/create-selectors';
import type { TextAttrs } from '@/lib/prosemirror/utils';
import { defaultRichTextAttrs } from '@/lib/prosemirror/utils';
import type { TextFormatPainter, CreatingElement } from '@/lib/types/edit';
import type { PercentageGeometry } from '@/lib/types/action';

/**
 * Spotlight options
 */
export interface SpotlightOptions {
  radius?: number; // Spotlight radius (pixels)
  dimness?: number; // Background dimming level (0-1)
  transition?: number; // Transition animation duration (milliseconds)
}

/**
 * Highlight overlay options
 */
export interface HighlightOverlayOptions {
  color?: string; // Highlight color
  opacity?: number; // Highlight opacity (0-1)
  borderWidth?: number; // Border width
  animated?: boolean; // Whether to animate
}

/**
 * Laser pointer options
 */
export interface LaserOptions {
  color?: string; // Laser pointer color, default red
  duration?: number; // Duration (milliseconds)
}

/**
 * Canvas Store - Manages all UI state of the Canvas editor
 *
 * Responsibilities:
 * - Element selection state (selected, handling, editing)
 * - Canvas viewport state (zoom, drag, ruler, grid)
 * - Toolbar and panel state
 * - Element being created
 * - Rich text editing state
 * - Format painter state
 *
 * Note: Does not manage slide data (elements, background, etc.), which is managed by Scene Context
 */

// ==================== Store Interface ====================

interface CanvasState {
  // ===== Element selection state =====
  activeElementIdList: string[]; // Currently selected element IDs
  handleElementId: string; // Element being operated (drag, resize, etc.)
  activeGroupElementId: string; // Selected child element within a group

  // ===== Teaching feature state =====
  spotlightElementId: string; // Element focused by spotlight
  spotlightOptions: SpotlightOptions | null; // Spotlight configuration
  spotlightMode: 'pixel' | 'percentage'; // Spotlight mode: pixel or percentage
  spotlightPercentageGeometry: PercentageGeometry | null; // Percentage mode geometry info
  highlightedElementIds: string[]; // Highlighted element IDs
  highlightOptions: HighlightOverlayOptions | null; // Highlight configuration
  laserElementId: string; // Element focused by laser pointer
  laserOptions: LaserOptions | null; // Laser pointer configuration
  zoomTarget: { elementId: string; scale: number } | null; // Zoom target

  // ===== Canvas viewport state =====
  canvasScale: number; // Canvas actual zoom scale
  viewportSize: number; // Viewport width base (default 1000px)
  viewportRatio: number; // Viewport aspect ratio (default 0.5625, i.e. 16:9)

  // ===== Display aids =====
  showRuler: boolean; // Show ruler
  gridLineSize: number; // Grid line size (0 means hidden)

  // ===== Element creation =====
  creatingElement: CreatingElement | null; // Element being created (needs draw-to-insert)

  // ===== Editing state =====
  isScaling: boolean; // Element scaling in progress
  clipingImageElementId: string; // Image being cropped
  richTextAttrs: TextAttrs; // Rich text editing state

  // ===== Format painter =====
  textFormatPainter: TextFormatPainter | null; // Text format painter

  // ===== Video playback =====
  playingVideoElementId: string; // Video element currently playing

  // ===== Whiteboard =====
  whiteboardOpen: boolean; // Whether whiteboard is open
  whiteboardClearing: boolean; // Whiteboard clear animation in progress

  // ===== Other =====
  editorAreaFocus: boolean; // Whether editor area is focused
  disableHotkeys: boolean; // Whether hotkeys are disabled

  // ===== Actions =====

  // ----- Element selection -----
  setActiveElementIdList: (ids: string[]) => void;
  setHandleElementId: (id: string) => void;
  setActiveGroupElementId: (id: string) => void;

  // ----- Canvas viewport -----
  setCanvasScale: (scale: number) => void;

  // ----- Display aids -----
  setRulerState: (show: boolean) => void;
  setGridLineSize: (size: number) => void;

  // ----- Element creation -----
  setCreatingElement: (element: CreatingElement | null) => void;

  // ----- Editing state -----
  setScalingState: (isScaling: boolean) => void;
  setClipingImageElementId: (id: string) => void;
  setRichtextAttrs: (attrs: TextAttrs) => void;

  // ----- Format painter -----
  setTextFormatPainter: (painter: TextFormatPainter | null) => void;

  // ----- Video playback -----
  playVideo: (elementId: string) => void;
  pauseVideo: () => void;

  // ----- Whiteboard -----
  setWhiteboardOpen: (open: boolean) => void;
  setWhiteboardClearing: (clearing: boolean) => void;

  // ----- Other -----
  setEditorAreaFocus: (focus: boolean) => void;
  setDisableHotkeysState: (disable: boolean) => void;

  // ----- Teaching features -----
  setSpotlight: (elementId: string, options?: SpotlightOptions) => void;
  clearSpotlight: () => void;
  setSpotlightPercentage: (
    elementId: string,
    geometry: PercentageGeometry,
    options?: SpotlightOptions,
  ) => void;
  setHighlight: (elementIds: string[], options?: HighlightOverlayOptions) => void;
  clearHighlight: () => void;
  setLaser: (elementId: string, options?: LaserOptions) => void;
  clearLaser: () => void;
  setZoom: (elementId: string, scale: number) => void;
  clearZoom: () => void;
  clearAllEffects: () => void;
}

// ==================== Initial State ====================

const initialState = {
  // Element selection
  activeElementIdList: [],
  handleElementId: '',
  activeGroupElementId: '',

  // Canvas viewport
  canvasScale: 1,
  viewportSize: 1000,
  viewportRatio: 0.5625, // 16:9

  // Display aids
  showRuler: false,
  gridLineSize: 0,

  // Element creation
  creatingElement: null,

  // Editing state
  isScaling: false,
  clipingImageElementId: '',
  richTextAttrs: defaultRichTextAttrs,

  // Format painter
  textFormatPainter: null,

  // Video playback
  playingVideoElementId: '',

  // Whiteboard
  whiteboardOpen: false,
  whiteboardClearing: false,

  // Other
  editorAreaFocus: false,
  disableHotkeys: false,

  // Teaching features
  spotlightElementId: '',
  spotlightOptions: null,
  spotlightMode: 'pixel' as const,
  spotlightPercentageGeometry: null,
  highlightedElementIds: [],
  highlightOptions: null,
  laserElementId: '',
  laserOptions: null,
  zoomTarget: null,
};

// ==================== Store Implementation ====================

const useCanvasStoreBase = create<CanvasState>((set) => ({
  ...initialState,

  // ===== Element Selection Actions =====

  setActiveElementIdList: (ids) => {
    set({ activeElementIdList: ids });
    // Auto-set handleElementId: set to that element for single select, empty for multi-select or none
    if (ids.length === 1) {
      set({ handleElementId: ids[0] });
    } else if (ids.length === 0) {
      set({ handleElementId: '' });
    }
  },

  setHandleElementId: (id) => set({ handleElementId: id }),

  setActiveGroupElementId: (id) => set({ activeGroupElementId: id }),

  // ===== Canvas Viewport Actions =====

  setCanvasScale: (scale) => set({ canvasScale: scale }),

  // ===== Display Aids Actions =====

  setRulerState: (show) => set({ showRuler: show }),

  setGridLineSize: (size) => set({ gridLineSize: size }),

  // ===== Element Creation Actions =====

  setCreatingElement: (element) => set({ creatingElement: element }),

  // ===== Editing State Actions =====

  setScalingState: (isScaling) => set({ isScaling }),

  setClipingImageElementId: (id) => set({ clipingImageElementId: id }),

  setRichtextAttrs: (attrs) => set({ richTextAttrs: attrs }),

  // ===== Format Painter Actions =====

  setTextFormatPainter: (painter) => set({ textFormatPainter: painter }),

  // ===== Video Playback Actions =====

  playVideo: (elementId) => set({ playingVideoElementId: elementId }),

  pauseVideo: () => set({ playingVideoElementId: '' }),

  // ===== Whiteboard Actions =====

  setWhiteboardOpen: (open) => set({ whiteboardOpen: open }),
  setWhiteboardClearing: (clearing) => set({ whiteboardClearing: clearing }),

  // ===== Other Actions =====

  setEditorAreaFocus: (focus) => set({ editorAreaFocus: focus }),

  setDisableHotkeysState: (disable) => set({ disableHotkeys: disable }),

  // ===== Teaching Feature Actions =====

  setSpotlight: (elementId, options = {}) => {
    set({
      spotlightElementId: elementId,
      spotlightMode: 'pixel',
      spotlightOptions: {
        radius: 200,
        dimness: 0.7,
        transition: 300,
        ...options,
      },
      spotlightPercentageGeometry: null,
    });
  },

  setSpotlightPercentage: (elementId, geometry, options = {}) => {
    set({
      spotlightElementId: elementId,
      spotlightMode: 'percentage',
      spotlightPercentageGeometry: geometry,
      spotlightOptions: {
        dimness: 0.7,
        transition: 300,
        ...options,
      },
    });
  },

  clearSpotlight: () => {
    set({
      spotlightElementId: '',
      spotlightOptions: null,
      spotlightMode: 'pixel',
      spotlightPercentageGeometry: null,
    });
  },

  setHighlight: (elementIds, options = {}) => {
    set({
      highlightedElementIds: elementIds,
      highlightOptions: {
        color: '#ff6b6b',
        opacity: 0.3,
        borderWidth: 3,
        animated: true,
        ...options,
      },
    });
  },

  clearHighlight: () => {
    set({
      highlightedElementIds: [],
      highlightOptions: null,
    });
  },

  setLaser: (elementId, options = {}) => {
    set({
      laserElementId: elementId,
      laserOptions: {
        color: '#ff0000',
        duration: 3000,
        ...options,
      },
    });
  },

  clearLaser: () => {
    set({
      laserElementId: '',
      laserOptions: null,
    });
  },

  setZoom: (elementId, scale) => {
    set({
      zoomTarget: { elementId, scale },
    });
  },

  clearZoom: () => {
    set({
      zoomTarget: null,
    });
  },

  clearAllEffects: () => {
    set({
      spotlightElementId: '',
      spotlightOptions: null,
      spotlightMode: 'pixel',
      spotlightPercentageGeometry: null,
      highlightedElementIds: [],
      highlightOptions: null,
      laserElementId: '',
      laserOptions: null,
      zoomTarget: null,
      // Note: playingVideoElementId intentionally NOT cleared here.
      // Video playback has its own lifecycle (playVideo/pauseVideo/onEnded)
      // and must not be interrupted by visual effect auto-clear timers.
    });
  },
}));

// Enhance store with selectors, supporting store.use.xxx() syntax
export const useCanvasStore = createSelectors(useCanvasStoreBase);
