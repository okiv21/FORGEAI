"use client";

import { useState } from "react";
import type { LayoutSpec, Region } from "@/lib/parse";

/**
 * Diagram-style wireframe rendered from the UI/UX agent's JSON layout spec.
 * Shown in the Preview pane before the Frontend agent's real HTML arrives.
 */
export function Wireframe({ spec }: { spec: LayoutSpec }) {
  const [active, setActive] = useState(0);
  const screen = spec.screens[Math.min(active, spec.screens.length - 1)];

  // A sidebar sits beside the following region rather than stacking above it.
  const rows: Region[][] = [];
  for (let i = 0; i < screen.regions.length; i++) {
    const r = screen.regions[i];
    if (r.type === "sidebar" && i + 1 < screen.regions.length) {
      rows.push([r, screen.regions[++i]]);
    } else {
      rows.push([r]);
    }
  }

  return (
    <div className="flex h-full flex-col bg-neutral-950">
      {spec.screens.length > 1 && (
        <div className="flex gap-1 border-b border-white/10 p-2">
          {spec.screens.map((s, i) => (
            <button
              key={s.name + i}
              onClick={() => setActive(i)}
              className={`rounded-md px-2.5 py-1 text-[11px] transition ${
                i === active
                  ? "bg-white/10 text-white"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="mb-3">
          <div className="text-sm font-medium text-white">{screen.name}</div>
          {screen.purpose && (
            <div className="text-xs text-neutral-500">{screen.purpose}</div>
          )}
        </div>

        <div className="flex flex-col gap-2.5">
          {rows.map((row, i) => (
            <div key={i} className="flex gap-2.5">
              {row.map((r, j) => (
                <RegionBox key={j} region={r} grow={r.type !== "sidebar"} />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-white/10 px-4 py-2 text-[11px] text-neutral-500">
        Wireframe from the UI/UX agent · the real UI replaces this when the
        Frontend agent finishes
      </div>
    </div>
  );
}

const TONE: Record<string, string> = {
  nav: "border-indigo-500/40 bg-indigo-500/10",
  hero: "border-fuchsia-500/40 bg-fuchsia-500/10",
  sidebar: "border-amber-500/40 bg-amber-500/10",
  footer: "border-neutral-600/40 bg-white/[0.02]",
  form: "border-emerald-500/40 bg-emerald-500/10",
  table: "border-sky-500/40 bg-sky-500/10",
};

function RegionBox({ region, grow }: { region: Region; grow: boolean }) {
  const tone = TONE[region.type] ?? "border-white/15 bg-white/[0.04]";
  const isGrid = region.type === "grid";
  const minH =
    region.type === "nav" || region.type === "footer"
      ? "min-h-[44px]"
      : region.type === "hero"
      ? "min-h-[92px]"
      : "min-h-[68px]";

  return (
    <div
      className={`${grow ? "flex-1" : "w-40 shrink-0"} ${minH} rounded-lg border border-dashed ${tone} p-2.5`}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="rounded bg-black/40 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-neutral-400">
          {region.type}
        </span>
        <span className="truncate text-xs font-medium text-neutral-200">
          {region.label}
        </span>
      </div>

      {region.items && region.items.length > 0 && (
        <div
          className={
            isGrid
              ? "grid grid-cols-3 gap-1.5"
              : "flex flex-wrap gap-1.5"
          }
        >
          {region.items.slice(0, 9).map((it, i) => (
            <span
              key={i}
              className="truncate rounded border border-white/10 bg-white/[0.04] px-1.5 py-1 text-[10px] text-neutral-400"
            >
              {it}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
