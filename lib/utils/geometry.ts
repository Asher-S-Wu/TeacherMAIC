import type { PPTElement } from '@/lib/types/slides';
import type { PercentageGeometry } from '@/lib/types/action';

/**
 * Calculate percentage coordinates (0-100) for an element
 *
 * @param element - PPT element
 * @param viewportSize - Viewport width base, default 1000px
 * @returns Percentage geometry info, or null if the element has no position info
 */
export function getElementPercentageGeometry(
  element: PPTElement,
  viewportSize: number = 1000,
): PercentageGeometry | null {
  // Only positioned elements have left/top/width/height
  if (
    !('left' in element) ||
    !('top' in element) ||
    !('width' in element) ||
    !('height' in element)
  ) {
    return null;
  }

  const { left, top, width, height } = element;

  // Calculate percentage coordinates (relative to viewportSize)
  const x = (left / viewportSize) * 100;
  const y = (top / (viewportSize * 0.5625)) * 100; // 16:9 ratio
  const w = (width / viewportSize) * 100;
  const h = (height / (viewportSize * 0.5625)) * 100;

  // Calculate center point
  const centerX = x + w / 2;
  const centerY = y + h / 2;

  return {
    x,
    y,
    w,
    h,
    centerX,
    centerY,
  };
}

/**
 * Find percentage geometry info by element ID
 *
 * @param elements - Current slide elements
 * @param elementId - Element ID
 * @param viewportSize - Viewport width base, default 1000px
 * @returns Percentage geometry info, or null if element is not found or has no position info
 */
export function findElementGeometry(
  elements: PPTElement[],
  elementId: string,
  viewportSize: number = 1000,
): PercentageGeometry | null {
  const element = elements.find((el: PPTElement) => el.id === elementId);
  if (!element) {
    return null;
  }

  return getElementPercentageGeometry(element, viewportSize);
}
