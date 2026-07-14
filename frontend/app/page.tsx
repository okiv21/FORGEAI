"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentMeta, AgentState, Health } from "@/lib/types";
import { extractHtmlPreview, extractLayoutSpec } from "@/lib/parse";
import { API_BASE } from "@/lib/api";
import { fileToDownscaledDataUrl } from "@/lib/upload";
import { HealthBar } from "@/components/HealthBar";
import { AgentTimeline } from "@/components/AgentTimeline";
import { StudioPreview } from "@/components/StudioPreview";
import { ThreeBackground } from "@/components/ThreeBackground";
import { AuthScreen } from "@/components/AuthScreen";
import { HistorySidebar } from "@/components/HistorySidebar";
import { useAuth } from "@/lib/auth";
import { deleteProject, listProjects, renameProject, type ProjectRow } from "@/lib/projects";

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
  | "remediation"
  | "devops"
  | "docs";

const EXAMPLES = [
  "An online store for premium natural hair care products",
  "A tool that turns meeting recordings into action items",
  "A marketplace for renting camera gear between creators",
];

export default function Home() {
  const [idea, setIdea] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [agents, setAgents] = useState<AgentState[]>([]);
  const [running, setRunning] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);

  const [tab, setTab] = useState<TabId>("preview");
  const [autoFollow, setAutoFollow] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  const { user, session, loading: authLoading, configured } = useAuth();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const agentMetas = useRef<AgentMeta[]>([]);

  useEffect(() => {
    fetch(`${API_BASE}/health`)
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth(null));
    fetch(`${API_BASE}/agents`)
      .then((r) => r.json())
      .then((d) => (agentMetas.current = d.agents ?? []))
      .catch(() => {});
  }, []);

  async function refreshProjects() {
    if (!user) return;
    setProjectsLoading(true);
    try {
      setProjects(await listProjects());
    } catch {
      /* RLS or offline — leave list as-is */
    } finally {
      setProjectsLoading(false);
    }
  }

  useEffect(() => {
    if (user) refreshProjects();
    else setProjects([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const started = agents.length > 0;
  const done = started && agents.every((a) => a.status === "done" || a.status === "error");
  const active = agents.find((a) => a.status === "running");
  const activeId = active?.meta.id;

  const previewReady = useMemo(() => {
    const fe = agents.find((a) => a.meta.id === "frontend");
    if (fe && extractHtmlPreview(fe.text)) return true;
    const ux = agents.find((a) => a.meta.id === "uiux");
    return ux ? !!extractLayoutSpec(ux.text) : false;
  }, [agents]);

  // Auto-follow: track the running agent, then jump to Preview once ready.
  // Depends on primitive activeId (not `active`) + guards the set — no render loop.
  useEffect(() => {
    if (!autoFollow) return;
    const target: TabId | undefined = previewReady
      ? "preview"
      : (activeId as TabId | undefined);
    if (target) setTab((prev) => (prev === target ? prev : target));
  }, [autoFollow, activeId, previewReady]);

  const phase = active
    ? `${active.meta.name} is working…`
    : done
    ? "Build complete"
    : "Warming up…";

  function patch(id: string, fn: (a: AgentState) => AgentState) {
    setAgents((prev) => prev.map((a) => (a.meta.id === id ? fn(a) : a)));
  }

  function selectTab(t: TabId, pinned: boolean) {
    setTab(t);
    if (pinned) setAutoFollow(false);
  }

  async function addFiles(files: FileList | null) {
    if (!files) return;
    const room = 6 - images.length;
    const picked = Array.from(files).slice(0, Math.max(0, room));
    const urls = await Promise.all(
      picked.map((f) => fileToDownscaledDataUrl(f).catch(() => null))
    );
    setImages((prev) => [...prev, ...urls.filter(Boolean) as string[]].slice(0, 6));
  }

  function stop() {
    abortRef.current?.abort();
  }

  async function run(seed?: string) {
    const prompt = (seed ?? idea).trim();
    if (!prompt || running) return;
    if (seed) setIdea(seed);
    setNotice(null);

    setActiveProjectId(null);
    setRunning(true);
    setAgents([]);
    setAutoFollow(true);
    setTab("pm");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const resp = await fetch(`${API_BASE}/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ idea: prompt, images }),
        signal: controller.signal,
      });
      if (!resp.ok) {
        const payload = await resp.json().catch(() => null);
        throw new Error(payload?.detail ?? "Could not start the product generation.");
      }
      if (!resp.body) return setRunning(false);

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;
        buf += decoder.decode(value, { stream: true });
        const frames = buf.split("\n\n");
        buf = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.split("\n").find((l) => l.startsWith("data:"));
          if (line) handleEvent(JSON.parse(line.slice(5).trim()));
        }
      }
    } catch (err: any) {
      if (err?.name === "AbortError") {
        // Aborting the fetch disconnects the SSE stream, which cancels the
        // backend generator. Mark the in-flight agent as stopped.
        setAgents((prev) =>
          prev.map((a) =>
            a.status === "running" ? { ...a, status: "stopped" } : a
          )
        );
      } else {
        setNotice(err instanceof Error ? err.message : "Could not start the product generation.");
      }
    } finally {
      abortRef.current = null;
      setRunning(false);
    }
  }

  function handleEvent(ev: any) {
    switch (ev.type) {
      case "run_start":
        setAgents(
          (ev.agents as AgentMeta[]).map((m) => ({
            meta: m,
            status: "pending",
            text: "",
          }))
        );
        break;
      case "agent_start":
        patch(ev.id, (a) => ({ ...a, status: "running", model: ev.model, fellBack: ev.fell_back }));
        break;
      case "agent_switch":
        patch(ev.id, (a) => ({ ...a, model: ev.model, fellBack: !!ev.fell_back, text: "" }));
        break;
      case "token":
        patch(ev.id, (a) => ({ ...a, text: a.text + ev.text }));
        break;
      case "agent_done":
        patch(ev.id, (a) => ({ ...a, status: "done", text: ev.text }));
        break;
      case "agent_error":
        patch(ev.id, (a) => ({ ...a, status: "error", error: ev.error }));
        break;
      case "run_done":
        break;
      case "run_saved":
        setActiveProjectId(ev.project_id);
        refreshProjects();
        break;
      case "persistence_error":
        setNotice("Your build completed, but it could not be saved to history.");
        break;
    }
  }

  function loadProject(p: ProjectRow) {
    stop();
    const metas =
      agentMetas.current.length > 0
        ? agentMetas.current
        : Object.keys(p.code_refs).map((id) => ({ id, name: id, route: "cloud" }));
    setAgents(
      metas
        .filter((m) => p.code_refs[m.id] !== undefined)
        .map((m) => ({
          meta: m,
          status: "done" as const,
          text: p.code_refs[m.id] ?? "",
        }))
    );
    setIdea(p.idea);
    setActiveProjectId(p.id);
    setAutoFollow(false);
    setTab("preview");
    setNotice(null);
  }

  function newProject() {
    stop();
    setAgents([]);
    setIdea("");
    setImages([]);
    setActiveProjectId(null);
    setNotice(null);
  }

  async function handleRenameProject(project: ProjectRow) {
    const idea = window.prompt("Rename project", project.idea)?.trim();
    if (!idea || idea === project.idea) return;
    try {
      await renameProject(project.id, idea);
      setProjects((current) => current.map((p) => p.id === project.id ? { ...p, idea } : p));
      if (activeProjectId === project.id) setIdea(idea);
    } catch {
      setNotice("Could not rename this project.");
    }
  }

  async function handleDeleteProject(project: ProjectRow) {
    if (!window.confirm(`Delete \"${project.idea}\"? This cannot be undone.`)) return;
    try {
      await deleteProject(project.id);
      setProjects((current) => current.filter((p) => p.id !== project.id));
      if (activeProjectId === project.id) newProject();
    } catch {
      setNotice("Could not delete this project.");
    }
  }

  const progress = started
    ? Math.round((agents.filter((a) => a.status === "done").length / agents.length) * 100)
    : 0;

  return (
    <div className="relative min-h-screen">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-black/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-3">
            <LogoMark />
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-tight">FORGEAI</div>
              <div className="text-[11px] text-neutral-500">idea in · product forged</div>
            </div>
          </div>
          <HealthBar health={health} />
        </div>
      </header>

      {configured && authLoading ? (
        <div className="flex min-h-[calc(100vh-57px)] items-center justify-center text-sm text-neutral-500">
          Loading…
        </div>
      ) : configured && !user ? (
        <AuthScreen />
      ) : (
        <div className="flex">
          {configured && user && (
            <HistorySidebar
              projects={projects}
              activeId={activeProjectId}
              onNew={newProject}
              onSelect={loadProject}
              onRename={handleRenameProject}
              onDelete={handleDeleteProject}
              loading={projectsLoading}
            />
          )}
          <div className="min-w-0 flex-1">
            {notice && (
              <div className="border-b border-amber-500/20 bg-amber-500/10 px-6 py-2 text-center text-xs text-amber-300">
                {notice}
              </div>
            )}
            {!started ? (
              <Hero
                idea={idea}
                setIdea={setIdea}
                images={images}
                onAddFiles={addFiles}
                onRemoveImage={(i) => setImages((p) => p.filter((_, j) => j !== i))}
                onRun={() => run()}
                onExample={(ex) => setIdea(ex)}
                running={running}
              />
            ) : (
              <main className="mx-auto max-w-[1440px] px-6 py-6">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,440px)_1fr]">
            <div className="flex flex-col gap-4">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <label className="mb-1.5 block text-xs font-medium text-neutral-400">
                  Product idea
                </label>
                <textarea
                  value={idea}
                  onChange={(e) => setIdea(e.target.value)}
                  rows={2}
                  disabled={running}
                  className="w-full resize-none rounded-lg border border-white/10 bg-black/40 p-3 text-sm outline-none transition focus:border-white/30 disabled:opacity-60"
                />
                {images.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {images.map((src, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={src} alt="" className="h-9 w-9 rounded object-cover ring-1 ring-white/15" />
                    ))}
                  </div>
                )}
                <div className="mt-2 flex items-center gap-3">
                  {running ? (
                    <button
                      onClick={stop}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-500/20"
                    >
                      <span className="h-2.5 w-2.5 rounded-[2px] bg-red-400" />
                      Stop
                    </button>
                  ) : (
                    <button
                      onClick={() => run()}
                      disabled={!idea.trim()}
                      className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {done ? "Rebuild" : "Build"}
                    </button>
                  )}
                  <div className="flex-1">
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-violet-400 via-sky-300 to-rose-300 transition-all duration-500"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-xs tabular-nums text-neutral-500">{progress}%</span>
                </div>
              </div>

              <AgentTimeline
                agents={agents}
                selected={tab}
                onSelect={(id) => selectTab(id as TabId, true)}
              />
            </div>

            <div className="h-[80vh] lg:sticky lg:top-[76px] lg:h-[calc(100vh-100px)]">
              <StudioPreview
                agents={agents}
                tab={tab}
                onTab={selectTab}
                appName={slug(idea)}
                phase={phase}
              />
            </div>
          </div>
        </main>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Hero({
  idea,
  setIdea,
  images,
  onAddFiles,
  onRemoveImage,
  onRun,
  onExample,
  running,
}: {
  idea: string;
  setIdea: (v: string) => void;
  images: string[];
  onAddFiles: (f: FileList | null) => void;
  onRemoveImage: (i: number) => void;
  onRun: () => void;
  onExample: (ex: string) => void;
  running: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <section className="relative overflow-hidden">
      {/* eclipse */}
      <div className="pointer-events-none absolute inset-0">
        <ThreeBackground />
        <div className="absolute right-[8%] top-1/2 h-[520px] w-[520px] -translate-y-1/2 rounded-full bg-violet-500/10 blur-[140px]" />
      </div>
      {/* giant chromatic ghost word */}
      <div className="pointer-events-none absolute inset-x-0 top-[38%] select-none text-center">
        <span className="chromatic-ghost text-[22vw] font-black leading-none">STUDIO</span>
      </div>

      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-57px)] max-w-3xl flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-neutral-300 backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          A team of 11 AI agents, working in sequence
        </div>

        <h1 className="text-5xl font-semibold leading-[1.02] tracking-tight sm:text-7xl">
          Turn an idea into a
          <br />
          <span className="spectral-text">shipped product.</span>
        </h1>

        <p className="mx-auto mt-5 max-w-lg text-[15px] leading-relaxed text-neutral-400">
          Describe your app — and, if you have them, drop in product photos or a
          concept. Eleven specialist agents produce the PRD, schema, backend, a
          taste-driven UI, tests, security, applied fixes, and deploy plan,
          assembled live.
        </p>

        {/* input panel */}
        <div className="mt-8 w-full max-w-2xl rounded-2xl border border-white/10 bg-white/[0.04] p-3 shadow-2xl shadow-black/60 backdrop-blur-xl">
          <textarea
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onRun();
            }}
            rows={3}
            placeholder="e.g. An online store for premium natural hair care products…"
            className="w-full resize-none rounded-xl bg-transparent p-3 text-left text-sm outline-none placeholder:text-neutral-600"
          />

          {images.length > 0 && (
            <div className="flex flex-wrap gap-2 px-1 pb-2">
              {images.map((src, i) => (
                <div key={i} className="group relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="h-14 w-14 rounded-lg object-cover ring-1 ring-white/15" />
                  <button
                    onClick={() => onRemoveImage(i)}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black text-xs text-white ring-1 ring-white/20 transition hover:bg-neutral-800"
                    aria-label="Remove image"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 px-1">
            <div className="flex items-center gap-3">
              <button
                onClick={() => fileRef.current?.click()}
                disabled={images.length >= 6}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-neutral-300 transition hover:border-white/25 hover:text-white disabled:opacity-40"
              >
                <PaperclipIcon />
                {images.length ? `${images.length}/6 images` : "Add product images"}
              </button>
              <span className="hidden text-[11px] text-neutral-600 sm:inline">⌘/Ctrl + Enter</span>
            </div>
            <button
              onClick={onRun}
              disabled={running || !idea.trim()}
              className="rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Build my product
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              onAddFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => onExample(ex)}
              className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-neutral-400 backdrop-blur transition hover:border-white/25 hover:text-neutral-100"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function LogoMark() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/forgeai-mark.svg" alt="FORGEAI" className="h-8 w-8 rounded-lg" />
  );
}

function PaperclipIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.44 11.05l-9.19 9.19a5 5 0 0 1-7.07-7.07l9.19-9.19a3 3 0 0 1 4.24 4.24l-9.2 9.19a1 1 0 0 1-1.41-1.41l8.49-8.49" />
    </svg>
  );
}

function slug(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .split("-")
      .slice(0, 3)
      .join("-") || "your-product"
  );
}
