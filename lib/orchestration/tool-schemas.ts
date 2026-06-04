/**
 * Action tool schemas for stateless generation.
 *
 * MiniMax M3 receives classroom actions as Anthropic-compatible tool definitions.
 */

import type Anthropic from '@anthropic-ai/sdk';
import { SLIDE_ONLY_ACTIONS } from '@/lib/types/action';

// ==================== Effective Actions ====================

/**
 * Filter allowed actions by scene type.
 * Slide-only actions (spotlight, laser) are removed for non-slide scenes.
 */
export function getEffectiveActions(allowedActions: string[], sceneType?: string): string[] {
  if (!sceneType || sceneType === 'slide') return allowedActions;
  return allowedActions.filter(
    (a) => !SLIDE_ONLY_ACTIONS.includes(a as (typeof SLIDE_ONLY_ACTIONS)[number]),
  );
}

// ==================== Tool Schemas ====================

type JsonSchema = Anthropic.Tool.InputSchema;

const stringSchema = (description: string) => ({ type: 'string', description });
const numberSchema = (description: string) => ({ type: 'number', description });
const stringArraySchema = (description: string) => ({
  type: 'array',
  description,
  items: { type: 'string' },
});

function objectSchema(
  properties: Record<string, unknown>,
  required: string[] = [],
): JsonSchema {
  return {
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  };
}

const toolDescriptions: Record<string, string> = {
  spotlight:
    'Focus attention on one current slide element by dimming everything else. Use sparingly and only when a visible slide element matters.',
  laser:
    'Point at one current slide element with a laser pointer effect. Use for quick visual attention on a slide.',
  wb_open:
    'Open the whiteboard for formulas, diagrams, derivations, tables, code, or step-by-step visual explanations.',
  wb_draw_text:
    'Add text to the whiteboard. Use for key points, labels, short steps, and plain formulas.',
  wb_draw_shape:
    'Add a rectangle, circle, or triangle to the whiteboard for diagrams and visual explanations.',
  wb_draw_chart:
    'Add a chart to the whiteboard for data visualization, comparisons, trends, or distributions.',
  wb_draw_latex:
    'Add a LaTeX formula to the whiteboard. Use for math, physics, chemistry, and scientific notation.',
  wb_draw_table:
    'Add a table to the whiteboard for structured data, comparisons, definitions, or examples.',
  wb_draw_line:
    'Add a line or arrow to connect whiteboard elements, show flow, indicate relationships, or annotate.',
  wb_draw_code:
    'Add a syntax-highlighted code block to the whiteboard. Use for new code examples and algorithms.',
  wb_edit_code:
    'Edit an existing whiteboard code block with line-level insert, delete, or replace operations.',
  wb_clear:
    'Clear all whiteboard elements. Use only when the board is crowded or a new explanation needs a clean board.',
  wb_delete:
    'Delete one specific whiteboard element by ID. Prefer this over clearing the whole board for small corrections.',
  wb_close:
    'Close the whiteboard and return to the slide canvas. Use only when the slide needs to be visible again.',
  play_video:
    'Start playback of a video element on the current slide.',
};

const toolSchemas: Record<string, JsonSchema> = {
  spotlight: objectSchema(
    {
      elementId: stringSchema('ID of the slide element to spotlight.'),
      dimOpacity: numberSchema('Optional dim opacity for the rest of the slide.'),
    },
    ['elementId'],
  ),
  laser: objectSchema(
    {
      elementId: stringSchema('ID of the slide element to point at.'),
      color: stringSchema('Optional laser color, such as "#ff0000".'),
    },
    ['elementId'],
  ),
  wb_open: objectSchema({}),
  wb_draw_text: objectSchema(
    {
      content: stringSchema('Text content to place on the whiteboard.'),
      x: numberSchema('X coordinate on the whiteboard.'),
      y: numberSchema('Y coordinate on the whiteboard.'),
      width: numberSchema('Optional element width.'),
      height: numberSchema('Optional element height.'),
      fontSize: numberSchema('Optional font size.'),
      color: stringSchema('Optional text color.'),
      elementId: stringSchema('Optional stable element ID for later edits or deletion.'),
    },
    ['content', 'x', 'y'],
  ),
  wb_draw_shape: objectSchema(
    {
      shape: {
        type: 'string',
        enum: ['rectangle', 'circle', 'triangle'],
        description: 'Shape type.',
      },
      x: numberSchema('X coordinate on the whiteboard.'),
      y: numberSchema('Y coordinate on the whiteboard.'),
      width: numberSchema('Shape width.'),
      height: numberSchema('Shape height.'),
      fillColor: stringSchema('Optional fill color.'),
      elementId: stringSchema('Optional stable element ID for later edits or deletion.'),
    },
    ['shape', 'x', 'y', 'width', 'height'],
  ),
  wb_draw_chart: objectSchema(
    {
      chartType: {
        type: 'string',
        enum: ['bar', 'column', 'line', 'pie', 'ring', 'area', 'radar', 'scatter'],
        description: 'Chart type.',
      },
      x: numberSchema('X coordinate on the whiteboard.'),
      y: numberSchema('Y coordinate on the whiteboard.'),
      width: numberSchema('Chart width.'),
      height: numberSchema('Chart height.'),
      data: {
        type: 'object',
        description: 'Chart data.',
        properties: {
          labels: stringArraySchema('Axis or category labels.'),
          legends: stringArraySchema('Series legend names.'),
          series: {
            type: 'array',
            description: 'Series values; each inner array is one series.',
            items: { type: 'array', items: { type: 'number' } },
          },
        },
        required: ['labels', 'legends', 'series'],
        additionalProperties: false,
      },
      themeColors: stringArraySchema('Optional chart colors.'),
      elementId: stringSchema('Optional stable element ID for later edits or deletion.'),
    },
    ['chartType', 'x', 'y', 'width', 'height', 'data'],
  ),
  wb_draw_latex: objectSchema(
    {
      latex: stringSchema('LaTeX formula content.'),
      x: numberSchema('X coordinate on the whiteboard.'),
      y: numberSchema('Y coordinate on the whiteboard.'),
      width: numberSchema('Optional formula width.'),
      height: numberSchema('Optional formula height.'),
      color: stringSchema('Optional formula color.'),
      elementId: stringSchema('Optional stable element ID for later edits or deletion.'),
    },
    ['latex', 'x', 'y'],
  ),
  wb_draw_table: objectSchema(
    {
      x: numberSchema('X coordinate on the whiteboard.'),
      y: numberSchema('Y coordinate on the whiteboard.'),
      width: numberSchema('Table width.'),
      height: numberSchema('Table height.'),
      data: {
        type: 'array',
        description: 'Table rows; first row is the header.',
        items: { type: 'array', items: { type: 'string' } },
      },
      outline: {
        type: 'object',
        description: 'Optional table outline style.',
        properties: {
          width: numberSchema('Outline width.'),
          style: stringSchema('Outline style.'),
          color: stringSchema('Outline color.'),
        },
        additionalProperties: false,
      },
      theme: {
        type: 'object',
        description: 'Optional table theme.',
        properties: {
          color: stringSchema('Theme color.'),
        },
        additionalProperties: false,
      },
      elementId: stringSchema('Optional stable element ID for later edits or deletion.'),
    },
    ['x', 'y', 'width', 'height', 'data'],
  ),
  wb_draw_line: objectSchema(
    {
      startX: numberSchema('Start X coordinate.'),
      startY: numberSchema('Start Y coordinate.'),
      endX: numberSchema('End X coordinate.'),
      endY: numberSchema('End Y coordinate.'),
      color: stringSchema('Optional line color.'),
      width: numberSchema('Optional line width.'),
      style: {
        type: 'string',
        enum: ['solid', 'dashed'],
        description: 'Optional line style.',
      },
      points: {
        type: 'array',
        description: 'Endpoint markers, for example ["", "arrow"].',
        items: { type: 'string', enum: ['', 'arrow'] },
      },
      elementId: stringSchema('Optional stable element ID for later edits or deletion.'),
    },
    ['startX', 'startY', 'endX', 'endY'],
  ),
  wb_draw_code: objectSchema(
    {
      language: stringSchema('Programming language, such as python, javascript, or typescript.'),
      code: stringSchema('Source code. Use newline characters for multiple lines.'),
      x: numberSchema('X coordinate on the whiteboard.'),
      y: numberSchema('Y coordinate on the whiteboard.'),
      width: numberSchema('Optional code block width.'),
      height: numberSchema('Optional code block height.'),
      fileName: stringSchema('Optional file name shown in the code block header.'),
      elementId: stringSchema('Optional stable element ID for later edits or deletion.'),
    },
    ['language', 'code', 'x', 'y'],
  ),
  wb_edit_code: objectSchema(
    {
      elementId: stringSchema('Target code block ID.'),
      operation: {
        type: 'string',
        enum: ['insert_after', 'insert_before', 'delete_lines', 'replace_lines'],
        description: 'Line-level edit operation.',
      },
      lineId: stringSchema('Reference line ID for insert operations.'),
      lineIds: stringArraySchema('Target line IDs for delete or replace operations.'),
      content: stringSchema('New code for insert or replace operations.'),
    },
    ['elementId', 'operation'],
  ),
  wb_clear: objectSchema({}),
  wb_delete: objectSchema(
    {
      elementId: stringSchema('Whiteboard element ID to delete.'),
    },
    ['elementId'],
  ),
  wb_close: objectSchema({}),
  play_video: objectSchema(
    {
      elementId: stringSchema('ID of the video element to play.'),
    },
    ['elementId'],
  ),
};

export function getActionTools(allowedActions: string[]): Anthropic.Tool[] {
  return allowedActions
    .filter((action) => toolDescriptions[action] && toolSchemas[action])
    .map((action) => ({
      name: action,
      description: toolDescriptions[action],
      input_schema: toolSchemas[action],
      strict: true,
    }));
}

// ==================== Text Descriptions ====================

/**
 * Get text descriptions of allowed actions for inclusion in system prompts.
 */
export function getActionDescriptions(allowedActions: string[]): string {
  if (allowedActions.length === 0) {
    return 'You have no tools available. You can only speak to students.';
  }

  const lines = allowedActions
    .filter((action) => toolDescriptions[action] && toolSchemas[action])
    .map((action) => `- ${action}: ${toolDescriptions[action]}`);

  return lines.join('\n');
}
