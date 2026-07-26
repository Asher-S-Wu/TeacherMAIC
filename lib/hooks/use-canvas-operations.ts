/**
 * Canvas Element Operations Hook
 *
 * Provides convenient element CRUD methods to avoid repetitive definitions in each component
 */

import { useSceneData, useSceneSelector } from '@/lib/contexts/scene-context';
import { useCanvasStore } from '@/lib/store/canvas';
import type { SlideContent } from '@/lib/types/stage';
import type { PPTElement, Slide } from '@/lib/types/slides';
import { useCallback, useMemo } from 'react';
import { useHistorySnapshot } from '@/lib/hooks/use-history-snapshot';
import { ElementAlignCommands, ElementOrderCommands } from '@/lib/types/edit';
import { getElementListRange } from '@/lib/utils/element';
import { useOrderElement } from './use-order-element';
import { nanoid } from 'nanoid';

type PPTElementKey = keyof PPTElement;

interface RemovePropData {
  id: string;
  propName: PPTElementKey | PPTElementKey[];
}

interface UpdateElementData {
  id: string | string[];
  props: Partial<PPTElement>;
  slideId?: string;
}

export function useCanvasOperations() {
  const { updateSceneData } = useSceneData<SlideContent>();
  const currentSlide = useSceneSelector<SlideContent, Slide>((content) => content.canvas);

  const activeElementIdList = useCanvasStore.use.activeElementIdList();
  const activeElementList = useMemo(
    () => currentSlide.elements.filter((el) => activeElementIdList.includes(el.id)),
    [currentSlide.elements, activeElementIdList],
  );
  const activeGroupElementId = useCanvasStore.use.activeGroupElementId();
  const setActiveElementIdList = useCanvasStore.use.setActiveElementIdList();
  const handleElementId = useCanvasStore.use.handleElementId();

  const viewportSize = useCanvasStore.use.viewportSize();
  const viewportRatio = useCanvasStore.use.viewportRatio();

  const { addHistorySnapshot } = useHistorySnapshot();
  const { moveUpElement, moveDownElement, moveTopElement, moveBottomElement } = useOrderElement();

  // Delete all selected elements
  // If a group member is selected for independent operation, delete that element first. Otherwise delete all selected elements.
  // If elementId is provided, only delete that element
  const deleteElement = (elementId?: string) => {
    let newElementList: PPTElement[] = [];

    if (elementId) {
      // Delete specified element
      newElementList = currentSlide.elements.filter((el) => el.id !== elementId);
      setActiveElementIdList(activeElementIdList.filter((id) => id !== elementId));
    } else {
      // Original logic: delete selected elements
      if (!activeElementIdList.length) return;

      if (activeGroupElementId) {
        newElementList = currentSlide.elements.filter((el) => el.id !== activeGroupElementId);
      } else {
        newElementList = currentSlide.elements.filter((el) => !activeElementIdList.includes(el.id));
      }
      setActiveElementIdList([]);
    }

    updateSlide({ elements: newElementList });
    addHistorySnapshot();
  };

  // Delete all elements on the page (regardless of selection)
  const deleteAllElements = () => {
    if (!currentSlide.elements.length) return;
    setActiveElementIdList([]);
    updateSlide({ elements: [] });
    addHistorySnapshot();
  };

  /**
   * Update element properties
   * @param props Properties to update
   */
  const updateElement = useCallback(
    (data: UpdateElementData) => {
      const { id, props } = data;
      const elementIds = Array.isArray(id) ? id : [id];

      updateSceneData((draft) => {
        draft.canvas.elements.forEach((el) => {
          if (elementIds.includes(el.id)) {
            Object.assign(el, props);
          }
        });
      });
    },
    [updateSceneData],
  );

  /**
   * Update slide content
   */
  const updateSlide = useCallback(
    (props: Partial<Slide>) => {
      updateSceneData((draft) => {
        Object.assign(draft.canvas, props);
      });
    },
    [updateSceneData],
  );

  /**
   * Remove element properties
   */
  const removeElementProps = useCallback(
    (data: RemovePropData) => {
      const { id, propName } = data;
      const elementIds = Array.isArray(id) ? id : [id];
      const propNames = Array.isArray(propName) ? propName : [propName];

      updateSceneData((draft) => {
        draft.canvas.elements.forEach((el) => {
          if (elementIds.includes(el.id)) {
            propNames.forEach((name) => {
              delete el[name];
            });
          }
        });
      });
    },
    [updateSceneData],
  );

  // Lock selected elements and clear selection state
  const lockElement = () => {
    const newElementList: PPTElement[] = JSON.parse(JSON.stringify(currentSlide.elements));

    for (const element of newElementList) {
      if (activeElementIdList.includes(element.id)) element.lock = true;
    }
    updateSlide({ elements: newElementList });
    setActiveElementIdList([]);
    addHistorySnapshot();
  };

  /**
   * Unlock an element and set it as the current selection
   * @param handleElement The element to unlock
   */
  const unlockElement = (handleElement: PPTElement) => {
    const newElementList: PPTElement[] = JSON.parse(JSON.stringify(currentSlide.elements));

    if (handleElement.groupId) {
      const groupElementIdList = [];
      for (const element of newElementList) {
        if (element.groupId === handleElement.groupId) {
          element.lock = false;
          groupElementIdList.push(element.id);
        }
      }
      updateSlide({ elements: newElementList });
      setActiveElementIdList(groupElementIdList);
    } else {
      for (const element of newElementList) {
        if (element.id === handleElement.id) {
          element.lock = false;
          break;
        }
      }
      updateSlide({ elements: newElementList });
      setActiveElementIdList([handleElement.id]);
    }
    addHistorySnapshot();
  };

  // Select all elements on the current page
  const selectAllElements = () => {
    const unlockedElements = currentSlide.elements.filter((el) => !el.lock);
    const newActiveElementIdList = unlockedElements.map((el) => el.id);
    setActiveElementIdList(newActiveElementIdList);
  };

  /**
   * Align all selected elements to the canvas
   * @param command Alignment direction
   */
  const alignElementToCanvas = (command: ElementAlignCommands) => {
    const viewportWidth = viewportSize;
    const viewportHeight = viewportSize * viewportRatio;
    const { minX, maxX, minY, maxY } = getElementListRange(activeElementList);

    const newElementList: PPTElement[] = JSON.parse(JSON.stringify(currentSlide.elements));
    for (const element of newElementList) {
      if (!activeElementIdList.includes(element.id)) continue;

      // Center horizontally and vertically
      if (command === ElementAlignCommands.CENTER) {
        const offsetY = minY + (maxY - minY) / 2 - viewportHeight / 2;
        const offsetX = minX + (maxX - minX) / 2 - viewportWidth / 2;
        element.top = element.top - offsetY;
        element.left = element.left - offsetX;
      }

      // Align to top
      if (command === ElementAlignCommands.TOP) {
        const offsetY = minY - 0;
        element.top = element.top - offsetY;
      }

      // Center vertically
      else if (command === ElementAlignCommands.VERTICAL) {
        const offsetY = minY + (maxY - minY) / 2 - viewportHeight / 2;
        element.top = element.top - offsetY;
      }

      // Align to bottom
      else if (command === ElementAlignCommands.BOTTOM) {
        const offsetY = maxY - viewportHeight;
        element.top = element.top - offsetY;
      }

      // Align to left
      else if (command === ElementAlignCommands.LEFT) {
        const offsetX = minX - 0;
        element.left = element.left - offsetX;
      }

      // Center horizontally
      else if (command === ElementAlignCommands.HORIZONTAL) {
        const offsetX = minX + (maxX - minX) / 2 - viewportWidth / 2;
        element.left = element.left - offsetX;
      }

      // Align to right
      else if (command === ElementAlignCommands.RIGHT) {
        const offsetX = maxX - viewportWidth;
        element.left = element.left - offsetX;
      }
    }

    updateSlide({ elements: newElementList });
    addHistorySnapshot();
  };

  /**
   * Adjust element z-order
   * @param element The element to reorder
   * @param command Reorder command: move up, move down, bring to front, send to back
   */
  const orderElement = (element: PPTElement, command: ElementOrderCommands) => {
    let newElementList;

    if (command === ElementOrderCommands.UP)
      newElementList = moveUpElement(currentSlide.elements, element);
    else if (command === ElementOrderCommands.DOWN)
      newElementList = moveDownElement(currentSlide.elements, element);
    else if (command === ElementOrderCommands.TOP)
      newElementList = moveTopElement(currentSlide.elements, element);
    else if (command === ElementOrderCommands.BOTTOM)
      newElementList = moveBottomElement(currentSlide.elements, element);

    if (!newElementList) return;

    updateSlide({ elements: newElementList });
    addHistorySnapshot();
  };

  /**
   * Group current selected elements: assign the same group ID to all selected elements
   */
  const combineElements = () => {
    if (!activeElementList.length) return;

    // Create a new element list for subsequent operations
    let newElementList: PPTElement[] = JSON.parse(JSON.stringify(currentSlide.elements));

    // Generate group ID
    const groupId = nanoid(10);

    // Collect elements to be grouped and assign the unique group ID
    const combineElementList: PPTElement[] = [];
    for (const element of newElementList) {
      if (activeElementIdList.includes(element.id)) {
        element.groupId = groupId;
        combineElementList.push(element);
      }
    }

    // Ensure all group members have consecutive z-order levels:
    // First find the highest z-level member, remove all group members from the element list,
    // then insert the collected group members back at the appropriate position based on the highest level
    const combineElementMaxLevel = newElementList.findIndex(
      (_element) => _element.id === combineElementList[combineElementList.length - 1].id,
    );
    const combineElementIdList = combineElementList.map((_element) => _element.id);
    newElementList = newElementList.filter(
      (_element) => !combineElementIdList.includes(_element.id),
    );

    const insertLevel = combineElementMaxLevel - combineElementList.length + 1;
    newElementList.splice(insertLevel, 0, ...combineElementList);

    updateSlide({ elements: newElementList });
    addHistorySnapshot();
  };

  /**
   * Ungroup elements: remove the group ID from selected elements
   */
  const uncombineElements = () => {
    if (!activeElementList.length) return;
    const hasElementInGroup = activeElementList.some((item) => item.groupId);
    if (!hasElementInGroup) return;

    const newElementList: PPTElement[] = JSON.parse(JSON.stringify(currentSlide.elements));
    for (const element of newElementList) {
      if (activeElementIdList.includes(element.id) && element.groupId) delete element.groupId;
    }
    updateSlide({ elements: newElementList });

    // After ungrouping, reset active element state
    // Default to the currently handled element, or empty if none exists
    const handleElementIdList = handleElementId ? [handleElementId] : [];
    setActiveElementIdList(handleElementIdList);

    addHistorySnapshot();
  };

  return {
    // Basic operations
    deleteElement,
    deleteAllElements,
    updateElement,
    updateSlide,
    removeElementProps,

    // Advanced operations
    lockElement,
    unlockElement,
    selectAllElements,
    alignElementToCanvas,
    orderElement,
    combineElements,
    uncombineElements,
  };
}
