# able-dashboard — CLAUDE.md

Marketing operations dashboard for Able. See `README.md` for setup and for what
still needs to be created (Supabase tables, backend endpoints, API keys).

## Stack
Next.js 16 (App Router), React 19, Tailwind v4, recharts, react-toastify. Data
via **Supabase PostgREST over `fetch`** (service-role key, server-only) plus
Able's backend for the user, referral and content sections.

## Layout
- `src/app/(authed)/` — pages (route = folder); each renders a view from `src/views/`.
- `src/app/api/` — server routes (Supabase + backend access).
- `src/views/` — the big page components (Creators, CreatorDetail, Performance, Dashboard, …).
- `src/components/` — shared UI (`ContentManager`, `DataTable`, `creators/*`, `ui/*`).
- `src/lib/` — server logic: `supabaseRest.ts` (all Supabase I/O), `scrape.ts`
  (ScrapeCreators ingestion), `brand.ts` (which @mentions auto-approve a post),
  `auth.ts` (no-op shim), `sections.ts`, `timeframe.ts`.
- `src/api/` — client side: `axiosInstance.ts` (backend calls with bearer token
  + 401 re-mint) and per-feature hooks.

## Auth
**There is none.** `requireSession` in `src/lib/auth.ts` always allows, and the
layout does no gating. The shim exists so every API route keeps its original
shape and a real session can be reinstated later without touching them. For
access control, use Vercel password protection on the project.

`/api/auth/token` mints a backend token server-side from `ADMIN_BACKEND_USER` /
`ADMIN_BACKEND_PASSWORD` and hands it to the browser for direct backend calls.

## Data sources
- **Supabase**: `creators`, `posts`, `view_snapshots`, `own_posts`,
  `competitors`, `page_views`, `revenue_snapshots`, `expenses`, `app_state`.
- **Able's backend** via `/admin/*`: users, referral codes, content. Not wired
  up yet; those pages render empty until it is.
- **ScrapeCreators**: creator post scraping.
- **RevenueCat**: optional, only if Able uses it.

## Crons (`vercel.json`)
- `/api/cron/refresh-all` — every 8h, re-scrape creator posts.

## Conventions
- Counted views, not whole-channel views. Only `approved` posts count as
  sponsored work; `excluded` posts never count.
- Auto-approval is driven entirely by `src/lib/brand.ts`. Set the handles there
  before the first scrape.
