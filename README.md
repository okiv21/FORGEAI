# FORGEAI

Turn a product idea into a complete, buildable plan. You describe an app in a
sentence, answer a few quick questions so the agents stop guessing, optionally
add product photos, and a team of 11 specialist AI agents produces the
requirements, database, backend, a designed and interactive UI, tests, a
security review, applied fixes, and a deployment plan. Everything is assembled
live in front of you, and you can download the whole thing as a folder.

![status](https://img.shields.io/badge/status-active-brightgreen)

## What it does

The studio walks you through four steps:

```
01 idea  ->  02 clarify  ->  03 forge  ->  04 assets
```

**Idea.** You describe what you want to build and optionally attach product
images.

**Clarify.** Before anything runs, the system reads your idea and asks 3 to 4
questions written specifically for it, each with tappable answer options plus a
custom answer field. The questions target the choices that most change what gets
built: who it is for, the core action, how it makes money, the ambition level,
and any hard constraint. A hair store gets asked about inventory size and
shipping regions, not generic filler. Your answers are treated as requirements by
every agent, so the pipeline builds what you meant instead of guessing.

**Forge.** Eleven agents run one after another, and each agent builds on the
finished work of the ones before it. Their progress streams into the studio so
you watch the product take shape in real time.

**Assets.** When the run completes you get every artifact in one place: the full
project as a downloadable zip, plus each document individually viewable and
downloadable.

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

**Discovery, not guesswork.** Before the agents run, a discovery step reads your
idea and asks questions tailored to it: the specific products or items, how they
are packaged and presented, the audience, the brand feel, and the key pages. The
number of questions adapts, more for visual or catalog ideas and fewer for simple
utilities. Your answers are synthesised into a structured product understanding
that flows into every agent, so the plan matches what you actually meant.

**Live preview that actually runs.** The generated frontend boots as a real
React app inside your browser using [Sandpack](https://sandpack.codesandbox.io),
so you can click through it. There is no hosting or build step to see it work.
The app is written mobile first, so it fits any screen once you deploy it.

**Design quality, not AI slop.** The design agents run on a capable model with a
built in taste brief ([design_taste.py](backend/design_taste.py)), so the result
looks intentionally designed instead of the usual generic layout. The design
model is a single swappable setting (`DESIGN_AGENT_MODEL`) for cost and quality
tuning.

**Real imagery, three ways.** Upload up to six product photos and your actual
images are placed into the generated app. For everything you did not upload, a
deterministic image resolver fills each slot from the cheapest good source:
generic content from free stock photos, profile pictures from generated avatars,
and branded product shots generated from the discovery step's visual description
so a hero image looks like your real product.

**Findings get fixed, not just listed.** The Reviewer and Security agents flag
issues, then a Remediation agent takes those findings and produces corrected,
hardened code. The preview shows the fixed version.

**Download the whole project.** When a build finishes, one click gives you a zip
folder containing every part of the plan, the generated code as real files (with
images baked in), and a plain English Word document that walks you through
hosting it step by step.

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
Frontend (Next.js, Tailwind)                    Backend (FastAPI)
  Four step studio: idea, clarify, forge, assets   orchestrator.py   runs the pipeline and streams events
  Live preview via Sandpack                        agents.py         the 11 agents and their prompts
  Talks to the backend over a live stream          clarify.py        discovery questions + product context
                                                   model_router.py   fallback chains, vision, resilience
                                                   image_resolver.py  stock / avatar / generated images
                                                   export_bundle.py   builds the downloadable zip
                                                   design_taste.py    the taste brief
```

The app runs with no sign in required. The browser talks to the backend directly
rather than through a Next.js proxy, because the proxy buffers the live stream and
would break the real time updates.

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

* `OPENROUTER_API_KEY` powers the cloud agents and generated images.
* `DESIGN_AGENT_MODEL` is the one model the UI/UX and Frontend agents run on
  (default `moonshotai/kimi-k2.6`). Swap it for the bake-off: `moonshotai/kimi-k3`
  or `openai/gpt-5.6-sol`.
* `OPENROUTER_*_MODEL` are comma separated fallback chains, one per agent tier.
* `PEXELS_API_KEY` (optional, free) enables the stock photo image tier.
* `IMAGE_GEN_MODEL` (optional) is the OpenRouter image model for branded images
  (default `openai/gpt-5-image-mini`).
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

The app runs anonymously, so no frontend keys beyond the API base are required.

## Deploy it

The free tier stack is Vercel for the frontend and Render for the backend. A
GitHub Actions workflow ([deploy.yml](.github/workflows/deploy.yml)) triggers the
deploys automatically on every push. Full instructions and the list of required
environment variables are in [DEPLOYMENT.md](DEPLOYMENT.md).

## Project status

For a detailed breakdown of what is finished and what is still in progress, see
[STATUS.md](STATUS.md).
