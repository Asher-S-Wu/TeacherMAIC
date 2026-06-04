## Whiteboard Reference

### Canvas

- Size: 1000 x 563 pixels.
- Origin: x=0 is left, y=0 is top.
- Safe zone: keep content within x=20..980 and y=20..543.
- Center horizontally: x = (1000 - width) / 2.
- Two-column layout: left x=20..480, right x=520..980, with a 40px gutter.

### Tool Parameters

Use the whiteboard tools silently. Each tool call must use concrete coordinates and, when useful, a stable `elementId` so later turns can edit or delete that element.

#### wb_open

Open the board before a drawing sequence. Do not reopen before every draw call.

#### wb_draw_text

Use for labels, short steps, headings, and plain text.

- Required: `content`, `x`, `y`
- Optional: `width`, `height`, `fontSize`, `color`, `elementId`
- Do not put LaTeX commands in `content`; use `wb_draw_latex` for math.

#### wb_draw_shape

Use for simple diagrams and visual grouping.

- Required: `shape`, `x`, `y`, `width`, `height`
- `shape` is one of `rectangle`, `circle`, `triangle`
- Optional: `fillColor`, `elementId`

#### wb_draw_line

Use for arrows, relationships, flows, and annotations.

- Required: `startX`, `startY`, `endX`, `endY`
- Optional: `color`, `width`, `style`, `points`, `elementId`
- `width` is stroke thickness, not line length. Keep it around 2-4.
- `points` can mark arrowheads, for example `["", "arrow"]`.

#### wb_draw_latex

Use for formulas and scientific notation.

- Required: `latex`, `x`, `y`
- Optional: `width`, `height`, `color`, `elementId`
- In the `latex` argument, every LaTeX command backslash must be escaped as `\\` so it reaches KaTeX correctly.
- Good LaTeX argument examples: `\\frac{a}{b}`, `\\theta`, `\\times`, `\\rightarrow`, `\\sqrt{x}`.
- If the board shows broken tokens like `ext`, `heta`, `imes`, or `rac`, redraw the formula with escaped backslashes.

#### wb_draw_chart

Use for data visualization.

- Required: `chartType`, `x`, `y`, `width`, `height`, `data`
- `chartType` is one of `bar`, `column`, `line`, `pie`, `ring`, `area`, `radar`, `scatter`
- `data.labels` is a string array, `data.legends` is a string array, and `data.series` is an array of numeric arrays.
- Optional: `themeColors`, `elementId`

#### wb_draw_table

Use for comparisons, definitions, or structured examples.

- Required: `x`, `y`, `width`, `height`, `data`
- `data` is a two-dimensional string array; the first row is the header.
- Optional: `outline`, `theme`, `elementId`
- Table cells are plain text. Put formulas beside the table with `wb_draw_latex`.

#### wb_draw_code

Use for new code examples and algorithms.

- Required: `language`, `code`, `x`, `y`
- Optional: `width`, `height`, `fileName`, `elementId`
- The code block includes a header bar around 32px high. Leave enough height for all lines.
- Prefer giving code blocks stable IDs such as `code1` so `wb_edit_code` can update them later.

#### wb_edit_code

Use to change an existing code block smoothly.

- Required: `elementId`, `operation`
- `operation` is one of `insert_after`, `insert_before`, `delete_lines`, `replace_lines`
- For insert operations, use `lineId`.
- For delete or replace operations, use `lineIds`.
- For insert or replace operations, use `content`.
- Do not guess line IDs; read them from the current whiteboard state.

#### wb_delete

Delete one existing whiteboard element by ID. Prefer this over `wb_clear` for small corrections.

#### wb_clear

Clear all board elements. Use sparingly, only when the board is crowded or the explanation needs a clean start.

#### wb_close

Close the whiteboard only when the slide canvas needs to be visible again. Do not close at the end of a drawing turn; students need time to read the board.

### Layout Rules

- Hard bounds: x >= 0, y >= 0, x + width <= 1000, y + height <= 563.
- Preferred safe bounds: x >= 20, y >= 20, x + width <= 980, y + height <= 543.
- Minimum gap between elements: 20px.
- Vertical stacking: next y = previous y + previous height + 30.
- Avoid covering more than about 30% of any existing element.
- If space is tight, delete outdated elements, shrink the new element, or use a free region.

### Sizing

Text font sizes:

- Title: 28-32
- Section heading: 20-24
- Body or annotation: 16-18
- Caption: 12-14

LaTeX heights:

- Simple inline formula: 50-80
- Fractions, roots, integrals, limits: 60-100
- Summations with limits: 80-120
- Matrices: 100-180

Pair visual weight: a formula with height 70-80 should usually sit near text around 20-24px, not tiny caption text.

### Pre-Call Checklist

Before calling a whiteboard tool:

1. Coordinates are inside bounds and preferably inside the safe zone.
2. New elements do not noticeably overlap existing elements.
3. Math uses `wb_draw_latex`, not `wb_draw_text`.
4. LaTeX command backslashes are escaped in the `latex` argument.
5. Code edits use `wb_edit_code` instead of deleting and redrawing.
6. The whiteboard stays open unless returning to the slide canvas is necessary.
