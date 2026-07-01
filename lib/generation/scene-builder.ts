/**
 * Scene building and element normalization.
 * Does NOT depend on store — returns complete Scene objects.
 */

import { nanoid } from 'nanoid';
import type {
  SceneOutline,
  GeneratedSlideContent,
  GeneratedQuizContent,
  GeneratedInteractiveContent,
  GeneratedPBLContent,
} from '@/lib/types/generation';
import type { Slide, SlideTheme } from '@/lib/types/slides';
import type { Scene } from '@/lib/types/stage';
import type { Action } from '@/lib/types/action';

/**
 * Build complete Scene object (without API/store)
 */
export function buildCompleteScene(
  outline: SceneOutline,
  content:
    | GeneratedSlideContent
    | GeneratedQuizContent
    | GeneratedInteractiveContent
    | GeneratedPBLContent,
  actions: Action[],
  stageId: string,
): Scene | null {
  const sceneId = nanoid();

  if (outline.type === 'slide' && 'elements' in content) {
    // Build Slide object
    const defaultTheme: SlideTheme = {
      backgroundColor: '#ffffff',
      themeColors: ['#5b9bd5', '#ed7d31', '#a5a5a5', '#ffc000', '#4472c4'],
      fontColor: '#333333',
      fontName: 'Microsoft YaHei',
      outline: { color: '#d14424', width: 2, style: 'solid' },
      shadow: { h: 0, v: 0, blur: 10, color: '#000000' },
    };

    const slide: Slide = {
      id: nanoid(),
      viewportSize: 1000,
      viewportRatio: 0.5625,
      theme: defaultTheme,
      elements: content.elements,
      background: content.background,
    };

    return {
      id: sceneId,
      stageId,
      type: 'slide',
      title: outline.title,
      order: outline.order,
      content: {
        type: 'slide',
        canvas: slide,
      },
      actions,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  if (outline.type === 'quiz' && 'questions' in content) {
    return {
      id: sceneId,
      stageId,
      type: 'quiz',
      title: outline.title,
      order: outline.order,
      content: {
        type: 'quiz',
        questions: content.questions,
      },
      actions,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  if (outline.type === 'interactive' && 'html' in content) {
    return {
      id: sceneId,
      stageId,
      type: 'interactive',
      title: outline.title,
      order: outline.order,
      content: {
        type: 'interactive',
        url: '',
        html: content.html,
        // Ultra Mode widget fields
        widgetType: content.widgetType,
        widgetConfig: content.widgetConfig,
        teacherActions: content.teacherActions,
      },
      actions,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  if (outline.type === 'pbl' && 'projectConfig' in content) {
    return {
      id: sceneId,
      stageId,
      type: 'pbl',
      title: outline.title,
      order: outline.order,
      content: {
        type: 'pbl',
        projectConfig: content.projectConfig,
      },
      actions,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  return null;
}
