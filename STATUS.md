# FORGEAI — Project Status

_Last updated: 2026-07-13_

A running summary of what's built and verified, and what's left.

---

## ✅ Done & verified

### Core pipeline
- **11-agent sequential pipeline** (PM → Database → Backend → UI/UX → Frontend →
  Reviewer → QA → Security → Remediation → DevOps → Docs), streamed live over SSE.
  The Remediation Engineer consumes the Reviewer/QA/Security findings and emits
  corrected, hardened code (which the preview then shows).
- Each agent consumes the **structured output** of the ones before it.
- Full end-to-end runs verified (schema, backend, UI, reviews, docs all produced).

### Model routing (`backend/model_router.py`)
- **Fallback chains** per agent — cloud model(s) → … → local Ollama safety net.
- **Resilience**: transient errors (429/5xx) retried with backoff; a congested
  free model fails over immediately to the next candidate. Verified with a
  purpose-built always-429 test (fast failover + last-resort backoff both pass).
- **Vision routing**: uploaded images are forwarded only to vision-capable models
  (GPT-5.6-sol) and flattened to text for non-vision fallbacks.
- Current routing: UI/UX + Frontend → **GPT-5.6-sol** (paid); Reviewer + Security
  → **DeepSeek V4-Flash** (paid, cheap); everything else → **free** models.

### Design quality
- **Taste brief** (`backend/design_taste.py`, from the open-source tasteskill)
  injected into the UI/UX + Frontend agents. Verified: produces genuinely
  designed UIs (e.g. a premium "Crown & Coil" hair-store hero) — no AI-slop.

### Frontend app
- **Cinematic redesign** — pure-black theme with a **three.js eclipse** hero
  (fresnel rim shader), spectral accents (no more purple/black).
- **Live Device Preview** — generated React boots as a **real running app** in
  Sandpack; **iPhone / Desktop** frames; Live/Static toggle; static-mockup
  fallback. Verified interactive (counter 0→3) + phone frame renders.
- **Image upload** — up to 6 product/concept photos, client-downscaled, attached
  to the vision design agents. API path verified.
- **Stop button** — aborts a run mid-flight (SSE disconnect cancels the backend).
- **3-stage assembling preview**: skeleton → wireframe (UI/UX JSON) → live app.

### Auth, history & usage (Supabase)
- **Supabase Auth** (email/password; Google/GitHub buttons ready once enabled).
- **Project-history sidebar** — per-user, click to reload a past run.
- **Save on completion** + **daily usage cap** (`increment_usage()` RPC, 25/day).
- **Row Level Security** on `projects` + `usage` (`auth.uid() = user_id`).
- Verified end-to-end: signup → session → insert (201) → usage RPC (→1) →
  sidebar lists it → click reloads it into the studio view.

### Deployment scaffolding
- `.github/workflows/deploy.yml` — migrate → Vercel + Render deploys in parallel.
- `backend/Dockerfile`, `render.yaml`, `supabase/migrations/…_init.sql`,
  `supabase/config.toml`, `frontend/lib/supabase.ts`, `DEPLOYMENT.md`.

---

## 🚧 Left to do

### Provisioning (your accounts — code is ready)
- [ ] Create the **Vercel**, **Render**, and (done ✅) **Supabase** projects.
- [ ] Set the **GitHub Actions secrets** (see `DEPLOYMENT.md`): `SUPABASE_ACCESS_TOKEN`,
      `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `VERCEL_DEPLOY_HOOK`,
      `RENDER_DEPLOY_HOOK`.
- [ ] Set env vars in Vercel (`NEXT_PUBLIC_*`) and Render (`OPENROUTER_API_KEY`,
      `SUPABASE_*`, `FRONTEND_ORIGIN`).
- [ ] First real deploy + smoke test on the live URLs.

### Backend hardening for production
- [x] Enforce the **usage cap server-side** in FastAPI `/run`. The authenticated
      service-role call claims the daily slot atomically before any agents run.
- [x] Persist completed runs from the **backend** (service role), rather than the
      browser; the frontend only receives a `run_saved` confirmation.
- [x] CORS is driven by the comma-separated `FRONTEND_ORIGIN` environment value.

### Nice-to-haves
- [ ] Enable **Google/GitHub OAuth** in Supabase (buttons already wired).
- [ ] Re-enable **email confirmation** for production (turned off for testing).
- [x] Delete-project + rename-project in the history sidebar.
- [ ] Handle very large generated apps in Sandpack (multi-file split, better
      dependency-failure messaging).
- [ ] Optional: swap the sequential orchestrator for **LangGraph** (architecture
      already supports it — agents/routing are decoupled).

---

## 💵 Cost note

The paid models are **GPT-5.6-sol** (UI/UX + Frontend) and **DeepSeek V4-Flash**
(Reviewer + Security). A full 11-agent run costs roughly **$0.50–1** depending on
output size; everything else runs on free models. The usage cap (25/day) is the
guardrail.

## 🔑 Test account note

A throwaway account `apstudio.tester@gmail.com` was created during verification —
it only sees its own (test) data thanks to RLS and doesn't affect your real
account. Email confirmation was turned **off** for testing; turn it back on for
production.
