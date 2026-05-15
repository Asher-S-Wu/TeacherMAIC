/**
 * Patch embedded HTML to display correctly inside an iframe.
 *
 * Injects CSS that ensures proper sizing and scrolling behavior
 * when HTML content is rendered via srcDoc in an iframe.
 */
import { normalizeWidgetConfigScript, removeTailwindBrowserRuntime } from './interactive-html';

export type WidgetTheme = 'light' | 'dark';

export function patchHtmlForIframe(html: string, theme: WidgetTheme = 'light'): string {
  const processedHtml = normalizeWidgetConfigScript(removeTailwindBrowserRuntime(html));
  const iframeCss = `<style data-iframe-patch>
  html, body {
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    overflow-x: hidden;
    overflow-y: auto;
  }
  /* Fix min-h-screen: in iframes 100vh is the iframe height, which is correct,
     but ensure body actually fills it */
  body { min-height: 100vh; }
  </style>`;
  const themeBridge = `<script data-widget-theme-bridge>
  (function () {
    function applyWidgetTheme(theme) {
      if (theme !== 'light' && theme !== 'dark') return;
      window.WIDGET_THEME = theme;
      document.documentElement.dataset.widgetTheme = theme;
      document.documentElement.classList.toggle('dark', theme === 'dark');
      document.documentElement.style.colorScheme = theme;
      window.dispatchEvent(new CustomEvent('widget-theme-change', { detail: { theme: theme } }));
    }

    applyWidgetTheme('${theme}');

    window.addEventListener('message', function (event) {
      if (!event.data || event.data.type !== 'SET_WIDGET_THEME') return;
      applyWidgetTheme(event.data.theme);
    });
  })();
  </script>`;
  const injection = `${iframeCss}\n${themeBridge}`;

  // Insert right after <head> or at the start of the document
  const headIdx = processedHtml.indexOf('<head>');
  if (headIdx !== -1) {
    const insertPos = headIdx + 6; // after <head>
    return (
      processedHtml.substring(0, insertPos) +
      '\n' +
      injection +
      processedHtml.substring(insertPos)
    );
  }

  const headWithAttrs = processedHtml.indexOf('<head ');
  if (headWithAttrs !== -1) {
    const closeAngle = processedHtml.indexOf('>', headWithAttrs);
    if (closeAngle !== -1) {
      const insertPos = closeAngle + 1;
      return (
        processedHtml.substring(0, insertPos) +
        '\n' +
        injection +
        processedHtml.substring(insertPos)
      );
    }
  }

  // No head tag: prepend the sizing patch.
  return injection + processedHtml;
}
