# FORGEAI

Your AI startup co-founder. Describe an app idea — optionally drop in product
photos — and a pipeline of **10 specialist AI agents** turns it into a full
product plan: PRD, database schema, backend, a taste-driven UI, a real running
preview, tests, a security audit, a deploy plan, and docs — assembled live in
front of you.

![status](https://img.shields.io/badge/status-active-brightgreen)

## What it does

You type an idea. Eleven agents run in sequence, each consuming the structured
output of the ones before it, streaming their work into a live studio UI:

```
PM → Database → Backend → UI/UX → Frontend → Reviewer → QA → Security → DevOps → Docs
```

The right-hand **Studio Preview** assembles the product in three stages, then
becomes a real, interactive app you can click through:

```
skeleton  →  wireframe (UI/UX JSON spec)  →  Live Device Preview (running React app)
```

## Highlights

- **Live Device Preview** — the generated frontend boots as a *real running app*
  in the browser via [Sandpack](https://sandpack.codesandbox.io) (no hosting),
  with an **iPhone / Desktop** toggle and a static-mockup fallback.
- **Design taste** — the UI/UX + Frontend agents run on **GPT-5.6-sol** with an
  anti-slop [taste brief](backend/design_taste.py) baked in, so output looks
  intentionally designed (no purple-gradient, three-identical-cards slop).
- **Image upload** — attach product or concept photos; the vision-capable design
  agents use them to match your real product.
- **Accounts + history** — Supabase Auth, a per-user project-history sidebar
  (click to reload a past run), and a daily usage cap. Row Level Security keeps
  every user to their own rows.
- **Resilient model routing** — each agent has a fallback *chain*; a rate-limited
  or unavailable model fails over to the next, ending in a local Ollama safety net.
- **Stop button** — abort a run mid-flight.

## Agents & models

| Agent | Primary model | Notes |
|-------|---------------|-------|
| Product Manager | `nemotron-3-ultra-550b` *(free)* | PRD: problem, users, MVP, metrics |
| Database Architect | `laguna-m.1` *(free)* | Normalized Postgres schema + DDL |
| Backend Engineer | `laguna-m.1` *(free)* | REST API + FastAPI starter |
| **UI/UX Designer** | **`gpt-5.6-sol`** *(paid)* + taste + 🖼️ | Structured JSON layout spec (not images) |
| **Frontend Engineer** | **`gpt-5.6-sol`** *(paid)* + taste + 🖼️ | HTML mockup + runnable React |
| Code Reviewer | `deepseek-v4-flash` *(paid, cheap)* | Correctness + security review |
| QA Tester | `laguna-m.1` *(free)* | Test plan + example tests |
| Security Reviewer | `deepseek-v4-flash` *(paid, cheap)* | Focused security audit |
| DevOps Engineer | `laguna-m.1` *(free)* | Deploy plan, Dockerfile, CI |
| Technical Writer | `nemotron-3-ultra-550b` *(free)* | Project README |

🖼️ = receives uploaded images. All cloud models are reached via **OpenRouter**;
each agent falls back to free models and finally a local **Ollama** model. Run
`python backend/list_free_models.py` to see what's free on your account.

> Hardware note: the app was built to run on a 16GB / no-GPU laptop. Agents run
> **one at a time**, so only one local model is resident at once — the cloud
> models simply improve quality and speed.

## Architecture

```
Next.js + Tailwind + three.js (frontend)         FastAPI (backend)
  ├─ eclipse hero, studio UI                        ├─ orchestrator.py  (sequential pipeline, SSE)
  ├─ Live Device Preview (Sandpack)                 ├─ agents.py        (11 agents + prompts)
  ├─ Supabase Auth + history sidebar   ──direct──▶  ├─ model_router.py  (fallback chains, vision, resilience)
  └─ calls backend at NEXT_PUBLIC_API_BASE  (SSE)   └─ design_taste.py  (anti-slop brief)

                     Supabase: Postgres (projects, usage) + Auth + RLS
```

The browser talks to FastAPI **directly** (not via a Next.js rewrite) because the
dev proxy buffers Server-Sent Events, which would break the live streaming.

## Local setup

### 1. Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # Windows;  source .venv/bin/activate on macOS/Linux
pip install -r requirements.txt
copy .env.example .env            # add OPENROUTER_API_KEY (see notes below)
uvicorn main:app --reload --port 8000
```

`backend/.env` (OpenRouter powers the cloud agents):

- `OPENROUTER_API_KEY` — required for the paid models (GPT-5.6-sol, DeepSeek).
- `OPENROUTER_*_MODEL` — comma-separated fallback chains per agent tier.
- With **no** key, every agent falls back to local Ollama (`ollama pull qwen3:8b`,
  `llama3.2:3b`).

### 2. Frontend

```bash
cd frontend
npm install
copy .env.local.example .env.local   # set NEXT_PUBLIC_* (API + Supabase)
npm run dev                          # http://localhost:3000
```

`frontend/.env.local`:

- `NEXT_PUBLIC_API_BASE` — backend URL (default `http://localhost:8000`).
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — enable Auth +
  history. Without them the app still runs, just without accounts/history.

Apply the DB migration (`supabase/migrations/…_init.sql`) via the Supabase SQL
Editor or `supabase db push`.

## Deployment

Free tier: **Vercel** (frontend) · **Render** (backend) · **Supabase** (DB + Auth).
CI at [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) runs
migrations then triggers both deploys in parallel. Full steps and the required
secrets are in **[DEPLOYMENT.md](DEPLOYMENT.md)**.

## Project status

See **[STATUS.md](STATUS.md)** for a detailed breakdown of what's done and what's
left.
