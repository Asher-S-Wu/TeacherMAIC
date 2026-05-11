import type { PPTElement } from '@/lib/types/slides';
import { THUMBNAIL_ELEMENT_COMPONENTS } from '../../element-registry';

interface ThumbnailElementProps {
  readonly elementInfo: PPTElement;
  readonly elementIndex: number;
}

/**
 * Thumbnail element component
 *
 * Renders the corresponding Base component based on element type
 */
export function ThumbnailElement({ elementInfo, elementIndex }: ThumbnailElementProps) {
  const CurrentElementComponent = THUMBNAIL_ELEMENT_COMPONENTS[elementInfo.type];
  if (!CurrentElementComponent) {
    return null;
  }

  return (
    <div
      className={`base-element base-element-${elementInfo.id}`}
      style={{
        zIndex: elementIndex,
      }}
    >
      <CurrentElementComponent elementInfo={elementInfo} target="thumbnail" />
    </div>
  );
}
