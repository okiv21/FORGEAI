"use client";

import type { AgentState, Status } from "@/lib/types";
import { ROUTE_KIND, lookFor } from "@/lib/types";

export function AgentTimeline({
  agents,
  selected,
  onSelect,
}: {
  agents: AgentState[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <ol className="flex flex-col gap-2">
      {agents.map((a, i) => (
        <AgentRow
          key={a.meta.id}
          agent={a}
          isLast={i === agents.length - 1}
          active={selected === a.meta.id}
          onClick={() => onSelect(a.meta.id)}
        />
      ))}
    </ol>
  );
}

function AgentRow({
  agent,
  isLast,
  active,
  onClick,
}: {
  agent: AgentState;
  isLast: boolean;
  active: boolean;
  onClick: () => void;
}) {
  const look = lookFor(agent.meta.id);
  const kind = ROUTE_KIND[agent.meta.route] ?? "local";
  const running = agent.status === "running";
  const tail = agent.text.replace(/\s+/g, " ").trim().slice(-150);

  return (
    <li className="relative">
      {!isLast && (
        <span className="absolute left-[22px] top-11 h-[calc(100%-12px)] w-px bg-white/10" />
      )}
      <button
        onClick={onClick}
        className={`flex w-full gap-3 rounded-xl border p-3 text-left transition ${
          active
            ? "border-white/20 bg-white/[0.06]"
            : "border-transparent hover:border-white/10 hover:bg-white/[0.03]"
        }`}
      >
        <Avatar look={look} status={agent.status} running={running} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-white">
              {agent.meta.name}
            </span>
            <Badge kind={kind} fellBack={agent.fellBack} />
          </div>
          <div className="mt-0.5 text-xs text-neutral-500">
            <StatusLine agent={agent} />
          </div>
          {running && tail && (
            <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-neutral-400">
              {tail}
              <span className="ml-0.5 inline-block h-3 w-1 animate-blink bg-neutral-300 align-middle" />
            </p>
          )}
        </div>
      </button>
    </li>
  );
}

function Avatar({
  look,
  status,
  running,
}: {
  look: { initials: string; from: string; to: string };
  status: Status;
  running: boolean;
}) {
  return (
    <div className="relative h-11 w-11 shrink-0">
      {running && (
        <span
          className="absolute inset-0 animate-ping rounded-xl opacity-40"
          style={{ background: look.from }}
        />
      )}
      <div
        className="relative flex h-11 w-11 items-center justify-center rounded-xl text-xs font-bold text-white shadow-lg"
        style={{
          backgroundImage: `linear-gradient(135deg, ${look.from}, ${look.to})`,
          opacity: status === "pending" ? 0.4 : 1,
        }}
      >
        {look.initials}
      </div>
      {status === "done" && (
        <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[9px] text-white ring-2 ring-neutral-950">
          ✓
        </span>
      )}
      {status === "error" && (
        <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] text-white ring-2 ring-neutral-950">
          !
        </span>
      )}
      {status === "stopped" && (
        <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-neutral-600 text-[8px] text-white ring-2 ring-neutral-950">
          ■
        </span>
      )}
    </div>
  );
}

function Badge({
  kind,
  fellBack,
}: {
  kind: "local" | "cloud";
  fellBack?: boolean;
}) {
  return (
    <span className="flex items-center gap-1">
      <span
        className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
          kind === "cloud"
            ? "bg-sky-500/15 text-sky-300"
            : "bg-emerald-500/15 text-emerald-300"
        }`}
      >
        {kind}
      </span>
      {fellBack && (
        <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-300">
          → local
        </span>
      )}
    </span>
  );
}

function StatusLine({ agent }: { agent: AgentState }) {
  if (agent.status === "running")
    return <span className="text-neutral-400">{agent.model ?? "working…"}</span>;
  if (agent.status === "done") return <span>Done</span>;
  if (agent.status === "error")
    return <span className="text-red-400">{agent.error ?? "Error"}</span>;
  if (agent.status === "stopped")
    return <span className="text-neutral-500">Stopped</span>;
  return <span>Queued</span>;
}
