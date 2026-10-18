# Able Dashboard

Able's internal dashboard: service health, money and user stats, compliance, growth reports, creators, giving and competitors. Next.js 16 (App Router), React 19, Tailwind v4, Recharts.

Built on the admin dashboard template (the JustPray dashboard with its branding removed): dark navy surfaces, a blue accent, four navigation styles and a ⌘K command palette. It replaces the old static Ops dashboard (`apps/dashboard` in the `able` repo) and shows the same reports.

## Pages

| Section | Pages | Data |
|---|---|---|
| Dashboard | Services and latency, money, users map, signups, deposits, card spend, card funnel, countries, KYC, age bands, ledger, top referrers | Able API `/health`, `/health/upstream`, `/stats` |
| Users | Users (roster, exact phone search, CSV export), Compliance | Able API `/marketing`, `/compliance` |
| Users (later) | Accounts, User Analysis | Backend `/admin/users` (not built; hidden) |
| Creators | Creators (roster, deal terms, invite codes, counted views, CPM; add, edit, remove, refresh), creator page, Posts (approve, exclude, outliers), Calendar | Able API `/creators` and creator writes |
| Growth | Growth (acquisition, activation, referral codes), Money (deposits, card spend) | Able API `/marketing` |
| Growth | Website Analytics, Competitors, App Store Reviews | Supabase, iTunes RSS |
| Giving | Overview, disbursement worksheet, monthly statement, CSV for the accountant | Able API `/giving/report`, `/giving/statement` |
| Referral Codes, Admins | Template pages | Backend `/admin/*` (not built; hidden) |

## Able API reports

`/api/able?path=…` (`src/app/api/able/route.ts`, `src/lib/ableApi.ts`) forwards to Able's API with `API_TOKEN`, the API's read-only `DASHBOARD_API_TOKEN`. It allows exactly the API routes marked `dashboard-read`: `GET /health`, `/health/upstream`, `/stats`, `/compliance`, `/marketing`, `/creators`, `/giving/report`, `/giving/statement`, and `POST /marketing/users/search` (exact phone lookup). Each path is gated on the signed-in session's section permission. The token never reaches the browser.

Those reads are all read-only. Phones arrive masked from the API.

Creator edits go through `/api/able/write` (`src/app/api/able/write/route.ts`) with `CREATORS_API_TOKEN`, the API's scoped creators token. It allows exactly `POST /creators`, `DELETE /creators/:id`, `POST /creators/refresh`, `POST /creators/:id/refresh` and `POST /creators/posts/:id`, and needs the `creators:write` permission. The API accepts that token on those five routes only (access `creators-write` in `apps/api/src/admin.ts`). Recording Giving payments still needs the API admin token and is done by an operator outside this dashboard.

Creators and posts live in Able's API, which scrapes every creator's feed every 8 hours on Railway (see `docs/creators.md` in the `able` repo). "Refresh feed" here asks the API to scrape now.

## Sign-in

- **Shared password (current).** Set `DASHBOARD_PASSWORD` (and optionally `DASHBOARD_ALLOWED_EMAILS`). The login form checks it on the dashboard's server. Sessions get `LOCAL_PERMISSIONS` from `src/lib/auth.ts`: every Able API report plus Website and Competitors. Accounts, Referral Codes, Admins and App Store Reviews stay hidden.
- **Backend admin accounts (later).** Remove `DASHBOARD_PASSWORD` and the form forwards to `POST /admin/login` on Able's backend, which returns each admin's own token and permission keys. Shared-password sessions stop working as soon as the variable is removed. The backend would need:
  - `POST /admin/login` → `{ access_token, admin: { id, email, isSuperAdmin, permissions[] } }`
  - `GET /admin/users` (paged), `GET /admin/users/:id`, `PATCH /admin/users/:id/toggle-status`, `DELETE /admin/users/:id`, `POST /admin/users/:id/restore`
  - `GET/POST/PATCH/DELETE /admin/referral-codes[/:id]` and their analytics
  - `GET/POST/PATCH/DELETE /admin/admins[/:id]`, `GET/POST/DELETE /admin/permissions[/:id]`

Either way the session is a signed httpOnly cookie (`DASHBOARD_SESSION_SECRET`) and every API route checks it with `requireSession`.

### Permissions

`src/lib/permissions.ts` maps sections to keys (`compliance:read`, `marketing:read`, `giving:read`, …), `src/lib/sections.ts` maps paths to sections, and `src/lib/nav.ts` hides anything the session can't open.

## Supabase pages

Website Analytics, Competitors and App Store Reviews keep their own data in Supabase (`supabase/schema.sql`). Competitors checks each app's position in the Top Free Finance chart across about 50 storefronts and caches it in `app_state.competitor_rankings`; set `APPLE_APP_ID` once Able is on the App Store to pin Able to the top.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill it in. `API_TOKEN` is the API's `DASHBOARD_API_TOKEN`.
3. For the Supabase pages, run `supabase/schema.sql` in the SQL editor.
4. `npm run dev` (port 3011), then sign in.

Deploying: the Vercel project `able-dashboard` in the ABLE team builds this repo (`vercel.json` pins the Next.js framework). Set the same environment variables there.

## Customising

- **Name and logo:** `NEXT_PUBLIC_APP_NAME`, and the icons in `public/` (generated from Able's app icon).
- **Colours:** `src/app/globals.css` (`--color-app-*` and `--color-cat-*` tokens) and the theme presets in `src/lib/theme.ts`. Charts read the same tokens through `src/lib/chartTheme.ts`.
