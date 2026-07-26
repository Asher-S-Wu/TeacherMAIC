import { useMemo } from 'react';
import { useCanvasStore } from '@/lib/store';
import {
  type PPTElement,
  type PPTLineElement,
  type PPTVideoElement,
  type PPTAudioElement,
  type PPTShapeElement,
  type PPTChartElement,
} from '@/lib/types/slides';
import type { OperateLineHandlers, OperateResizeHandlers } from '@/lib/types/edit';
import { OPERATE_ELEMENT_COMPONENTS } from '../../../element-registry';

interface OperateProps {
  readonly elementInfo: PPTElement;
  readonly isSelected: boolean;
  readonly isActive: boolean;
  readonly isActiveGroupElement: boolean;
  readonly isMultiSelect: boolean;
  readonly rotateElement: (
    e: React.MouseEvent,
    element: Exclude<
      PPTElement,
      PPTChartElement | PPTLineElement | PPTVideoElement | PPTAudioElement
    >,
  ) => void;
  readonly scaleElement: (
    e: React.MouseEvent,
    element: Exclude<PPTElement, PPTLineElement>,
    command: OperateResizeHandlers,
  ) => void;
  readonly dragLineElement: (
    e: React.MouseEvent,
    element: PPTLineElement,
    command: OperateLineHandlers,
  ) => void;
  readonly moveShapeKeypoint: (
    e: React.MouseEvent,
    element: PPTShapeElement,
    index: number,
  ) => void;
}

export function Operate({
  elementInfo,
  isSelected,
  isActive,
  isActiveGroupElement,
  isMultiSelect,
  rotateElement,
  scaleElement,
  dragLineElement,
  moveShapeKeypoint,
}: OperateProps) {
  const canvasScale = useCanvasStore.use.canvasScale();

  const CurrentOperateComponent = OPERATE_ELEMENT_COMPONENTS[elementInfo.type];

  const rotate = useMemo(() => ('rotate' in elementInfo ? elementInfo.rotate : 0), [elementInfo]);
  const height = useMemo(() => ('height' in elementInfo ? elementInfo.height : 0), [elementInfo]);

  const handlerVisible = !elementInfo.lock && (isActiveGroupElement || !isMultiSelect);

  return (
    <div
      className={`operate absolute z-43 select-none ${isMultiSelect && !isActive ? 'opacity-20' : ''}`}
      style={{
        top: elementInfo.top * canvasScale + 'px',
        left: elementInfo.left * canvasScale + 'px',
        transform: `rotate(${rotate}deg)`,
        transformOrigin: `${(elementInfo.width * canvasScale) / 2}px ${(height * canvasScale) / 2}px`,
        pointerEvents: 'auto', // Enable mouse events for operate controls
      }}
    >
      {/* eslint-disable @typescript-eslint/no-explicit-any -- dynamic component dispatch requires type widening */}
      {isSelected && CurrentOperateComponent && (
        <CurrentOperateComponent
          elementInfo={elementInfo as any}
          handlerVisible={handlerVisible}
          rotateElement={rotateElement as any}
          scaleElement={scaleElement as any}
          dragLineElement={dragLineElement as any}
          moveShapeKeypoint={moveShapeKeypoint as any}
        />
      )}
      {/* eslint-enable @typescript-eslint/no-explicit-any */}
    </div>
  );
}
