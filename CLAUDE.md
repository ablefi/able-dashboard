# able-dashboard — CLAUDE.md

Able's internal dashboard, built on the admin dashboard template (the JustPray
dashboard with its branding removed). It replaced the static Ops dashboard in the
`able` repo (`apps/dashboard`). See `README.md` for pages and setup.

## Stack
Next.js 16 (App Router), React 19, Tailwind v4, recharts, react-toastify,
lucide-react.

## Layout
- `src/app/(authed)/` — pages (route = folder); each renders a view.
- `src/views/able/` — pages backed by Able's API (Overview, Roster, Compliance,
  Growth, Activation, Referrals, CardSpend, Creators, Posts, Giving), with shared
  `ReportPage.tsx`, `marketingTypes.ts` and `creatorTypes.ts`.
- `src/views/` — template pages (Website, Competitors, Reviews, and backend-admin
  pages that stay hidden until the backend has `/admin/*`).
- `src/app/api/able/route.ts` + `src/lib/ableApi.ts` — read-only proxy to Able's API.
- `src/lib/` — `auth.ts` (sessions), `nav.ts` (the one nav tree every shell reads),
  `sections.ts` + `permissions.ts` (path → section → keys), `useAbleReport.ts`
  (cached client loader), `chartTheme.ts`, `supabaseRest.ts`, `theme.ts`.

## Data sources
- **Able API** (`API_TOKEN` = the API's `DASHBOARD_API_TOKEN`, `API_BASE`): only
  the routes the API marks `dashboard-read`. Response shapes come from
  `apps/api/src` in the `able` repo (stats.ts, marketing.ts, giving.ts,
  creators.ts, admin.ts); keep the local interfaces in step when those change.
  Money units follow the API exactly (micro USDT / micro USD / cents → display).
- **Supabase**: Website Analytics, Competitors, App Store Reviews.
- No scraping or crons here: Able's API scrapes creators on Railway.

## Auth
- `DASHBOARD_PASSWORD` set: shared-password sign-in, checked server-side.
  Sessions carry no backend token and get `LOCAL_PERMISSIONS` from code.
- Unset: the form forwards to the backend's `POST /admin/login` (not built yet).
- Every API route guards with `requireSession(req, sectionOrKey)`; that is the
  boundary for the Able proxy and Supabase routes. Nav filtering is UX only.

## Boundaries
- The read proxy (`/api/able`) is an exact read-only allowlist. Never add write
  routes or `/marketing/users/details` to it.
- The only writes are creator edits through `/api/able/write` with the scoped
  `CREATORS_API_TOKEN` (exact allowlist in `isCreatorWrite`, `creators:write`
  permission). Never put the API's full admin `API_TOKEN` in this project.
- Never send `API_TOKEN`, `CREATORS_API_TOKEN` or the Supabase key to the browser.

## Conventions
- Colours come from `--color-app-*` / `--color-cat-*` tokens; don't hard-code hex.
  `src/lib/theme.ts` DEFAULT_THEME must stay in step with `globals.css`.
- User-facing strings use plain sentences and no em dashes.
