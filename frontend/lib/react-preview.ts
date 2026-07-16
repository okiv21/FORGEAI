/**
 * Turn the Frontend agent's generated React component into files that can boot
 * in a Sandpack (react-ts) sandbox — a REAL running app, not a static render.
 *
 * Generated code is written for Next.js, so we sanitize it best-effort:
 * strip `"use client"`, drop Next.js / path-alias imports that can't resolve in
 * the sandbox, and guarantee a default export named App. If it still fails to
 * compile, the caller falls back to the static HTML mockup.
 */

/** Pull the React component code block out of the agent's markdown. */
export function extractReactComponent(text: string): string | null {
  if (!text) return null;
  const blocks = [
    ...text.matchAll(/```(tsx|jsx|typescript|react|ts|js|javascript)?\s*\n([\s\S]*?)```/gi),
  ];
  let best: string | null = null;
  for (const b of blocks) {
    const lang = (b[1] || "").toLowerCase();
    const code = b[2] || "";
    const looksReact =
      /export\s+default|function\s+[A-Z]\w*\s*\(|const\s+[A-Z]\w*\s*[:=]/.test(code) &&
      /<[A-Za-z]/.test(code) &&
      /return/.test(code);
    if (!looksReact) continue;
    // Prefer explicitly react-flavored fences; otherwise take the last match.
    if (["tsx", "jsx", "react"].includes(lang)) return code.trim();
    best = code.trim();
  }
  return best;
}

function detectComponentName(code: string): string | null {
  const m =
    code.match(/export\s+default\s+function\s+([A-Za-z]\w*)/) ||
    code.match(/function\s+([A-Z]\w*)\s*\(/) ||
    code.match(/const\s+([A-Z]\w*)\s*[:=]/);
  return m ? m[1] : null;
}

function sanitize(code: string): string {
  let out = code
    .replace(/^\s*["']use client["'];?\s*$/gm, "")
    // drop imports that can't resolve in the sandbox (Next.js, path aliases)
    .replace(/^\s*import[^\n]*from\s+["'](next\/[^"']*|@\/[^"']*)["'];?\s*$/gm, "")
    .replace(/^\s*import\s+["'](next\/[^"']*|@\/[^"']*)["'];?\s*$/gm, "");

  // Next <Image>/<Link> become plain elements so the markup still renders.
  out = out.replace(/<Image\b/g, "<img").replace(/<\/Image>/g, "</img>");
  out = out.replace(/<Link\b/g, "<a").replace(/<\/Link>/g, "</a>");

  if (!/export\s+default/.test(out)) {
    const name = detectComponentName(out);
    if (name) out += `\n\nexport default ${name};\n`;
  }
  return out.trim();
}

/**
 * Pull a `tailwind.config = {...}` script out of the agent's HTML mockup, if it
 * defined one. Generated apps sometimes use custom theme classes (bg-charcoal,
 * text-rose-premium, ...) whose colors are declared only in the mockup's config;
 * without carrying that config into the sandbox those classes resolve to nothing
 * and the app renders invisible white-on-white.
 */
function extractTailwindConfig(mockupHtml: string | null): string | null {
  if (!mockupHtml) return null;
  const scripts = [...mockupHtml.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const s of scripts) {
    const body = s[1] ?? "";
    if (/tailwind\.config\s*=/.test(body)) return body.trim();
  }
  return null;
}

export function prepareSandpackFiles(
  code: string,
  mockupHtml: string | null = null
): Record<string, string> {
  const files: Record<string, string> = {
    "/App.tsx": sanitize(code),
  };
  const twConfig = extractTailwindConfig(mockupHtml);
  if (twConfig) {
    // The react-ts template serves /public/index.html; the Tailwind Play CDN
    // (injected via externalResources) picks up `tailwind.config` from the page.
    files["/public/index.html"] = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <script>${twConfig}</script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`;
  }
  return files;
}
