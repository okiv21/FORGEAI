# Deployment

FORGEAI runs on three free tier services:

* **Vercel** hosts the Next.js frontend (the website people visit).
* **Render** runs the FastAPI backend (the server that drives the agents).
* **Supabase** provides the Postgres database and user accounts.

The frontend calls the backend directly over a live stream, and the backend
reads and writes the database with a secret service key.

## How updates go live

Every push to `main` can deploy automatically:

```
git push  ->  GitHub Actions (.github/workflows/deploy.yml)
                 |  apply Supabase migrations (only if its secrets are set)
                 |  trigger the Render deploy  (via RENDER_DEPLOY_HOOK)
                 |  trigger the Vercel deploy  (usually not needed, see below)
```

Vercel already redeploys on its own when it is connected to the repo, so you do
not need a Vercel hook. Render is the one worth automating, because a manually
created Render service does not redeploy on push by default.

## One time setup

### 1. Supabase (database and accounts)

1. Create a project at [supabase.com](https://supabase.com). Note the **Project
   Ref** (in the project URL) and the **database password** you set.
2. Open **Project Settings > API** and copy three things:
   * the **Project URL**
   * the **anon** public key (safe for the browser)
   * the **service_role** key (secret, backend only)
3. Apply the database migrations in `supabase/migrations/`. Either paste each
   file into the Supabase **SQL Editor** and run it, or run `supabase db push`
   locally after `supabase link --project-ref <ref>`.
4. Under **Authentication > Providers > Email**, turn **Confirm email** off while
   testing so people can sign up without a confirmation email. Turn it back on
   before a real public launch.

### 2. Render (backend)

Create a **Web Service** from this repo and set the root directory to `backend`.
Render builds it from `backend/Dockerfile`.

Set these environment variables under the service's **Environment** tab. A
manually created service does not read `render.yaml`, so every value below has to
be entered by hand:

| Variable | Value |
|----------|-------|
| `OPENROUTER_API_KEY` | Your OpenRouter key |
| `OPENROUTER_FRONTEND_MODEL` | `openai/gpt-5.6-sol,qwen/qwen3-coder:free,poolside/laguna-m.1:free` |
| `OPENROUTER_BACKEND_MODEL` | `poolside/laguna-m.1:free,cohere/north-mini-code:free,qwen/qwen3-coder:free` |
| `OPENROUTER_PM_MODEL` | `nvidia/nemotron-3-ultra-550b-a55b:free,nvidia/nemotron-3-super-120b-a12b:free` |
| `OPENROUTER_REVIEWER_MODEL` | `deepseek/deepseek-v4-flash,nvidia/nemotron-3-ultra-550b-a55b:free` |
| `SUPABASE_URL` | Your Supabase Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | The secret service_role key (never put this in Vercel) |
| `FRONTEND_ORIGIN` | Your Vercel site URL, for example `https://forgeai.vercel.app` |

Notes:

* Each `OPENROUTER_*_MODEL` value is a comma separated fallback chain. If the
  first model is busy or unavailable, the backend tries the next one.
* `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are required for run history to
  save and for the daily usage cap. Without them, generations still run but
  nothing is saved.
* `FRONTEND_ORIGIN` is the CORS allow list. The backend also accepts any
  `*.vercel.app` address automatically, so preview URLs keep working.

Then open **Settings > Deploy Hook**, copy the URL, and save it as the GitHub
secret `RENDER_DEPLOY_HOOK` (see step 4).

### 3. Vercel (frontend)

Import the repo and set the **Root Directory** to `frontend`. Vercel detects
Next.js automatically. Add these environment variables:

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_API_BASE` | Your Render backend URL, for example `https://forgeai.onrender.com` |
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | The anon public key (not the service_role key) |

Apply each value to all three environments (Production, Preview, Development) so
every build has them. Changing a `NEXT_PUBLIC_` value only takes effect after a
new deploy, so redeploy after editing.

### 4. GitHub Actions secrets

Add these under the repo's **Settings > Secrets and variables > Actions**. Only
`RENDER_DEPLOY_HOOK` is needed for the common case. The workflow skips any secret
you leave unset, so a partial setup still works.

| Secret | Needed? | Where it comes from |
|--------|---------|---------------------|
| `RENDER_DEPLOY_HOOK` | Yes | Render service Settings > Deploy Hook |
| `VERCEL_DEPLOY_HOOK` | Optional | Skip it if Vercel already auto-deploys on push |
| `SUPABASE_ACCESS_TOKEN` | Only for CI migrations | Supabase account > Access Tokens |
| `SUPABASE_PROJECT_REF` | Only for CI migrations | Supabase project ref |
| `SUPABASE_DB_PASSWORD` | Only for CI migrations | The database password you set |

## Environment variable reference

**Backend (Render):** `OPENROUTER_API_KEY`, the four `OPENROUTER_*_MODEL` chains,
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FRONTEND_ORIGIN`.

**Frontend (Vercel):** `NEXT_PUBLIC_API_BASE`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`.

The service_role key belongs only on the backend. Never add it to Vercel or any
value that starts with `NEXT_PUBLIC_`, because those are shipped to the browser.

## Database

Migrations live in `supabase/migrations/`:

* `..._init.sql` creates the `projects` table (saved runs) and the `usage` table
  (daily counts), with row level security so each user sees only their own rows.
* `..._server_hardening.sql` adds the server side checks used by the backend.

## Verify it works

After both services are deployed, open your Vercel URL and check, in order:

1. The page loads and the eclipse hero renders. That confirms Vercel and the
   `NEXT_PUBLIC_` values are correct.
2. Sign up or sign in works. That confirms the Supabase URL and anon key.
3. Visit `<your-render-url>/health` directly. A small block of JSON means the
   backend is running. The first request after an idle period can take about a
   minute while the free service wakes up.
4. Run one generation. If the agents stream, the backend, `FRONTEND_ORIGIN`, and
   `OPENROUTER_API_KEY` are all correct. When it finishes, the run appears in the
   history sidebar and the **Download project** button produces a zip.

If a generation fails with a CORS error in the browser console, `FRONTEND_ORIGIN`
does not match your Vercel URL. A 401 points to the Supabase keys, and a 500
usually means a missing or invalid `OPENROUTER_API_KEY`.
