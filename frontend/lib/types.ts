export type AgentMeta = { id: string; name: string; route: string };
export type Status = "pending" | "running" | "done" | "error" | "stopped";

export type AgentState = {
  meta: AgentMeta;
  status: Status;
  model?: string;
  fellBack?: boolean;
  text: string;
  error?: string;
};

export type Health = {
  ollama_reachable: boolean;
  ollama_models: string[];
  cloud: { moonshot: boolean; deepseek: boolean; openrouter: boolean };
};

export const ROUTE_KIND: Record<string, "local" | "cloud"> = {
  "local-small": "local",
  "local-medium": "local",
  "local-frontend": "local",
  "cloud-frontend": "cloud",
  "cloud-backend": "cloud",
  "cloud-pm": "cloud",
  "cloud-reviewer": "cloud",
};

// Per-agent visual identity (gradient avatar + accent).
export const AGENT_LOOK: Record<
  string,
  { initials: string; from: string; to: string; accent: string }
> = {
  pm: { initials: "PM", from: "#6366f1", to: "#a855f7", accent: "#a78bfa" },
  database: { initials: "DB", from: "#f59e0b", to: "#f97316", accent: "#fbbf24" },
  backend: { initials: "BE", from: "#0ea5e9", to: "#22d3ee", accent: "#38bdf8" },
  uiux: { initials: "UX", from: "#8b5cf6", to: "#d946ef", accent: "#c084fc" },
  frontend: { initials: "FE", from: "#ec4899", to: "#f97316", accent: "#fb7185" },
  art: { initials: "AD", from: "#f43f5e", to: "#f59e0b", accent: "#fb923c" },
  reviewer: { initials: "CR", from: "#10b981", to: "#84cc16", accent: "#34d399" },
  qa: { initials: "QA", from: "#14b8a6", to: "#06b6d4", accent: "#2dd4bf" },
  security: { initials: "SEC", from: "#ef4444", to: "#f43f5e", accent: "#fb7185" },
  devops: { initials: "OPS", from: "#3b82f6", to: "#6366f1", accent: "#60a5fa" },
  docs: { initials: "TW", from: "#64748b", to: "#94a3b8", accent: "#94a3b8" },
};

export function lookFor(id: string) {
  return (
    AGENT_LOOK[id] ?? {
      initials: id.slice(0, 2).toUpperCase(),
      from: "#64748b",
      to: "#94a3b8",
      accent: "#94a3b8",
    }
  );
}
