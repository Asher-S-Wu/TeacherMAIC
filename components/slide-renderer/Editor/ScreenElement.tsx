'use client';

import { useSceneSelector } from '@/lib/contexts/scene-context';
import type { PPTElement } from '@/lib/types/slides';
import type { SceneContent } from '@/lib/types/stage';
import { SCREEN_ELEMENT_COMPONENTS } from '../element-registry';

interface ScreenElementProps {
  readonly elementInfo: PPTElement;
  readonly elementIndex: number;
  readonly animate?: boolean;
}

export function ScreenElement({ elementInfo, elementIndex, animate }: ScreenElementProps) {
  const CurrentElementComponent = SCREEN_ELEMENT_COMPONENTS[elementInfo.type];
  const theme = useSceneSelector<SceneContent, { fontColor: string; fontName: string }>(
    (content) => {
      if (content.type === 'slide') {
        return content.canvas.theme;
      }
      return {
        fontColor: '#333333',
        fontName: 'Microsoft YaHei',
      };
    },
  );

  if (!CurrentElementComponent) {
    return null;
  }

  return (
    <div
      className="screen-element"
      id={`screen-element-${elementInfo.id}`}
      style={{
        zIndex: elementIndex,
        color: theme.fontColor,
        fontFamily: theme.fontName,
      }}
    >
      <CurrentElementComponent elementInfo={elementInfo} animate={animate} />
    </div>
  );
}
