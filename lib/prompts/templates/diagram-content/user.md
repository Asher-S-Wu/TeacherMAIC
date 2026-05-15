Create an interactive diagram for: {{title}}

## Diagram Type
{{diagramType}}

## Description
{{description}}

## Key Points
{{keyPoints}}

## Language
{{languageDirective}}

---

Generate a complete HTML diagram with:

1. **SVG nodes** with icons, labels, and click-to-show details
2. **Edges with arrows** connecting nodes (calculate endpoints from node dimensions)
3. **Step-by-step reveal** (下一步/上一步)
4. **Theme-aware high contrast**: Support both light and dark themes. Light theme uses a light background with dark text/nodes; dark theme uses a dark background with light text/nodes.
5. **Mobile-friendly**: Collapsible sidebar, doesn't block diagram
6. **First node visible** on load

Theme requirements:
- Read the current theme from `document.documentElement.dataset.widgetTheme` (`light` or `dark`)
- Define both `:root[data-widget-theme='light']` and `:root[data-widget-theme='dark']` palettes with CSS variables
- Use CSS variables for page background, panels, nodes, text, edges, and accents instead of hardcoded single-theme colors

Embed config in `<script type="application/json" id="widget-config">`.
