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
