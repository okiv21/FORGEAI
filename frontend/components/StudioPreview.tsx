"use client";

import { useMemo, useState } from "react";
import type { AgentState } from "@/lib/types";
import { extractHtmlPreview, extractLayoutSpec } from "@/lib/parse";
import { extractReactComponent } from "@/lib/react-preview";
import { Wireframe } from "./Wireframe";
import { LiveDevicePreview } from "./LiveDevicePreview";
import { Markdown } from "./Markdown";

type TabId =
  | "preview"
  | "pm"
  | "database"
  | "backend"
  | "uiux"
  | "frontend"
  | "reviewer"
  | "qa"
  | "security"
  | "devops"
  | "docs";

const TABS: { id: TabId; label: string }[] = [
  { id: "preview", label: "Preview" },
  { id: "pm", label: "PRD" },
  { id: "database", label: "Schema" },
  { id: "backend", label: "Backend" },
  { id: "uiux", label: "UI/UX" },
  { id: "frontend", label: "Frontend" },
  { id: "reviewer", label: "Review" },
  { id: "qa", label: "QA" },
  { id: "security", label: "Security" },
  { id: "devops", label: "DevOps" },
  { id: "docs", label: "Docs" },
];

export function StudioPreview({
  agents,
  tab,
  onTab,
  appName,
  phase,
}: {
  agents: AgentState[];
  tab: TabId;
  onTab: (t: TabId, pinned: boolean) => void;
  appName: string;
  phase: string;
}) {
  const byId = useMemo(
    () => Object.fromEntries(agents.map((a) => [a.meta.id, a])),
    [agents]
  );
  const frontendText = byId["frontend"]?.text ?? "";
  const uiuxText = byId["uiux"]?.text ?? "";
  const html = useMemo(() => extractHtmlPreview(frontendText), [frontendText]);
  const reactCode = useMemo(() => extractReactComponent(frontendText), [frontendText]);
  const spec = useMemo(() => extractLayoutSpec(uiuxText), [uiuxText]);
  const [copied, setCopied] = useState(false);

  const docAgent = tab !== "preview" ? byId[tab] : undefined;

  async function copy() {
    const preview = html ?? (spec ? JSON.stringify(spec, null, 2) : "");
    const src = tab === "preview" ? preview : docAgent?.text ?? "";
    if (!src) return;
    await navigator.clipboard.writeText(src);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur">
      {/* tab bar */}
      <div className="flex items-center gap-1 border-b border-white/10 p-2">
        <div className="flex flex-1 flex-wrap gap-1">
          {TABS.map((t) => {
            const a = t.id !== "preview" ? byId[t.id] : undefined;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => onTab(t.id, true)}
                className={`relative rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  active
                    ? "bg-white/10 text-white"
                    : "text-neutral-400 hover:bg-white/5 hover:text-neutral-200"
                }`}
              >
                {t.label}
                {a?.status === "running" && (
                  <span className="ml-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400 align-middle" />
                )}
                {a?.status === "done" && (
                  <span className="ml-1.5 align-middle text-emerald-400">✓</span>
                )}
              </button>
            );
          })}
        </div>
        <button
          onClick={copy}
          className="rounded-lg px-2.5 py-1.5 text-xs text-neutral-400 transition hover:bg-white/5 hover:text-neutral-200"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {/* body */}
      <div className="min-h-0 flex-1">
        {tab === "preview" ? (
          // Stages: skeleton -> wireframe (UI/UX JSON) -> live device preview
          // (Frontend agent's real React app, or its static HTML mockup).
          reactCode || html ? (
            <LiveDevicePreview
              reactCode={reactCode}
              html={html}
              appName={appName}
            />
          ) : spec ? (
            <BrowserFrame appName={appName}>
              <Wireframe spec={spec} />
            </BrowserFrame>
          ) : (
            <BrowserFrame appName={appName}>
              <AssemblySkeleton phase={phase} />
            </BrowserFrame>
          )
        ) : (
          <div className="h-full overflow-auto p-5">
            {docAgent?.text ? (
              <Markdown>{docAgent.text}</Markdown>
            ) : (
              <EmptyDoc status={docAgent?.status ?? "pending"} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function BrowserFrame({
  appName,
  children,
}: {
  appName: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col p-3">
      <div className="flex h-full flex-col overflow-hidden rounded-xl border border-white/10 shadow-2xl shadow-black/40">
        <div className="flex items-center gap-2 border-b border-white/10 bg-neutral-900/80 px-3 py-2">
          <span className="h-3 w-3 rounded-full bg-red-400/80" />
          <span className="h-3 w-3 rounded-full bg-amber-400/80" />
          <span className="h-3 w-3 rounded-full bg-emerald-400/80" />
          <div className="mx-auto flex max-w-[70%] items-center gap-1.5 truncate rounded-md bg-black/40 px-3 py-1 text-[11px] text-neutral-400">
            <LockIcon />
            <span className="truncate">{appName || "your-product"}.app</span>
          </div>
        </div>
        <div className="min-h-0 flex-1 bg-white">{children}</div>
      </div>
    </div>
  );
}

function AssemblySkeleton({ phase }: { phase: string }) {
  return (
    <div className="flex h-full flex-col bg-neutral-950">
      {/* top nav */}
      <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
        <div className="shimmer h-5 w-28 rounded-md" />
        <div className="flex gap-2">
          <div className="shimmer h-4 w-14 rounded" />
          <div className="shimmer h-4 w-14 rounded" />
          <div className="shimmer h-8 w-20 rounded-lg" />
        </div>
      </div>
      {/* hero */}
      <div className="space-y-3 px-5 py-6">
        <div className="shimmer h-8 w-3/5 rounded-md" />
        <div className="shimmer h-4 w-2/5 rounded" />
        <div className="shimmer h-9 w-32 rounded-lg" />
      </div>
      {/* cards */}
      <div className="grid grid-cols-3 gap-3 px-5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="space-y-2 rounded-xl border border-white/5 p-3"
          >
            <div className="shimmer h-16 w-full rounded-lg" />
            <div className="shimmer h-3 w-3/4 rounded" />
            <div className="shimmer h-3 w-1/2 rounded" />
          </div>
        ))}
      </div>
      <div className="mt-auto flex items-center justify-center gap-2 p-5 text-xs text-neutral-500">
        <span className="h-1.5 w-1.5 animate-ping rounded-full bg-sky-300" />
        {phase}
      </div>
    </div>
  );
}

function EmptyDoc({ status }: { status: string }) {
  const label =
    status === "running"
      ? "Generating…"
      : status === "error"
      ? "This agent hit an error."
      : "Waiting for earlier agents to finish.";
  return (
    <div className="flex h-full min-h-[300px] items-center justify-center text-sm text-neutral-500">
      {label}
    </div>
  );
}

function LockIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="shrink-0">
      <rect x="4" y="10" width="16" height="10" rx="2" fill="currentColor" opacity="0.7" />
      <path d="M8 10V7a4 4 0 018 0v3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
