import { jsonrepair } from 'jsonrepair';

const WIDGET_CONFIG_SCRIPT_PATTERN =
  /<script\b(?=[^>]*\btype\s*=\s*["']application\/json["'])(?=[^>]*\bid\s*=\s*["']widget-config["'])[^>]*>([\s\S]*?)<\/script>/gi;

const WIDGET_CONFIG_SCRIPT_SINGLE_PATTERN =
  /<script\b(?=[^>]*\btype\s*=\s*["']application\/json["'])(?=[^>]*\bid\s*=\s*["']widget-config["'])[^>]*>([\s\S]*?)<\/script>/i;

export function removeTailwindBrowserRuntime(html: string): string {
  let processed = html.replace(
    /<script\b[^>]*\bsrc\s*=\s*["']https?:\/\/cdn\.tailwindcss\.com(?:[/?][^"']*)?["'][^>]*>\s*<\/script>/gi,
    '',
  );

  processed = processed.replace(
    /<style\b[^>]*\btype\s*=\s*["']text\/tailwindcss["'][^>]*>[\s\S]*?<\/style>/gi,
    '',
  );

  return processed.replace(
    /<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi,
    (scriptTag, scriptBody: string) => {
      const trimmed = scriptBody.trim();
      if (/^(?:window\.)?tailwind\s*\.\s*config\s*=/.test(trimmed)) return '';
      return scriptTag;
    },
  );
}

export function extractWidgetConfigFromHtml(html: string): unknown | undefined {
  const match = html.match(WIDGET_CONFIG_SCRIPT_SINGLE_PATTERN);
  if (!match) return undefined;
  return parseWidgetConfigJson(match[1]);
}

export function normalizeWidgetConfigScript(html: string): string {
  return html.replace(WIDGET_CONFIG_SCRIPT_PATTERN, (scriptTag: string, rawConfig: string) => {
    const config = parseWidgetConfigJson(rawConfig);
    if (config === undefined) return scriptTag;

    const openTag =
      scriptTag.match(/^<script\b[^>]*>/i)?.[0] ??
      '<script type="application/json" id="widget-config">';

    return `${openTag}\n${stringifyJsonForScript(config)}\n</script>`;
  });
}

function parseWidgetConfigJson(rawConfig: string): unknown | undefined {
  const trimmed = rawConfig
    .trim()
    .replace(/^<!--\s*/, '')
    .replace(/\s*-->\s*$/, '')
    .trim();

  if (!trimmed) return undefined;

  const candidates = Array.from(new Set([trimmed, escapeInvalidJsonStringBackslashes(trimmed)]));

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      continue;
    }
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(jsonrepair(candidate));
    } catch {
      continue;
    }
  }

  return undefined;
}

function escapeInvalidJsonStringBackslashes(json: string): string {
  return json.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, (_match, content: string) => {
    const fixedContent = content.replace(/\\([a-zA-Z])/g, (_slash, char: string) => {
      if ('bfnrtu'.includes(char)) return `\\${char}`;
      return `\\\\${char}`;
    });
    return `"${fixedContent}"`;
  });
}

function stringifyJsonForScript(value: unknown): string {
  const json = JSON.stringify(value, null, 2) as string;
  return json
    .replace(/<\//g, '<\\/')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
