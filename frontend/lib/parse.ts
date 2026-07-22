/**
 * Extract the self-contained HTML mockup the Frontend agent emits inside a
 * ```html fenced block. Works on PARTIAL text while the block is still
 * streaming (no closing fence yet) so the preview can assemble live.
 */
export function extractHtmlPreview(text: string): string | null {
  if (!text) return null;
  const open = text.match(/```html\s*\n/i);
  if (!open || open.index === undefined) return null;
  const after = text.slice(open.index + open[0].length);
  const close = after.indexOf("```");
  const body = (close === -1 ? after : after.slice(0, close)).trim();
  return body.length > 0 ? body : null;
}

export type Region = { type: string; label: string; items?: string[] };
export type Screen = { name: string; purpose?: string; regions: Region[] };
export type LayoutSpec = { screens: Screen[] };

/**
 * Extract the UI/UX agent's structured layout spec from its ```json block.
 *
 * Returns null while the block is still streaming (incomplete JSON) or if the
 * model emitted something that doesn't match the expected shape — the caller
 * simply keeps showing the skeleton until a valid spec arrives.
 */
export function extractLayoutSpec(text: string): LayoutSpec | null {
  if (!text) return null;
  const open = text.match(/```json\s*\n/i);
  if (!open || open.index === undefined) return null;
  const after = text.slice(open.index + open[0].length);
  const close = after.indexOf("```");
  if (close === -1) return null; // still streaming; don't parse partial JSON
  try {
    const parsed = JSON.parse(after.slice(0, close).trim());
    if (!parsed || !Array.isArray(parsed.screens)) return null;
    const screens: Screen[] = parsed.screens
      .filter((s: any) => s && Array.isArray(s.regions))
      .map((s: any) => ({
        name: String(s.name ?? "Screen"),
        purpose: s.purpose ? String(s.purpose) : undefined,
        regions: s.regions
          .filter((r: any) => r && r.type)
          .map((r: any) => ({
            type: String(r.type).toLowerCase(),
            label: String(r.label ?? r.type),
            items: Array.isArray(r.items) ? r.items.map(String) : [],
          })),
      }));
    return screens.length ? { screens } : null;
  } catch {
    return null;
  }
}

export type Concept = { title: string; kind: string; prompt: string };

const CONCEPT_KINDS = new Set([
  "mascot",
  "moodboard",
  "hero",
  "palette",
  "iconset",
]);

/**
 * Extract the Art Director's mood-board concepts from its ```json block.
 * Accepts either a bare array or an object with a `concepts`/`items` array.
 * Returns null until the block is complete and at least one valid concept parses.
 */
export function extractMoodboard(text: string): Concept[] | null {
  if (!text) return null;
  const open = text.match(/```json\s*\n/i);
  if (!open || open.index === undefined) return null;
  const after = text.slice(open.index + open[0].length);
  const close = after.indexOf("```");
  if (close === -1) return null; // still streaming
  try {
    const parsed = JSON.parse(after.slice(0, close).trim());
    const arr: any[] = Array.isArray(parsed)
      ? parsed
      : parsed?.concepts ?? parsed?.items ?? [];
    const concepts: Concept[] = arr
      .filter((c) => c && typeof c.prompt === "string" && c.prompt.trim())
      .map((c) => {
        const kind = String(c.kind ?? "moodboard").toLowerCase();
        return {
          title: String(c.title ?? "Concept"),
          kind: CONCEPT_KINDS.has(kind) ? kind : "moodboard",
          prompt: String(c.prompt).trim(),
        };
      });
    return concepts.length ? concepts.slice(0, 6) : null;
  } catch {
    return null;
  }
}

// A neutral placeholder for any image slot the agent referenced but the user
// didn't upload (or a loaded-from-history run where the originals are gone).
const IMAGE_FALLBACK =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">' +
      '<rect width="100%" height="100%" fill="#e5e7eb"/>' +
      '<text x="50%" y="50%" fill="#9ca3af" font-family="sans-serif" ' +
      'font-size="16" text-anchor="middle" dominant-baseline="middle">image</text>' +
      "</svg>"
  );

/**
 * Replace the `__USER_IMAGE_n__` slots the design agents emit with the user's
 * actual uploaded image data-URLs, so their real product photos appear in the
 * generated mockup/app. Any slot without a matching upload gets a neutral
 * placeholder instead of a broken image.
 */
export function injectUserImages(code: string, images: string[]): string {
  if (!code) return code;
  return code.replace(
    /__USER_IMAGE_(\d+)__/g,
    (_, n) => images[Number(n)] ?? IMAGE_FALLBACK
  );
}

/**
 * Replace `__IMG[intent|arg]__` slots with URLs resolved by the backend image
 * resolver. Unresolved slots fall back to the neutral placeholder so the preview
 * never shows a broken image while generation is pending or skipped.
 */
export function applyResolvedImages(
  code: string,
  resolved: Record<string, string>
): string {
  if (!code) return code;
  return code.replace(/__IMG\[(?:stock|avatar|custom)\|[^\]]*\]__/g, (slot) =>
    resolved[slot] ?? IMAGE_FALLBACK
  );
}

/** Wrap a fragment (or full doc) into a complete, Tailwind-enabled document. */
export function wrapPreview(html: string): string {
  const isFullDoc = /<html[\s>]/i.test(html);
  const tailwind = '<script src="https://cdn.tailwindcss.com"></script>';
  if (isFullDoc) {
    return /cdn\.tailwindcss\.com/.test(html)
      ? html
      : html.replace(/<head[^>]*>/i, (m) => `${m}${tailwind}`);
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${tailwind}
<style>body{margin:0}</style></head>
<body class="bg-white text-neutral-900">${html}</body></html>`;
}
