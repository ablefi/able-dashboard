# able-dashboard — CLAUDE.md

Able's internal admin dashboard, built on the admin dashboard template (the
JustPray dashboard with its branding removed). See `README.md` for pages, setup
and what still needs the backend.

## Stack
Next.js 16 (App Router), React 19, Tailwind v4, recharts, react-toastify,
lucide-react. Data via **Supabase PostgREST over `fetch`** (service-role key,
server-only) plus Able's backend for the user, referral and admin sections.

## Layout
- `src/app/(authed)/` — pages (route = folder); each renders a view from `src/views/`.
- `src/app/api/` — server routes (Supabase + backend access).
- `src/views/` — the big page components.
- `src/components/` — shared UI (`layout/*` shells, `ui/*` primitives, `creators/*`).
- `src/lib/` — `supabaseRest.ts` (all Supabase I/O), `scrape.ts` (ScrapeCreators
  ingestion and post auto-approval), `auth.ts` (sessions), `nav.ts` (the one nav
  tree every shell reads), `sections.ts` + `permissions.ts` (path → section → keys),
  `brand.ts` (app name and backend URLs), `theme.ts` (runtime palette).
- `src/api/` — client side: `axiosInstance.ts` (backend calls with bearer token
  + 401 re-mint) and per-feature hooks.

## Auth
- `DASHBOARD_PASSWORD` set: shared-password sign-in, checked server-side, never
  forwarded to the backend. The session carries no backend token and gets
  `LOCAL_PERMISSIONS` from code on every request. Backend sections stay hidden.
- Unset: the form forwards to the backend's `POST /admin/login`; permissions come
  back from the backend and `/api/auth/me` re-reads them.
- Every API route guards with `requireSession(req, sectionOrKey)`. For Supabase
  routes that check is the real boundary; the nav filtering is UX only.

## Data sources
- **Supabase**: `creators`, `posts`, `view_snapshots`, `revenue_snapshots`,
  `competitors`, `app_state`, `page_views`. Schema in `supabase/schema.sql`.
- **Able's backend** via `/admin/*`: users, referral codes, admins. Not built yet.
- **ScrapeCreators**: creator post scraping. **iTunes RSS/lookup**: rankings, rating.

## Crons (`vercel.json`)
- `/api/cron/refresh-all` — every 8h, re-scrape creator posts.
- Attribution crons exist but are unscheduled until the backend has `/admin/users`.

## Conventions
- Counted views, not whole-channel views. Only `approved` posts count as
  sponsored work; `excluded` posts never count.
- Auto-approval uses `BRAND_HANDLES` / `BRAND_DISPLAY_NAME` / `BRAND_LINK_DOMAINS`
  (Able defaults in `src/lib/scrape.ts`). Mentions are anchored on "@".
- Colours come from `--color-app-*` tokens in `globals.css`; don't hard-code hex
  in views. `src/lib/theme.ts` DEFAULT_THEME must stay in step with those tokens.
- User-facing strings use plain sentences and no em dashes.
