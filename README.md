# Able Dashboard

Able's internal admin dashboard: creator (influencer) tracking, growth analytics, competitors, and, once Able's backend has admin endpoints, users and referral codes. Next.js 16 (App Router), React 19, Tailwind v4, Recharts.

Built on the admin dashboard template (the JustPray dashboard with its branding removed): dark navy surfaces, a blue accent, three navigation styles and a ⌘K command palette. All app-specific details live in environment variables and in `src/lib/brand.ts`. Nothing secret is in the code.

## Pages

| Section | Pages | Data |
|---|---|---|
| Dashboard | Home: creator views, plus revenue, downloads, subscriptions and App Store rating when their sources are configured, and a user globe for admins with `users:read` | Supabase, RevenueCat (optional), iTunes lookup |
| Creators | Prospects, Creators roster (with personas), creator detail, Attribution review, Posts (incl. Outliers), Calendar, Performance | Supabase, ScrapeCreators |
| Growth | Website Analytics, Competitors (App Store category rankings), App Store Reviews | Supabase, iTunes RSS |
| Users | Users, User Analysis | Able backend |
| Referral Codes | Codes, Code Analytics | Able backend |
| Admin Settings | Admin accounts and permissions (from the command palette) | Able backend |

Navigation comes in four styles (sidebar, rail, top bar, bottom bar), plus a ⌘K command palette and a theme/presentation picker.

## Sign-in

Two modes, chosen by environment:

- **Shared password (current).** Set `DASHBOARD_PASSWORD` (and optionally `DASHBOARD_ALLOWED_EMAILS`). The login form checks it on the dashboard's server and never calls the backend. Sessions get a fixed permission list (`LOCAL_PERMISSIONS` in `src/lib/auth.ts`): Home, Creators, Website Analytics, Prospects and Competitors. Users, Referral Codes, Admins and App Store Reviews stay hidden.
- **Backend admin accounts.** Remove `DASHBOARD_PASSWORD` and the form forwards to `POST /admin/login` on Able's backend, which returns each admin's own token and permission keys. Shared-password sessions stop working as soon as the variable is removed.

Either way the session is a signed httpOnly cookie (`DASHBOARD_SESSION_SECRET`), and every API route checks it with `requireSession`.

## Architecture

- **Able's backend** owns users, referral codes and admin accounts. These endpoints do not exist yet; the backend sections stay hidden until they do. The browser calls the backend directly with the admin's token:
  - `POST /admin/login` → `{ access_token, admin: { id, email, isSuperAdmin, permissions[] } }`
  - `GET /admin/users` (paged, `?page&limit&...filters`), `GET /admin/users/:id`, `GET /admin/users/:id/access`, `PATCH /admin/users/:id/toggle-status`, `DELETE /admin/users/:id`, `DELETE /admin/users/:id/permanent`, `POST /admin/users/:id/restore`
  - `GET/POST/PATCH/DELETE /admin/referral-codes[/:id]`, `POST /admin/referral-codes/:id/activate|deactivate|recover`, `GET /admin/referral-codes[/:id]/revenue-analytics`
  - `GET/POST/PATCH/DELETE /admin/admins[/:id]`, `POST /admin/admins/:id/set-password`, `POST /admin/admins/me/change-password`, `GET/POST/DELETE /admin/permissions[/:id]`
  - Paged responses look like `{ data: [...], meta: { total, page, limit, totalPages } }`.
- **Supabase** holds the dashboard's own data: creators, posts, view snapshots, daily revenue snapshots, competitors, a key/value `app_state` store, and website page views. Schema: [`supabase/schema.sql`](supabase/schema.sql). Only the dashboard's server routes (`src/app/api/*`) touch it, with the service-role key.
- **Integrations:** ScrapeCreators (creators' posts and view counts), iTunes RSS and lookup (Competitors rankings, App Store rating), RevenueCat (optional; Able does not currently use it).

### Permissions

Each admin has a list of permission keys (`users:read`, `creators:write`, …). `src/lib/permissions.ts` maps dashboard sections to keys, `src/lib/sections.ts` maps paths to sections, and `src/lib/nav.ts` hides anything an admin can't open. API routes enforce the same keys with `requireSession(req, ...)` in `src/lib/auth.ts`.

### Scheduled jobs (`vercel.json`)

- `/api/cron/refresh-all`: re-scrape creator posts every 8h. Authenticates with `CRON_SECRET`.

The template's attribution crons (`/api/cron/attribution`, `/api/cron/attribution-review`) read signup answers from the backend's `/admin/users`, so they are not scheduled yet. Add them back to `vercel.json` once those endpoints exist.

### Creator post auto-approval

A scraped post counts as sponsored work when its caption @mentions one of `BRAND_HANDLES` (default `able`, `ablefinance`, `able.finance`), uses the TikTok display-name form of `BRAND_DISPLAY_NAME` ("@Able Finance"), or links to `BRAND_LINK_DOMAINS` (`able.finance`). See `src/lib/scrape.ts`. Only approved, non-excluded posts count towards a creator's views.

### Competitors

Competitor apps live in the `competitors` table. Refresh Rankings checks each app's position in the Top Free Finance chart across about 50 storefronts and caches the result in `app_state.competitor_rankings`. Set `APPLE_APP_ID` once Able is on the App Store to pin Able to the top of the table.

### App Store Reviews

The Reviews page reads a queue from `app_state`; the sync itself is done by a worker outside this repo that holds the App Store Connect key. It is hidden in shared-password mode and has nothing to show until Able is on the App Store.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill it in.
3. Create the Supabase tables: run `supabase/schema.sql` in the SQL editor.
4. `npm run dev` (port 3011), then sign in.

Deploying: on Vercel, set the same environment variables. Crons only run on production deployments.

## Customising

- **Name and logo:** `NEXT_PUBLIC_APP_NAME`, and the icons in `public/` (generated from Able's app icon).
- **Colours:** `src/app/globals.css` (`--color-app-*` tokens) and the theme presets in `src/lib/theme.ts`.
- **User fields:** `src/api/usersApi.ts` (types), `src/views/Users.tsx` (columns, filters, CSV), `src/components/users/UserSettingsDrawer.tsx` (drawer), and `src/lib/userAnalysis.ts` with `src/views/UserAnalysis.tsx` (charts).
- **Second creator market (optional):** creators tagged `market:alt` form a separate section. See `src/lib/creatorMarket.ts`.
