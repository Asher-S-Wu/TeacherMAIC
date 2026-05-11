import { useCallback, type RefObject } from 'react';
import { useCanvasStore } from '@/lib/store';
import type { CreateElementSelectionData } from '@/lib/types/edit';

interface CreateSelectionRect {
  left: number;
  top: number;
  width: number;
  height: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  minX: number;
  minY: number;
}

export function useInsertFromCreateSelection(viewportRef: RefObject<HTMLElement | null>) {
  const canvasScale = useCanvasStore.use.canvasScale();
  const creatingElement = useCanvasStore.use.creatingElement();
  const setCreatingElement = useCanvasStore.use.setCreatingElement();

  const getCreateSelectionRect = useCallback(
    ({ start, end }: CreateElementSelectionData): CreateSelectionRect | undefined => {
      if (!viewportRef.current) return;
      const viewportRect = viewportRef.current.getBoundingClientRect();
      const [startX, startY] = start;
      const [endX, endY] = end;
      const minX = Math.min(startX, endX);
      const maxX = Math.max(startX, endX);
      const minY = Math.min(startY, endY);
      const maxY = Math.max(startY, endY);

      return {
        left: (minX - viewportRect.x) / canvasScale,
        top: (minY - viewportRect.y) / canvasScale,
        width: (maxX - minX) / canvasScale,
        height: (maxY - minY) / canvasScale,
        startX,
        startY,
        endX,
        endY,
        minX,
        minY,
      };
    },
    [viewportRef, canvasScale],
  );

  const formatCreateSelection = useCallback(
    (selectionData: CreateElementSelectionData) => {
      const rect = getCreateSelectionRect(selectionData);
      if (!rect) return;

      const { left, top, width, height } = rect;
      return { left, top, width, height };
    },
    [getCreateSelectionRect],
  );

  const formatCreateSelectionForLine = useCallback(
    (selectionData: CreateElementSelectionData) => {
      const rect = getCreateSelectionRect(selectionData);
      if (!rect) return;

      const { left, top, width, height, startX, startY, endX, endY, minX, minY } = rect;
      const start: [number, number] = [startX === minX ? 0 : width, startY === minY ? 0 : height];
      const end: [number, number] = [endX === minX ? 0 : width, endY === minY ? 0 : height];

      return {
        left,
        top,
        start,
        end,
      };
    },
    [getCreateSelectionRect],
  );

  const insertElementFromCreateSelection = useCallback(
    (selectionData: CreateElementSelectionData) => {
      if (!creatingElement) return;

      const type = creatingElement.type;
      if (type === 'text') {
        void formatCreateSelection(selectionData);
      } else if (type === 'shape') {
        void formatCreateSelection(selectionData);
      } else if (type === 'line') {
        void formatCreateSelectionForLine(selectionData);
      }
      setCreatingElement(null);
    },
    [creatingElement, formatCreateSelection, formatCreateSelectionForLine, setCreatingElement],
  );

  return {
    formatCreateSelection,
    insertElementFromCreateSelection,
  };
}
