# Able Dashboard

Marketing operations dashboard for Able: creator roster, post tracking, content
performance, referral codes, user analysis and website analytics.

This is a stripped fork of a working dashboard built for another app. All of
that app's product features, data and credentials have been removed. What
remains is the marketing machinery, which is the part that transfers.

**There is no login.** Every page is reachable by anyone who can reach the
deployment. If access control is wanted, the simplest route is Vercel's
built-in password protection on the project. Nothing in the app needs to change
for that.

---

## Stack

- Next.js 16 (App Router), React 19, Tailwind v4, Recharts
- Supabase over PostgREST for the dashboard's own tables (server-side only,
  service-role key)
- Able's backend for user and revenue data (not yet wired up)
- ScrapeCreators for pulling creator posts
- Deployed on Vercel

## Getting it running

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill it in
3. Create the Supabase tables (below)
4. `npm run dev`

Nothing is pre-configured. The app boots with every environment variable blank
and renders empty pages rather than crashing, so you can wire it up one piece
at a time.

---

## What you need to create

### 1. A new Supabase project

The dashboard owns its own marketing tables. These are not Able's product data,
they are the record of what creators posted and what it did. The code expects
these tables to exist:

| Table | What it holds |
|---|---|
| `creators` | The roster. One row per creator or persona, with their deal terms, rate, platform and handles |
| `posts` | Every post scraped from every creator's feed. `approved` marks the ones that count as sponsored work; `excluded` marks ones never to count |
| `view_snapshots` | Point-in-time view counts per post, so growth is measured over time rather than bucketed to the post date |
| `own_posts` | Posts from our own brand accounts |
| `competitors` | Competitor accounts being tracked |
| `page_views` | Website analytics |
| `revenue_snapshots` | Revenue over time |
| `expenses` | Spend records |
| `app_state` | Key/value config and cached state (`sc_credits`, `rc_auth_cookie`, `starting_capital`) |

Column shapes are inferred from `src/lib/supabaseRest.ts` and the views that
consume them. Start there when creating the schema.

### 2. Backend endpoints

Users, user analysis, referral codes and content read from Able's backend, not
from Supabase. The original called a NestJS backend under `/admin/*` and
authenticated by posting to `/admin/login` with a service credential.

Whoever owns Able's backend needs to either expose equivalent endpoints or
change the calls in `src/api/`. Until then, those pages render empty. Every
other page works without the backend.

### 3. A ScrapeCreators key

On Able's own account and billing. `/api/cron/refresh-all` runs every 8 hours
and re-scrapes every creator's feed.

---

## How the creator tracking works

This is the core of the dashboard and the part worth understanding.

1. Each creator in `creators` has their platform handles recorded.
2. The cron scrapes each creator's **entire** feed into `posts`, not just their
   sponsored work.
3. A post is auto-approved as sponsored work when the caption contains a real
   `@mention` of one of our accounts. The handles and matching rules live in
   **`src/lib/brand.ts`** and should be set to Able's real handles before the
   first scrape.
4. Anything not auto-approved can be approved by hand in the UI. `excluded`
   permanently removes a post from counting.
5. `view_snapshots` records view counts over time, so a video that spikes three
   days after posting is measured correctly rather than being attributed to its
   post date.
6. Performance views then compute counted views, cost, and cost per thousand
   views per creator.

The distinction that matters: **counted views, not whole-channel views.** A
creator with a 40M-view channel may have delivered 50k views of actual
sponsored work. Only approved posts count.

---

## Layout

```
src/app/(authed)/   pages, one folder per route
src/app/api/        server routes (Supabase and backend access)
src/views/          the large page components
src/components/     shared UI
src/lib/            server logic: supabaseRest, scrape, brand, auth
src/api/            client-side backend calls
```

## Notes

- `src/lib/auth.ts` is a no-op shim. `requireSession` always allows. It exists
  so the API routes keep their original shape and so a real session can be
  reinstated later without touching every route.
- Tailwind theme tokens are still named `jp-*` in `globals.css`. They are just
  class names and can be renamed whenever the design is revisited.
- The `NEXT_PUBLIC_ENV` variable controls the staging banner. Set it to
  `production` to hide it.
