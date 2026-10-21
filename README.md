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

Google Workspace is the only login method. The server verifies Google's ID-token signature,
issuer, audience, expiry, nonce, verified email and hosted-domain claim. Both the email's
exact domain and Google's hosted domain must be `able.finance`. Personal Google accounts,
external domains and domain lookalikes are refused. The `hd` parameter on the Google
screen is only a hint; it is not the access control.

The authorization-code flow uses a signed, ten-minute, HttpOnly state cookie, a nonce and
PKCE. Tokens are exchanged server-side. The session contains the Google subject and email,
never Google access tokens or Able API credentials. Production cookies are Secure,
HttpOnly, SameSite=Lax and host-only (`__Host-` prefix). Sessions expire eight hours after
sign-in; heartbeats do not extend them. Protected pages check the session server-side and
every data API checks it independently. Mutating requests also require the exact dashboard
Origin. Password login, backend-admin login and all old `app_session` cookies are rejected,
even if their old environment variables are still set. Missing configuration fails closed.

### Configure Google and Vercel before deploying

1. In the Able Google Cloud organization, configure Google Auth Platform for an **Internal**
   audience and create a **Web application** OAuth client. Only `openid email` scopes are used.
2. Register the exact redirect URI: `https://YOUR-DASHBOARD-HOST/api/auth/google/callback`.
   For local development, separately register `http://localhost:3011/api/auth/google/callback`.
3. Set `DASHBOARD_URL` to the canonical origin (no path), `GOOGLE_CLIENT_ID`,
   `GOOGLE_CLIENT_SECRET`, and a strong `DASHBOARD_SESSION_SECRET` (for example,
   `openssl rand -base64 32`) in the Vercel project's environment. None is `NEXT_PUBLIC_`.
   Keep the existing scoped `API_TOKEN`, `CREATORS_API_TOKEN` and Supabase configuration.
4. Remove `DASHBOARD_PASSWORD` and unused `ADMIN_BACKEND_*` credentials. They no longer
   enable login. Optionally set `DASHBOARD_ALLOWED_EMAILS` to a comma-separated subset of
   staff emails; the allowlist is checked on every request, including existing sessions.
5. Redeploy, then verify an Able account can open a report and an outside account cannot.
   Old sessions must return to login; unauthenticated data API requests must return 401.

For previews, use a separate OAuth client, session secret, callback URI and canonical
`DASHBOARD_URL`. Unconfigured previews intentionally cannot sign in. HTTP is accepted
only for localhost outside production. Do not point a preview's configuration at production.

All staff get the former local login's scoped permissions, including creator editing;
backend admin pages and full admin credentials remain unavailable. Google Workspace MFA
and account lifecycle policies should be managed in the organization's Google admin console.
Disabling a Google account prevents new logins but does not immediately invalidate an
already issued dashboard cookie (maximum eight hours). To revoke existing access promptly,
set a narrower `DASHBOARD_ALLOWED_EMAILS` list and redeploy, or rotate the session secret
and redeploy to sign everyone out.

References: [Google token validation](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)
and [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect).

### Authentication checks

`npm test` exercises signed Google tokens, the complete callback with a mocked Google
exchange/JWKS endpoint, session expiry, legacy-login rejection, CSRF and every data route's
unauthenticated boundary. It needs no credentials or network. `npm run typecheck:auth`
checks the auth code, API routes and affected UI. The existing full `npm run typecheck`
currently reports unrelated Recharts formatter errors; the build already skips those checks.
`npm run test:smoke` checks the production build over HTTP using disposable credentials
and no upstream services. The Authentication workflow runs the focused typecheck, tests,
Next.js build and HTTP smoke checks on PRs.

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
