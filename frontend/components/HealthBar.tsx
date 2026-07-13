"use client";

import type { Health } from "@/lib/types";

export function HealthBar({ health }: { health: Health | null }) {
  if (!health) {
    return (
      <span className="text-xs text-neutral-500">Connecting to backend…</span>
    );
  }
  const cloud = Object.entries(health.cloud)
    .filter(([, v]) => v)
    .map(([k]) => k);

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${
          health.ollama_reachable
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
            : "border-red-500/30 bg-red-500/10 text-red-300"
        }`}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            health.ollama_reachable ? "bg-emerald-400" : "bg-red-400"
          }`}
        />
        Ollama {health.ollama_reachable ? "online" : "offline"}
      </span>
      <span
        className={`rounded-full border px-2.5 py-1 ${
          cloud.length
            ? "border-sky-500/30 bg-sky-500/10 text-sky-300"
            : "border-white/10 bg-white/5 text-neutral-400"
        }`}
      >
        {cloud.length ? `cloud: ${cloud.join(", ")}` : "local-only"}
      </span>
    </div>
  );
}
