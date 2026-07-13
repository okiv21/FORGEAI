"use client";

import { useEffect, useRef, useState } from "react";
import type { Concept } from "@/lib/parse";
import { fluxImageUrl } from "@/lib/image";

/**
 * Renders the Art Director's concepts as FLUX images. Inspiration only — these
 * are mood boards / mascots, deliberately NOT part of the buildable UI spec.
 */
export function MoodBoard({ concepts }: { concepts: Concept[] }) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-amber-500/20 bg-amber-500/5 px-5 py-2.5 text-xs text-amber-300/90">
        Inspiration only — mood boards & mascot concepts, generated with FLUX.
        Not a build spec.
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {concepts.map((c, i) => (
            <ConceptCard key={i} concept={c} index={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

const MAX_RETRIES = 3;

function ConceptCard({ concept, index }: { concept: Concept; index: number }) {
  const [seed, setSeed] = useState(index * 101 + 7);
  const [src, setSrc] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "loaded" | "error">(
    "idle"
  );
  const attempts = useRef(0);
  const url = src;

  function load(nextSeed: number) {
    setSeed(nextSeed);
    setStatus("loading");
    setSrc(fluxImageUrl(concept.prompt, { seed: nextSeed, w: 640, h: 640 }));
  }

  // Stagger the initial request per card — Pollinations throttles bursts of
  // concurrent requests from one IP, so firing all cards at once fails some.
  useEffect(() => {
    const t = setTimeout(() => load(seed), index * 1400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleError() {
    if (attempts.current < MAX_RETRIES) {
      attempts.current += 1;
      const n = attempts.current;
      // Backoff + a fresh seed (a throttled seed often keeps failing).
      setTimeout(() => load(seed + 1000 * n), 1200 * n);
    } else {
      setStatus("error");
    }
  }

  function regenerate() {
    attempts.current = 0;
    load(seed + 1);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
      <div className="relative aspect-square bg-neutral-900">
        {status !== "error" && url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={url}
            src={url}
            alt={concept.title}
            className={`h-full w-full object-cover transition-opacity duration-500 ${
              status === "loaded" ? "opacity-100" : "opacity-0"
            }`}
            onLoad={() => setStatus("loaded")}
            onError={handleError}
          />
        )}

        {(status === "loading" || status === "idle") && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <div className="shimmer h-full w-full absolute inset-0" />
            <span className="z-10 flex items-center gap-2 text-xs text-neutral-400">
              <span className="h-1.5 w-1.5 animate-ping rounded-full bg-amber-400" />
              painting with FLUX…
            </span>
          </div>
        )}

        {status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-xs text-neutral-500">
            Couldn&apos;t generate this image.
            <button
              onClick={regenerate}
              className="rounded-md border border-white/15 px-2.5 py-1 text-neutral-300 hover:bg-white/5"
            >
              Retry
            </button>
          </div>
        )}

        <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-300 backdrop-blur">
          {concept.kind}
        </span>

        {status === "loaded" && (
          <button
            onClick={regenerate}
            title="Generate a variation"
            className="absolute right-2 top-2 rounded-md bg-black/60 px-2 py-1 text-[11px] text-neutral-200 backdrop-blur transition hover:bg-black/80"
          >
            ↻ Vary
          </button>
        )}
      </div>

      <div className="p-3">
        <div className="text-sm font-medium text-white">{concept.title}</div>
        <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-neutral-400">
          {concept.prompt}
        </p>
      </div>
    </div>
  );
}
