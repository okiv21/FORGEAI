# FORGEAI

Turn a product idea into a complete, buildable plan. You describe an app in a
sentence, optionally add a few product photos, and a team of 11 specialist AI
agents produces the requirements, database, backend, a designed and interactive
UI, tests, a security review, applied fixes, and a deployment plan. Everything is
assembled live in front of you, and you can download the whole thing as a folder.

![status](https://img.shields.io/badge/status-active-brightgreen)

## What it does

You type an idea. Eleven agents run one after another, and each agent builds on
the finished work of the ones before it. Their progress streams into the studio
so you watch the product take shape in real time.

The pipeline runs in this order:

```
Product Manager  ->  Database  ->  Backend  ->  UI/UX  ->  Frontend
      ->  Reviewer  ->  QA  ->  Security  ->  Remediation  ->  DevOps  ->  Docs
```

The preview panel on the right fills in over three stages, then becomes a real,
clickable app:

```
loading skeleton  ->  wireframe (from the UI/UX layout)  ->  live running app
```

## Key features

**Live preview that actually runs.** The generated frontend boots as a real
React app inside your browser using [Sandpack](https://sandpack.codesandbox.io),
so you can click through it. There is no hosting or build step to see it work.
The app is written mobile first, so it fits any screen once you deploy it.

**Design quality, not AI slop.** The design agents run on a strong model with a
built in taste brief ([design_taste.py](backend/design_taste.py)), so the result
looks intentionally designed instead of the usual generic layout.

**Your own product photos, used for real.** Upload up to six product or concept
images. The design agents use them for visual direction, and your actual photos
are placed into the generated app instead of AI invented stand ins.

**Findings get fixed, not just listed.** The Reviewer and Security agents flag
issues, then a Remediation agent takes those findings and produces corrected,
hardened code. The preview shows the fixed version.

**Download the whole project.** When a build finishes, one click gives you a zip
folder containing every part of the plan, the generated code as real files, and a
plain English Word document that walks you through hosting it step by step.

**Accounts and history.** Sign in with Supabase, and every run is saved to a
personal history sidebar you can click to reload. A daily usage cap and row level
security keep each account to its own data.

**Resilient by design.** Every agent has a fallback chain of models. If one model
is rate limited or unavailable, the run switches to the next option automatically,
so a build still completes.

## The 11 agents

| Agent | Role |
|-------|------|
| Product Manager | Writes the PRD: the problem, target users, MVP scope, and success metrics |
| Database Architect | Designs a normalized Postgres schema with the SQL to create it |
| Backend Engineer | Designs the REST API and a FastAPI starting point |
| UI/UX Designer | Produces a structured layout for each screen (uses your images) |
| Frontend Engineer | Builds an interactive, responsive React app and an HTML mockup (uses your images) |
| Code Reviewer | Reviews the design for correctness and consistency bugs |
| QA Tester | Writes a test plan and example automated tests |
| Security Reviewer | Runs a focused security audit of the design |
| Remediation Engineer | Applies the review and security findings and outputs corrected code |
| DevOps Engineer | Writes a deployment plan, a Dockerfile, and a CI workflow |
| Technical Writer | Produces the project README |

Cloud models are reached through [OpenRouter](https://openrouter.ai). Each agent
prefers its assigned models, falls back to free models, and finally to a local
[Ollama](https://ollama.com) model as a last resort. To see which models are free
on your account right now, run:

```bash
python backend/list_free_models.py
```

> Hardware note: the app was designed to run on a 16GB laptop with no GPU. Agents
> run one at a time, so only a single local model is ever loaded. The cloud models
> are there to improve quality and speed, not because they are required.

## How it is built

```
Frontend (Next.js, Tailwind, three.js)          Backend (FastAPI)
  Studio UI and eclipse hero                       orchestrator.py  runs the pipeline and streams events
  Live preview via Sandpack                        agents.py        the 11 agents and their prompts
  Supabase auth and history sidebar                model_router.py  fallback chains, vision, resilience
  Talks to the backend over a live stream          export_bundle.py builds the downloadable zip
                                                    design_taste.py  the taste brief

  Supabase: Postgres (projects, usage) with Auth and row level security
```

The browser talks to the backend directly rather than through a Next.js proxy,
because the proxy buffers the live stream and would break the real time updates.

## Run it locally

### 1. Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # Windows. On macOS or Linux: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env            # then add your keys (see below)
uvicorn main:app --reload --port 8000
```

Settings in `backend/.env`:

* `OPENROUTER_API_KEY` powers the cloud agents.
* `OPENROUTER_*_MODEL` are comma separated fallback chains, one per agent tier.
* With no key set, every agent falls back to local Ollama. Pull the models first
  with `ollama pull qwen3:8b` and `ollama pull llama3.2:3b`.

### 2. Frontend

```bash
cd frontend
npm install
copy .env.local.example .env.local   # then set the NEXT_PUBLIC_ values
npm run dev                          # http://localhost:3000
```

Settings in `frontend/.env.local`:

* `NEXT_PUBLIC_API_BASE` is the backend URL (default `http://localhost:8000`).
* `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` enable accounts
  and history. Without them the app still runs, just without sign in.

Apply the database migrations in `supabase/migrations/` using the Supabase SQL
Editor, or with `supabase db push`.

## Deploy it

The free tier stack is Vercel for the frontend, Render for the backend, and
Supabase for the database and auth. A GitHub Actions workflow
([deploy.yml](.github/workflows/deploy.yml)) can apply migrations and trigger both
deploys automatically on every push. Full instructions and the list of required
secrets are in [DEPLOYMENT.md](DEPLOYMENT.md).

## Project status

For a detailed breakdown of what is finished and what is still in progress, see
[STATUS.md](STATUS.md).
