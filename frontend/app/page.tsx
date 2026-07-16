"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentMeta, AgentState, Health } from "@/lib/types";
import { extractHtmlPreview, extractLayoutSpec, injectUserImages } from "@/lib/parse";
import { API_BASE } from "@/lib/api";
import { fileToDownscaledDataUrl } from "@/lib/upload";
import { HealthBar } from "@/components/HealthBar";
import { AgentTimeline } from "@/components/AgentTimeline";
import { StudioPreview } from "@/components/StudioPreview";
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

type Step = "idea" | "clarify" | "forge" | "assets";

type ClarifyQuestion = { id: string; question: string; options: string[] };

const EXAMPLES = [
  "An online store for my handmade ceramics",
  "A booking site for my pottery classes",
  "A tip splitting app for restaurant teams",
];

const STEPS: { id: Step; label: string }[] = [
  { id: "idea", label: "idea" },
  { id: "clarify", label: "clarify" },
  { id: "forge", label: "forge" },
  { id: "assets", label: "assets" },
];

// agent id -> exported artifact name shown on the assets step
const ARTIFACTS: { id: TabId; file: string; owner: string }[] = [
  { id: "pm", file: "prd.md", owner: "Product Manager" },
  { id: "database", file: "schema.sql", owner: "Database Architect" },
  { id: "backend", file: "backend.md", owner: "Backend Engineer" },
  { id: "uiux", file: "uiux.md", owner: "UI/UX Designer" },
  { id: "frontend", file: "frontend.md", owner: "Frontend Engineer" },
  { id: "reviewer", file: "review.md", owner: "Review" },
  { id: "qa", file: "qa-report.md", owner: "QA" },
  { id: "security", file: "security.md", owner: "Security" },
  { id: "remediation", file: "fixes.md", owner: "Fixes" },
  { id: "devops", file: "deploy.md", owner: "DevOps" },
  { id: "docs", file: "README.md", owner: "Docs" },
];

export default function Home() {
  const [step, setStep] = useState<Step>("idea");
  const [idea, setIdea] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [agents, setAgents] = useState<AgentState[]>([]);
  const [running, setRunning] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);

  const [questions, setQuestions] = useState<ClarifyQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [clarifyLoading, setClarifyLoading] = useState(false);

  const [tab, setTab] = useState<TabId>("preview");
  const [autoFollow, setAutoFollow] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  const { user, session, loading: authLoading, configured } = useAuth();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
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

  // Step 01 -> 02: fetch clarifying questions, or go straight to the forge if
  // the backend has none (or is unreachable — never block the run on this).
  async function beginClarify() {
    const prompt = idea.trim();
    if (!prompt || clarifyLoading || running) return;
    setNotice(null);
    setClarifyLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/clarify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: prompt }),
      });
      const data = resp.ok ? await resp.json() : { questions: [] };
      const qs: ClarifyQuestion[] = (data.questions ?? []).filter(
        (q: any) => q?.question && Array.isArray(q?.options) && q.options.length >= 2
      );
      if (qs.length > 0) {
        setQuestions(qs);
        setAnswers({});
        setStep("clarify");
      } else {
        run();
      }
    } catch {
      run();
    } finally {
      setClarifyLoading(false);
    }
  }

  async function run() {
    const prompt = idea.trim();
    if (!prompt || running) return;
    setNotice(null);

    const answerList = questions
      .filter((q) => (answers[q.id] ?? "").trim())
      .map((q) => ({ question: q.question, answer: answers[q.id].trim() }));

    setActiveProjectId(null);
    setRunning(true);
    setAgents([]);
    setAutoFollow(true);
    setTab("pm");
    setStep("forge");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const resp = await fetch(`${API_BASE}/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ idea: prompt, images, answers: answerList }),
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

  async function downloadZip() {
    if (exporting) return;
    setExporting(true);
    setNotice(null);
    try {
      // Swap __USER_IMAGE_n__ slots for the real uploaded photos so the exported
      // code isn't left with broken placeholder image sources.
      const outputs = Object.fromEntries(
        agents.map((a) => [a.meta.id, injectUserImages(a.text, images)])
      );
      const resp = await fetch(`${API_BASE}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea, outputs }),
      });
      if (!resp.ok) throw new Error("Export failed");
      const blob = await resp.blob();
      triggerDownload(blob, `${slug(idea)}.zip`);
    } catch {
      setNotice("Could not build the download. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  function downloadDoc(id: TabId, file: string) {
    const a = agents.find((x) => x.meta.id === id);
    if (!a?.text) return;
    triggerDownload(new Blob([injectUserImages(a.text, images)], { type: "text/markdown" }), file);
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
    setStep("forge");
  }

  function newProject() {
    stop();
    setAgents([]);
    setIdea("");
    setImages([]);
    setQuestions([]);
    setAnswers({});
    setActiveProjectId(null);
    setNotice(null);
    setStep("idea");
  }

  async function handleRenameProject(project: ProjectRow) {
    const name = window.prompt("Rename project", project.idea)?.trim();
    if (!name || name === project.idea) return;
    try {
      await renameProject(project.id, name);
      setProjects((current) => current.map((p) => p.id === project.id ? { ...p, idea: name } : p));
      if (activeProjectId === project.id) setIdea(name);
    } catch {
      setNotice("Could not rename this project.");
    }
  }

  async function handleDeleteProject(project: ProjectRow) {
    if (!window.confirm(`Delete "${project.idea}"? This cannot be undone.`)) return;
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

  const answeredCount = questions.filter((q) => (answers[q.id] ?? "").trim()).length;

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  function canVisit(target: Step): boolean {
    if (target === "idea") return true;
    if (target === "clarify") return questions.length > 0 && !started;
    if (target === "forge") return started;
    if (target === "assets") return done;
    return false;
  }

  return (
    <div className="relative min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-forge-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3">
              <LogoMark />
              <span className="font-display text-sm font-bold tracking-[0.2em] text-forge-bright">
                FORGEAI
              </span>
            </div>
            <nav className="hidden items-center gap-5 font-mono text-[11px] md:flex">
              {STEPS.map((s, i) => {
                const isCurrent = s.id === step;
                const visitable = canVisit(s.id);
                return (
                  <button
                    key={s.id}
                    onClick={() => visitable && setStep(s.id)}
                    disabled={!visitable}
                    className={`tracking-wider transition ${
                      isCurrent
                        ? "text-forge-ice"
                        : i < stepIndex
                        ? "text-forge-steel hover:text-forge-ice"
                        : "text-forge-steel/40"
                    } ${visitable && !isCurrent ? "cursor-pointer" : ""}`}
                  >
                    {String(i + 1).padStart(2, "0")} {s.label}
                  </button>
                );
              })}
            </nav>
          </div>
          <HealthBar health={health} />
        </div>
      </header>

      {configured && authLoading ? (
        <div className="flex min-h-[calc(100vh-53px)] items-center justify-center text-sm text-forge-steel">
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
              <div className="border-b border-forge-amber/20 bg-forge-amber/10 px-6 py-2 text-center text-xs text-forge-amber">
                {notice}
              </div>
            )}

            {step === "idea" && (
              <IdeaStep
                idea={idea}
                setIdea={setIdea}
                images={images}
                onAddFiles={addFiles}
                onRemoveImage={(i) => setImages((p) => p.filter((_, j) => j !== i))}
                onBuild={beginClarify}
                onExample={(ex) => setIdea(ex)}
                busy={clarifyLoading || running}
                busyLabel={clarifyLoading ? "Writing questions…" : "Working…"}
              />
            )}

            {step === "clarify" && (
              <ClarifyStep
                idea={idea}
                questions={questions}
                answers={answers}
                setAnswer={(id, v) => setAnswers((prev) => ({ ...prev, [id]: v }))}
                answered={answeredCount}
                onBack={() => setStep("idea")}
                onForge={run}
                running={running}
              />
            )}

            {step === "forge" && (
              <main className="mx-auto max-w-[1440px] px-6 py-6">
                <div className="grid gap-6 lg:grid-cols-[minmax(0,440px)_1fr]">
                  <div className="flex flex-col gap-4">
                    <div className="rounded-forge border border-line bg-tint p-4">
                      <div className="mb-1.5 flex items-center justify-between">
                        <label className="font-mono text-[11px] uppercase tracking-wider text-forge-steel">
                          Product idea
                        </label>
                        <span className="font-mono text-[11px] tabular-nums text-forge-steel">
                          {agents.filter((a) => a.status === "done").length} / {agents.length || 11} done
                        </span>
                      </div>
                      <textarea
                        value={idea}
                        onChange={(e) => setIdea(e.target.value)}
                        rows={2}
                        disabled={running}
                        className="w-full resize-none rounded-forge border border-line bg-forge-bg/60 p-3 text-sm outline-none transition focus:border-forge-blue disabled:opacity-60"
                      />
                      {images.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {images.map((src, i) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={i} src={src} alt="" className="h-9 w-9 rounded-forge object-cover ring-1 ring-line" />
                          ))}
                        </div>
                      )}
                      <div className="mt-2 flex items-center gap-3">
                        {running ? (
                          <button
                            onClick={stop}
                            className="inline-flex items-center gap-1.5 rounded-forge border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-500/20"
                          >
                            <span className="h-2.5 w-2.5 rounded-[1px] bg-red-400" />
                            Stop
                          </button>
                        ) : (
                          <button
                            onClick={() => beginClarify()}
                            disabled={!idea.trim() || clarifyLoading}
                            className="rounded-forge bg-forge-blue px-4 py-2 text-sm font-semibold text-[#02121f] transition hover:bg-forge-ice disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {clarifyLoading ? "Writing questions…" : done ? "Rebuild" : "Forge"}
                          </button>
                        )}
                        <div className="flex-1">
                          <div className="h-1 overflow-hidden rounded-full bg-white/10">
                            <div
                              className="h-full rounded-full bg-forge-blue transition-all duration-500"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                        <span className="font-mono text-xs tabular-nums text-forge-steel">{progress}%</span>
                      </div>
                    </div>

                    <AgentTimeline
                      agents={agents}
                      selected={tab}
                      onSelect={(id) => selectTab(id as TabId, true)}
                    />

                    {done && !running && (
                      <button
                        onClick={() => setStep("assets")}
                        className="w-full rounded-forge bg-forge-blue px-4 py-3 text-sm font-semibold text-[#02121f] transition hover:bg-forge-ice"
                      >
                        View assets →
                      </button>
                    )}
                  </div>

                  <div className="h-[80vh] lg:sticky lg:top-[72px] lg:h-[calc(100vh-96px)]">
                    <StudioPreview
                      agents={agents}
                      tab={tab}
                      onTab={selectTab}
                      appName={slug(idea)}
                      phase={phase}
                      images={images}
                    />
                  </div>
                </div>
              </main>
            )}

            {step === "assets" && (
              <AssetsStep
                idea={idea}
                agents={agents}
                exporting={exporting}
                onDownloadZip={downloadZip}
                onView={(id) => {
                  setStep("forge");
                  selectTab(id, true);
                }}
                onDownloadDoc={downloadDoc}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function IdeaStep({
  idea,
  setIdea,
  images,
  onAddFiles,
  onRemoveImage,
  onBuild,
  onExample,
  busy,
  busyLabel,
}: {
  idea: string;
  setIdea: (v: string) => void;
  images: string[];
  onAddFiles: (f: FileList | null) => void;
  onRemoveImage: (i: number) => void;
  onBuild: () => void;
  onExample: (ex: string) => void;
  busy: boolean;
  busyLabel: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <section className="relative overflow-hidden">
      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-53px)] max-w-3xl flex-col items-center justify-center px-6 py-16 text-center">
        <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-tight text-forge-bright sm:text-6xl">
          Turn an idea into a shipped product.
        </h1>

        <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-forge-steel">
          Describe what you want to build. Eleven specialist agents write the PRD,
          schema, backend, UI, tests and deploy plan. You download a working starter app.
        </p>

        <div className="mt-9 w-full max-w-2xl rounded-forge border border-line bg-tint p-3">
          <textarea
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onBuild();
            }}
            rows={3}
            placeholder="Describe your app idea. What does it do, and for whom?"
            className="w-full resize-none rounded-forge bg-transparent p-3 text-left text-sm text-forge-bright outline-none placeholder:text-forge-steel/60"
          />

          {images.length > 0 && (
            <div className="flex flex-wrap gap-2 px-1 pb-2">
              {images.map((src, i) => (
                <div key={i} className="group relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="h-14 w-14 rounded-forge object-cover ring-1 ring-line" />
                  <button
                    onClick={() => onRemoveImage(i)}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-forge-bg text-xs text-white ring-1 ring-line transition hover:bg-forge-panel"
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
                className="inline-flex items-center gap-1.5 rounded-forge border border-line px-2.5 py-1.5 text-xs text-forge-steel transition hover:border-forge-blue hover:text-forge-ice disabled:opacity-40"
              >
                + Add product images
              </button>
              <span className="hidden font-mono text-[10px] text-forge-steel/60 sm:inline">
                png or jpg, up to 6
              </span>
            </div>
            <button
              onClick={onBuild}
              disabled={busy || !idea.trim()}
              className="rounded-forge bg-forge-blue px-5 py-2.5 text-sm font-semibold text-[#02121f] transition hover:bg-forge-ice disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? busyLabel : "Build my product"}
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
              className="rounded-forge border border-line bg-tint px-3 py-1.5 text-xs text-forge-steel transition hover:border-forge-blue hover:text-forge-ice"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function ClarifyStep({
  idea,
  questions,
  answers,
  setAnswer,
  answered,
  onBack,
  onForge,
  running,
}: {
  idea: string;
  questions: ClarifyQuestion[];
  answers: Record<string, string>;
  setAnswer: (id: string, v: string) => void;
  answered: number;
  onBack: () => void;
  onForge: () => void;
  running: boolean;
}) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-forge-blue">
        Focusing before the forge
      </p>
      <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-forge-bright sm:text-4xl">
        A few quick questions.
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-forge-steel">
        These shape what the agents build. Tap an option or type your own.
      </p>
      <p className="mt-4 border-l-2 border-forge-blue/40 pl-3 text-sm italic text-forge-steel">
        &ldquo;{idea}&rdquo;
      </p>

      <div className="mt-8 flex flex-col gap-6">
        {questions.map((q, i) => {
          const chosen = answers[q.id] ?? "";
          const isCustom = chosen.trim() !== "" && !q.options.includes(chosen);
          return (
            <div key={q.id} className="rounded-forge border border-line bg-tint p-5">
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-xs text-forge-blue">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="text-[15px] font-semibold text-forge-bright">{q.question}</h3>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {q.options.map((opt) => {
                  const selected = chosen === opt;
                  return (
                    <button
                      key={opt}
                      onClick={() => setAnswer(q.id, selected ? "" : opt)}
                      className={`rounded-forge border px-3 py-1.5 text-sm transition ${
                        selected
                          ? "border-forge-blue bg-tint-strong text-forge-ice"
                          : "border-line bg-tint text-forge-steel hover:border-forge-blue/60 hover:text-forge-ice"
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
              <input
                value={isCustom ? chosen : ""}
                onChange={(e) => setAnswer(q.id, e.target.value)}
                placeholder="Or type your own answer"
                className="mt-3 w-full rounded-forge border border-line bg-forge-bg/60 px-3 py-2 text-sm text-forge-bright outline-none transition placeholder:text-forge-steel/50 focus:border-forge-blue"
              />
            </div>
          );
        })}
      </div>

      <div className="mt-8 flex items-center justify-between">
        <span className="font-mono text-xs text-forge-steel">
          {answered} of {questions.length} answered
        </span>
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="rounded-forge border border-line px-4 py-2.5 text-sm text-forge-steel transition hover:border-forge-blue hover:text-forge-ice"
          >
            Back
          </button>
          <button
            onClick={onForge}
            disabled={running}
            className="rounded-forge bg-forge-blue px-6 py-2.5 text-sm font-semibold text-[#02121f] transition hover:bg-forge-ice disabled:opacity-50"
          >
            Forge it
          </button>
        </div>
      </div>
    </main>
  );
}

function AssetsStep({
  idea,
  agents,
  exporting,
  onDownloadZip,
  onView,
  onDownloadDoc,
}: {
  idea: string;
  agents: AgentState[];
  exporting: boolean;
  onDownloadZip: () => void;
  onView: (id: TabId) => void;
  onDownloadDoc: (id: TabId, file: string) => void;
}) {
  const byId = Object.fromEntries(agents.map((a) => [a.meta.id, a]));
  const docs = ARTIFACTS.filter((d) => byId[d.id]?.text);

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-forge-blue">Assets</p>
      <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-forge-bright sm:text-4xl">
        Your product, forged.
      </h2>

      <div className="mt-8 rounded-forge border border-forge-blue/50 bg-tint-strong p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-wider text-forge-blue">zip</p>
            <p className="truncate font-mono text-sm text-forge-bright">{slug(idea)}.zip</p>
            <p className="mt-1 text-xs text-forge-steel">
              {docs.length} documents · generated code · plain-English hosting guide
            </p>
          </div>
          <button
            onClick={onDownloadZip}
            disabled={exporting}
            className="shrink-0 rounded-forge bg-forge-blue px-5 py-2.5 text-sm font-semibold text-[#02121f] transition hover:bg-forge-ice disabled:opacity-50"
          >
            {exporting ? "Packing…" : "Download zip"}
          </button>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-2">
        {docs.map((d) => {
          const a = byId[d.id];
          const kb = Math.max(1, Math.round((a?.text.length ?? 0) / 1024));
          return (
            <div
              key={d.id}
              className="flex items-center justify-between gap-3 rounded-forge border border-line bg-tint px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-mono text-sm text-forge-bright">{d.file}</p>
                <p className="text-xs text-forge-steel">
                  {d.owner} · {kb} KB
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2 font-mono text-xs">
                <button
                  onClick={() => onView(d.id)}
                  className="rounded-forge border border-line px-3 py-1.5 text-forge-steel transition hover:border-forge-blue hover:text-forge-ice"
                >
                  view
                </button>
                <button
                  onClick={() => onDownloadDoc(d.id, d.file)}
                  className="rounded-forge border border-line px-3 py-1.5 text-forge-steel transition hover:border-forge-blue hover:text-forge-ice"
                >
                  download
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function LogoMark() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/forgeai-mark.svg" alt="FORGEAI" className="h-7 w-7 rounded-forge" />
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
