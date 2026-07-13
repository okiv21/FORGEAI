"use client";

import { useMemo, useState } from "react";
import { SandpackProvider, SandpackPreview } from "@codesandbox/sandpack-react";
import { prepareSandpackFiles } from "@/lib/react-preview";
import { wrapPreview } from "@/lib/parse";

type Device = "phone" | "desktop";

/**
 * Boots the generated frontend as a REAL running app (Sandpack react-ts) inside
 * a phone or desktop frame, with a live toggle. Falls back to the static HTML
 * mockup when there's no runnable React code (or if the user switches to it).
 */
export function LiveDevicePreview({
  reactCode,
  html,
  appName,
}: {
  reactCode: string | null;
  html: string | null;
  appName: string;
}) {
  const [device, setDevice] = useState<Device>("desktop");
  const canLive = !!reactCode;
  const [mode, setMode] = useState<"live" | "static">(canLive ? "live" : "static");
  const effectiveMode = canLive ? mode : "static";

  return (
    <div className="flex h-full flex-col">
      {/* controls */}
      <div className="flex items-center justify-between gap-2 border-b border-white/10 p-2">
        <Segmented
          options={[
            { id: "desktop", label: "Desktop" },
            { id: "phone", label: "iPhone" },
          ]}
          value={device}
          onChange={(v) => setDevice(v as Device)}
        />
        <div className="flex items-center gap-2">
          {canLive && (
            <Segmented
              options={[
                { id: "live", label: "● Live" },
                { id: "static", label: "Static" },
              ]}
              value={mode}
              onChange={(v) => setMode(v as "live" | "static")}
            />
          )}
        </div>
      </div>

      {/* stage */}
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-neutral-950 p-4">
        {device === "phone" ? (
          <PhoneFrame>
            <Surface mode={effectiveMode} reactCode={reactCode} html={html} />
          </PhoneFrame>
        ) : (
          <DesktopFrame appName={appName}>
            <Surface mode={effectiveMode} reactCode={reactCode} html={html} />
          </DesktopFrame>
        )}
      </div>

      <div className="border-t border-white/10 px-4 py-1.5 text-[11px] text-neutral-500">
        {effectiveMode === "live"
          ? "Live — a real dev server running in your browser. Click around; it's interactive."
          : "Static mockup. Switch to Live for the running, interactive app."}
      </div>
    </div>
  );
}

function Surface({
  mode,
  reactCode,
  html,
}: {
  mode: "live" | "static";
  reactCode: string | null;
  html: string | null;
}) {
  const srcDoc = useMemo(() => (html ? wrapPreview(html) : ""), [html]);

  if (mode === "live" && reactCode) return <LiveSandbox code={reactCode} />;
  if (!html)
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-xs text-neutral-500">
        No preview available yet.
      </div>
    );
  return (
    <iframe
      title="Static preview"
      sandbox="allow-scripts"
      srcDoc={srcDoc}
      className="h-full w-full border-0 bg-white"
    />
  );
}

function LiveSandbox({ code }: { code: string }) {
  const files = useMemo(() => prepareSandpackFiles(code), [code]);
  return (
    <SandpackProvider
      template="react-ts"
      files={files}
      options={{
        // Tailwind CDN so the generated utility classes actually style the app.
        externalResources: ["https://cdn.tailwindcss.com"],
      }}
      style={{ height: "100%", width: "100%" }}
    >
      <SandpackPreview
        showOpenInCodeSandbox={false}
        showRefreshButton={false}
        showRestartButton={false}
        showSandpackErrorOverlay
        style={{ height: "100%", width: "100%" }}
      />
    </SandpackProvider>
  );
}

function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative mx-auto overflow-hidden rounded-[44px] border border-white/15 bg-black p-3 shadow-2xl shadow-black/60"
      style={{ height: "100%", maxHeight: 844, aspectRatio: "390 / 844" }}
    >
      <div className="absolute left-1/2 top-3 z-10 h-6 w-32 -translate-x-1/2 rounded-full bg-black" />
      <div className="h-full w-full overflow-hidden rounded-[32px] bg-white">
        {children}
      </div>
    </div>
  );
}

function DesktopFrame({
  appName,
  children,
}: {
  appName: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex w-full flex-col overflow-hidden rounded-xl border border-white/10 shadow-2xl shadow-black/50"
      style={{ height: "100%", maxWidth: 1440 }}
    >
      <div className="flex items-center gap-2 border-b border-white/10 bg-neutral-900/80 px-3 py-2">
        <span className="h-3 w-3 rounded-full bg-red-400/80" />
        <span className="h-3 w-3 rounded-full bg-amber-400/80" />
        <span className="h-3 w-3 rounded-full bg-emerald-400/80" />
        <div className="mx-auto max-w-[70%] truncate rounded-md bg-black/40 px-3 py-1 text-[11px] text-neutral-400">
          {appName || "your-product"}.app
        </div>
      </div>
      <div className="min-h-0 flex-1 bg-white">{children}</div>
    </div>
  );
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: { id: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
            value === o.id
              ? "bg-white/10 text-white"
              : "text-neutral-400 hover:text-neutral-200"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
