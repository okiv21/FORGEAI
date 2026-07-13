"use client";

import { useMemo } from "react";
import { wrapPreview } from "@/lib/parse";
import { useDebounced } from "@/lib/hooks";

/**
 * Renders the streamed HTML mockup inside a sandboxed iframe. The iframe has
 * `allow-scripts` only (no same-origin), so the Tailwind CDN runs but the
 * document is fully isolated from the app.
 */
export function LivePreview({ html }: { html: string }) {
  const stable = useDebounced(html, 250);
  const srcDoc = useMemo(() => wrapPreview(stable), [stable]);
  return (
    <iframe
      title="Live product preview"
      sandbox="allow-scripts"
      srcDoc={srcDoc}
      className="h-full w-full border-0 bg-white"
    />
  );
}
