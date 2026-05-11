import type { ComponentType } from 'react';
import { ElementTypes } from '@/lib/types/slides';

import { CommonElementOperate } from './Editor/Canvas/Operate/CommonElementOperate';
import { ImageElementOperate } from './Editor/Canvas/Operate/ImageElementOperate';
import { LineElementOperate } from './Editor/Canvas/Operate/LineElementOperate';
import { ShapeElementOperate } from './Editor/Canvas/Operate/ShapeElementOperate';
import { TableElementOperate } from './Editor/Canvas/Operate/TableElementOperate';
import { TextElementOperate } from './Editor/Canvas/Operate/TextElementOperate';
import { ChartElement } from './components/element/ChartElement';
import { BaseChartElement } from './components/element/ChartElement/BaseChartElement';
import { BaseCodeElement } from './components/element/CodeElement/BaseCodeElement';
import { ImageElement } from './components/element/ImageElement';
import { BaseImageElement } from './components/element/ImageElement/BaseImageElement';
import { LatexElement } from './components/element/LatexElement';
import { BaseLatexElement } from './components/element/LatexElement/BaseLatexElement';
import { LineElement } from './components/element/LineElement';
import { BaseLineElement } from './components/element/LineElement/BaseLineElement';
import { ShapeElement } from './components/element/ShapeElement';
import { BaseShapeElement } from './components/element/ShapeElement/BaseShapeElement';
import { TableElement } from './components/element/TableElement';
import { BaseTableElement } from './components/element/TableElement/BaseTableElement';
import { TextElement } from './components/element/TextElement';
import { BaseTextElement } from './components/element/TextElement/BaseTextElement';
import { VideoElement } from './components/element/VideoElement';
import { BaseVideoElement } from './components/element/VideoElement/BaseVideoElement';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- element components have different prop shapes.
type LooseElementComponent = ComponentType<any>;

const BASE_ELEMENT_COMPONENTS: Partial<Record<ElementTypes, LooseElementComponent>> = {
  [ElementTypes.IMAGE]: BaseImageElement,
  [ElementTypes.TEXT]: BaseTextElement,
  [ElementTypes.SHAPE]: BaseShapeElement,
  [ElementTypes.LINE]: BaseLineElement,
  [ElementTypes.CHART]: BaseChartElement,
  [ElementTypes.LATEX]: BaseLatexElement,
  [ElementTypes.TABLE]: BaseTableElement,
  [ElementTypes.VIDEO]: BaseVideoElement,
};

export const SCREEN_ELEMENT_COMPONENTS: Partial<Record<ElementTypes, LooseElementComponent>> = {
  ...BASE_ELEMENT_COMPONENTS,
  [ElementTypes.CODE]: BaseCodeElement,
};

export const THUMBNAIL_ELEMENT_COMPONENTS = BASE_ELEMENT_COMPONENTS;

export const EDITABLE_ELEMENT_COMPONENTS: Partial<Record<ElementTypes, LooseElementComponent>> = {
  [ElementTypes.IMAGE]: ImageElement,
  [ElementTypes.TEXT]: TextElement,
  [ElementTypes.SHAPE]: ShapeElement,
  [ElementTypes.LINE]: LineElement,
  [ElementTypes.CHART]: ChartElement,
  [ElementTypes.LATEX]: LatexElement,
  [ElementTypes.TABLE]: TableElement,
  [ElementTypes.VIDEO]: VideoElement,
};

export const OPERATE_ELEMENT_COMPONENTS: Partial<Record<ElementTypes, LooseElementComponent>> = {
  [ElementTypes.IMAGE]: ImageElementOperate,
  [ElementTypes.TEXT]: TextElementOperate,
  [ElementTypes.SHAPE]: ShapeElementOperate,
  [ElementTypes.LINE]: LineElementOperate,
  [ElementTypes.TABLE]: TableElementOperate,
  [ElementTypes.CHART]: CommonElementOperate,
  [ElementTypes.LATEX]: CommonElementOperate,
  [ElementTypes.VIDEO]: CommonElementOperate,
  [ElementTypes.AUDIO]: CommonElementOperate,
};
