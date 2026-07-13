# Deployment

Free-tier stack: **Vercel** (Next.js frontend) · **Render** (FastAPI backend) ·
**Supabase** (Postgres + Auth). CI applies DB migrations then triggers both deploys.

## Architecture

```
 push to main
      │
      ▼
 GitHub Actions (.github/workflows/deploy.yml)
      │
   [migrate]  ── supabase db push (projects + usage tables, RLS)
      │
      ├──▶ [deploy-frontend] ─ POST Vercel deploy hook   ┐ run in
      └──▶ [deploy-backend]  ─ POST Render deploy hook    ┘ parallel
```

## One-time provisioning

### 1. Supabase
1. Create a project at supabase.com. Note the **Project Ref** (in the URL /
   Project Settings → General) and the **DB password** you set.
2. Project Settings → API: copy the **Project URL**, the **anon** public key, and
   the **service_role** key (keep secret).
3. Migrations live in `supabase/migrations/`. CI runs `supabase db push`; to apply
   locally: `supabase link --project-ref <ref> && supabase db push`.
4. Auth → Providers: enable Email, and optionally Google / GitHub OAuth.

### 2. Render (backend)
- New → Blueprint, point at this repo (uses `render.yaml` → `backend/Dockerfile`),
  **or** New Web Service → Docker, root `backend/`.
- Set env vars: `OPENROUTER_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `FRONTEND_ORIGIN` (your Vercel URL). Model vars have defaults in `render.yaml`.
- Settings → Deploy Hook: copy the URL → GitHub secret `RENDER_DEPLOY_HOOK`.

### 3. Vercel (frontend)
- Import the repo. **Root Directory = `frontend`** (framework auto-detected: Next.js).
- Env vars: `NEXT_PUBLIC_API_BASE` (your Render URL),
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Settings → Git → Deploy Hooks: create one → GitHub secret `VERCEL_DEPLOY_HOOK`.

## GitHub Actions secrets (Settings → Secrets and variables → Actions)

| Secret | From |
|--------|------|
| `SUPABASE_ACCESS_TOKEN` | Supabase account → Access Tokens |
| `SUPABASE_PROJECT_REF` | Supabase project ref |
| `SUPABASE_DB_PASSWORD` | Supabase DB password |
| `VERCEL_DEPLOY_HOOK` | Vercel deploy hook URL |
| `RENDER_DEPLOY_HOOK` | Render deploy hook URL |

## Database

`supabase/migrations/20260713000000_init.sql`:
- **projects** (`user_id`, `idea`, `prd`, `db_schema`, `code_refs`, `created_at`)
- **usage** (`user_id`, `generation_count`, `date`) + `increment_usage()`
- **Row Level Security** on both: `auth.uid() = user_id` (users see only their own).

## Auth / persistence (frontend) — next step

`frontend/lib/supabase.ts` is the browser client (anon key). Still to wire up
(needs your Supabase URL + anon key in `.env.local`): the login screen, saving a
run to `projects`, the per-user history sidebar, and the usage cap via
`increment_usage()`. See `frontend/.env.local.example`.

## Production update

The auth/history UI is now wired. The browser sends its Supabase access token to
`POST /run`; FastAPI verifies it, atomically claims the daily generation
allowance, and persists completed runs with the backend-only
`SUPABASE_SERVICE_ROLE_KEY`. Apply both migrations in `supabase/migrations/`.
Never add the service-role key to Vercel or browser code.
