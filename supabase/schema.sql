-- Tables the dashboard reads and writes in Supabase (Postgres).
-- Columns match what the code uses; adjust types/indexes to taste.
-- Enable RLS on every table: the dashboard talks to Supabase only from its own
-- server routes with the service-role key, which bypasses RLS.

create type creator_type as enum ('influencer', 'daily_ugc', 'youtuber', 'persona', 'ambassador', 'other');
create type creator_status as enum ('active', 'paused', 'archived');
create type platform_type as enum ('instagram', 'tiktok', 'youtube');

-- Creators and prospects share one table, told apart by tags:
--   'roster'   = a creator you work with, 'prospect' = someone you're evaluating,
--   'resp:<x>' = who looks after them, 'market:alt' = optional second market.
create table creators (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  instagram_handle text,
  tiktok_handle text,
  youtube_handle text,
  type creator_type not null default 'influencer',
  status creator_status not null default 'active',
  tags text[] not null default '{}',
  parent_id uuid references creators(id) on delete set null,  -- persona -> child accounts
  profile_image_url text,
  region text,
  -- deal terms
  deal_type text,
  rate_per_view numeric,
  flat_fee numeric,
  cpm_rate numeric,
  posts_per_month integer,
  hybrid_base numeric,
  hybrid_cpm numeric,
  -- scraping + attribution
  last_scraped_at timestamptz,
  scrape_status jsonb,
  attribution_names text[],   -- spellings people type for this creator ("how did you hear about us")
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table posts (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators(id) on delete cascade,
  platform platform_type not null,
  external_id text not null,
  url text,
  thumbnail_url text,
  media_urls text[],
  caption text,
  hashtags text[],
  view_count integer default 0,
  like_count integer default 0,
  comment_count integer default 0,
  posted_at timestamptz,
  discovered_at timestamptz default now(),
  created_at timestamptz not null default now(),
  approved boolean not null default false,   -- counts toward creator stats
  excluded boolean not null default false,
  is_outlier boolean not null default false,
  archive_status text,
  archive_video_url text,
  archived_at timestamptz,
  archive_error text,
  published_to_top boolean not null default false,
  unique (platform, external_id)
);

-- One row per post per day, for view growth charts.
create table view_snapshots (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  view_count integer not null,
  snapshot_at timestamptz not null default now(),
  snapshot_date date not null default current_date
);

-- Daily app metrics (e.g. from RevenueCat), used by the home page.
create table revenue_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_date date not null unique,
  active_trials integer,
  active_subscriptions integer,
  mrr numeric,
  revenue numeric,
  new_revenue numeric,
  renewal_revenue numeric,
  new_customers integer,   -- shown as "Downloads"
  new_paid_subs integer,
  active_users integer,
  transactions integer,
  created_at timestamptz not null default now()
);

-- Key/value store for config, caches and job state.
create table app_state (
  key text primary key,
  value jsonb,
  updated_at timestamptz not null default now()
);

-- Website analytics (written by your website's tracking endpoint).
create table page_views (
  id bigserial primary key,
  path text not null,
  referrer text,
  country text,
  device text,
  os text,
  created_at timestamptz not null default now()
);

-- Competitor apps (Growth → Competitors). Rankings are cached in app_state
-- under `competitor_rankings`; the remaining columns are optional metadata.
create table competitors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  app_store_id text,
  instagram_handle text,
  tiktok_handle text,
  youtube_handle text,
  website text,
  notes text,
  app_store_price text,
  app_store_rating numeric,
  app_store_review_count integer not null default 0,
  has_free_trial boolean,
  iap_tiers text,
  followers_ig integer not null default 0,
  followers_tt integer not null default 0,
  followers_yt integer not null default 0,
  app_icon_url text,
  genre_id integer,
  last_refreshed timestamptz,
  created_at timestamptz not null default now()
);

-- Per-creator counted posts/views in a period (approved, not excluded posts).
create or replace function creator_roster_stats(p_from timestamptz, p_to timestamptz)
returns table (creator_id uuid, counted_posts integer, counted_views bigint, last_posted_at timestamptz)
language sql stable as $$
  select p.creator_id,
         count(*)::int as counted_posts,
         coalesce(sum(p.view_count), 0)::bigint as counted_views,
         max(p.posted_at) as last_posted_at
  from posts p
  where p.approved and not p.excluded and p.posted_at between p_from and p_to
  group by p.creator_id;
$$;

alter table creators enable row level security;
alter table posts enable row level security;
alter table view_snapshots enable row level security;
alter table revenue_snapshots enable row level security;
alter table app_state enable row level security;
alter table page_views enable row level security;
alter table competitors enable row level security;
