import { useState, useEffect, useMemo, useCallback, type RefObject } from 'react';
import { useCanvasStore } from '@/lib/store';

export interface ViewportStyles {
  width: number;
  height: number;
  left: number;
  top: number;
}

/**
 * Hook for managing Canvas viewport size and position
 * Handles viewport scaling and positioning
 */
export function useViewportSize(canvasRef: RefObject<HTMLElement | null>) {
  const [viewportLeft, setViewportLeft] = useState(0);
  const [viewportTop, setViewportTop] = useState(0);

  const setCanvasScale = useCanvasStore.use.setCanvasScale();

  const viewportRatio = useCanvasStore.use.viewportRatio();
  const viewportSize = useCanvasStore.use.viewportSize();

  // Initialize viewport position
  const initViewportPosition = useCallback(() => {
    if (!canvasRef.current) return;
    const canvasWidth = canvasRef.current.clientWidth;
    const canvasHeight = canvasRef.current.clientHeight;

    if (canvasHeight / canvasWidth > viewportRatio) {
      const viewportActualWidth = canvasWidth * 0.9;
      setCanvasScale(viewportActualWidth / viewportSize);
      setViewportLeft((canvasWidth - viewportActualWidth) / 2);
      setViewportTop((canvasHeight - viewportActualWidth * viewportRatio) / 2);
    } else {
      const viewportActualHeight = canvasHeight * 0.9;
      setCanvasScale(viewportActualHeight / (viewportSize * viewportRatio));
      setViewportLeft((canvasWidth - viewportActualHeight / viewportRatio) / 2);
      setViewportTop((canvasHeight - viewportActualHeight) / 2);
    }
  }, [canvasRef, viewportRatio, viewportSize, setCanvasScale]);

  // Reset viewport position when viewport ratio or size changes
  useEffect(() => {
    initViewportPosition();
  }, [viewportRatio, viewportSize, initViewportPosition]);

  // Reset viewport position when canvas is resized
  useEffect(() => {
    const el = canvasRef.current;
    const resizeObserver = new ResizeObserver(initViewportPosition);
    if (el) {
      resizeObserver.observe(el);
    }
    return () => {
      if (el) {
        resizeObserver.unobserve(el);
      }
    };
  }, [canvasRef, initViewportPosition]);

  // Viewport position and size styles
  const viewportStyles: ViewportStyles = useMemo(
    () => ({
      width: viewportSize,
      height: viewportSize * viewportRatio,
      left: viewportLeft,
      top: viewportTop,
    }),
    [viewportSize, viewportRatio, viewportLeft, viewportTop],
  );

  return {
    viewportStyles,
  };
}
