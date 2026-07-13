"use client";

import type { ProjectRow } from "@/lib/projects";
import { useAuth } from "@/lib/auth";

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function HistorySidebar({
  projects,
  activeId,
  onNew,
  onSelect,
  onRename,
  onDelete,
  loading,
}: {
  projects: ProjectRow[];
  activeId: string | null;
  onNew: () => void;
  onSelect: (p: ProjectRow) => void;
  onRename: (p: ProjectRow) => void;
  onDelete: (p: ProjectRow) => void;
  loading: boolean;
}) {
  const { user, signOut } = useAuth();

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-white/10 bg-black/40 md:flex">
      <div className="p-3">
        <button
          onClick={onNew}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-neutral-200 transition hover:border-white/25 hover:text-white"
        >
          <span className="text-base leading-none">+</span> New project
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-2">
        <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-600">
          History
        </div>
        {loading ? (
          <div className="px-2 py-4 text-xs text-neutral-600">Loading…</div>
        ) : projects.length === 0 ? (
          <div className="px-2 py-4 text-xs text-neutral-600">
            No projects yet. Your saved runs appear here.
          </div>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {projects.map((p) => (
              <li key={p.id} className="group flex items-center gap-1">
                <button
                  onClick={() => onSelect(p)}
                  className={`min-w-0 flex-1 rounded-lg px-2.5 py-2 text-left transition ${
                    activeId === p.id
                      ? "bg-white/10"
                      : "hover:bg-white/[0.05]"
                  }`}
                >
                  <div className="truncate text-xs font-medium text-neutral-200">
                    {p.idea}
                  </div>
                  <div className="mt-0.5 text-[10px] text-neutral-600">
                    {timeAgo(p.created_at)}
                  </div>
                </button>
                <button
                  onClick={() => onRename(p)}
                  aria-label={`Rename ${p.idea}`}
                  className="hidden rounded p-1 text-xs text-neutral-500 hover:bg-white/10 hover:text-white group-hover:block"
                >
                  Rename
                </button>
                <button
                  onClick={() => onDelete(p)}
                  aria-label={`Delete ${p.idea}`}
                  className="hidden rounded p-1 text-xs text-neutral-500 hover:bg-red-500/15 hover:text-red-300 group-hover:block"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-white/10 p-3">
        <div className="mb-2 truncate text-[11px] text-neutral-500">
          {user?.email}
        </div>
        <button
          onClick={signOut}
          className="w-full rounded-lg border border-white/10 px-3 py-1.5 text-xs text-neutral-400 transition hover:border-white/20 hover:text-neutral-200"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
