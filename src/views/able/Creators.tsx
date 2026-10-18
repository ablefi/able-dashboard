"use client";

import { useMemo } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import FinCard from "@/components/ui/FinCard";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Empty from "@/components/ui/Empty";
import DataTable, { ColumnsButton, useTablePrefs, type Column } from "@/components/ui/DataTable";
import { PlatformPill } from "@/components/creators/PlatformBadge";
import { STAT_NEGATIVE, STAT_NEUTRAL } from "@/lib/statColors";
import { fmtInt, fmtUsd } from "@/lib/chartTheme";
import { useAbleReport } from "@/lib/useAbleReport";
import { cn } from "@/lib/utils";
import {
  CREATORS_PATH,
  CREATORS_REFRESH_MS,
  creatorHandles,
  fmtDayUtc,
  handleUrl,
  updatedLabel,
  type CreatorRow,
  type CreatorStatus,
  type CreatorsReport,
} from "./creatorTypes";

const STATUS_BADGE: Record<CreatorStatus, "success" | "warning" | "default"> = {
  active: "success",
  paused: "warning",
  ended: "default",
};

const usd2 = (n: number | null | undefined) => fmtUsd(n, 2);

const sub = "mt-0.5 text-[11px] leading-snug text-ink-faint";

const COLUMNS: Column<CreatorRow>[] = [
  {
    key: "creator",
    header: "Creator",
    width: 240,
    hideable: false,
    sortValue: (c) => c.name.toLowerCase(),
    cell: (c) => (
      <div className="whitespace-normal break-words">
        <div className="font-medium text-ink">{c.name}</div>
        <div className={sub}>{c.kind}</div>
        {c.dealNotes && <div className={sub}>{c.dealNotes}</div>}
        {c.scrapeError && <div className="mt-0.5 text-[11px] leading-snug text-app-red-text">{c.scrapeError}</div>}
      </div>
    ),
  },
  {
    key: "handles",
    header: "Handles",
    width: 190,
    cell: (c) => {
      const handles = creatorHandles(c);
      if (!handles.length) return <span className="text-ink-faint">None</span>;
      return (
        <div className="space-y-1">
          {handles.map(({ platform, handle }) => (
            <a
              key={platform}
              href={handleUrl(platform, handle)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-ink-muted transition-colors hover:text-app-blue-light"
              title={`Open @${handle}`}
            >
              <PlatformPill platform={platform} />
              <span className="min-w-0 truncate">@{handle}</span>
            </a>
          ))}
        </div>
      );
    },
  },
  {
    key: "codes",
    header: "Codes",
    width: 150,
    sortValue: (c) => c.codes.join(","),
    cell: (c) =>
      c.codes.length ? (
        <div className="flex flex-wrap gap-1 whitespace-normal">
          {c.perCode.map((p) => (
            <span
              key={p.code}
              className="rounded-md bg-white/[0.04] px-1.5 py-0.5 font-mono text-[11px] text-ink-muted"
              title={`${p.signups.toLocaleString()} signups, ${p.carded.toLocaleString()} cards`}
            >
              {p.code}
            </span>
          ))}
        </div>
      ) : (
        <span className="text-ink-faint">None</span>
      ),
  },
  {
    key: "status",
    header: "Status",
    width: 150,
    sortValue: (c) => c.status,
    cell: (c) => (
      <div>
        <Badge variant={STATUS_BADGE[c.status] ?? "default"}>{c.status}</Badge>
        <div className={sub}>
          Since {fmtDayUtc(c.startedAt)}, {fmtInt(c.daysLive)} days
        </div>
      </div>
    ),
  },
  { key: "fee", header: "Fee", width: 110, align: "right", sortValue: (c) => c.feeCents, cell: (c) => <span className="num">{usd2(c.feeUsd)}</span> },
  { key: "signups", header: "Signups", width: 100, align: "right", sortValue: (c) => c.signups, cell: (c) => <span className="num">{fmtInt(c.signups)}</span> },
  { key: "cards", header: "Cards", width: 90, align: "right", sortValue: (c) => c.carded, cell: (c) => <span className="num">{fmtInt(c.carded)}</span> },
  { key: "spend", header: "Card spend", width: 120, align: "right", sortValue: (c) => c.spendUsd, cell: (c) => <span className="num">{usd2(c.spendUsd)}</span> },
  {
    key: "costPerSignup",
    header: "Cost per signup",
    width: 120,
    align: "right",
    sortValue: (c) => c.costPerSignupUsd ?? Number.POSITIVE_INFINITY,
    cell: (c) => <span className="num">{usd2(c.costPerSignupUsd)}</span>,
  },
  {
    key: "costPerCard",
    header: "Cost per card",
    width: 120,
    align: "right",
    sortValue: (c) => c.costPerCardUsd ?? Number.POSITIVE_INFINITY,
    cell: (c) => <span className="num">{usd2(c.costPerCardUsd)}</span>,
  },
  { key: "posts", header: "Posts", width: 90, align: "right", sortValue: (c) => c.countedPosts, cell: (c) => <span className="num">{fmtInt(c.countedPosts)}</span> },
  { key: "views", header: "Views", width: 110, align: "right", sortValue: (c) => c.countedViews, cell: (c) => <span className="num">{fmtInt(c.countedViews)}</span> },
  { key: "avgViews", header: "Avg views", width: 110, align: "right", sortValue: (c) => c.avgViewsPerPost, cell: (c) => <span className="num">{fmtInt(c.avgViewsPerPost)}</span> },
  {
    key: "cpm",
    header: "CPM",
    width: 100,
    align: "right",
    sortValue: (c) => c.cpmUsd ?? Number.POSITIVE_INFINITY,
    cell: (c) => <span className="num">{usd2(c.cpmUsd)}</span>,
  },
  {
    key: "pending",
    header: "Pending",
    width: 100,
    align: "right",
    sortValue: (c) => c.pendingPosts,
    cell: (c) =>
      c.pendingPosts ? <Badge variant="warning" className="num">{fmtInt(c.pendingPosts)}</Badge> : <span className="num">0</span>,
  },
  {
    key: "lastPost",
    header: "Last post",
    width: 140,
    sortValue: (c) => c.lastPostedAt ?? "",
    cell: (c) => (
      <div>
        <div>{fmtDayUtc(c.lastPostedAt)}</div>
        <div className={sub}>Scraped {fmtDayUtc(c.lastScrapedAt)}</div>
      </div>
    ),
  },
];

function ScrapingLine({ scraping }: { scraping: CreatorsReport["scraping"] }) {
  if (!scraping.enabled) {
    return (
      <>Scraping is off: SCRAPECREATORS_API_KEY is not set on the API, so posts and views stay empty. Signups by code still work.</>
    );
  }
  const credits = scraping.credits
    ? `, ${fmtInt(scraping.credits.remaining)} ScrapeCreators credits left as of ${fmtDayUtc(scraping.credits.at)}`
    : "";
  return <>Scraping is on: feeds refresh every 8 hours{credits}.</>;
}

export default function Creators() {
  const { data, at, error, loading, refresh } = useAbleReport<CreatorsReport>(CREATORS_PATH, { refreshMs: CREATORS_REFRESH_MS });
  const prefs = useTablePrefs("able-creators", COLUMNS);
  const creators = useMemo(() => data?.creators ?? [], [data]);
  const t = data?.totals;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Creators"
        subtitle={updatedLabel(at)}
        actions={
          <Button variant="secondary" size="sm" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
          </Button>
        }
      />

      {error && <div className="rounded-lg border border-app-red/30 bg-app-red/10 px-4 py-2.5 text-sm text-app-red-text">{error}</div>}

      {!data || !t ? (
        loading || !error ? (
          <div className="flex items-center justify-center py-24 text-ink-muted">
            <Loader2 className="mr-2 h-6 w-6 animate-spin" /> Loading creators…
          </div>
        ) : null
      ) : (
        <div className={cn("space-y-4 transition-opacity", loading && "opacity-60")}>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            <FinCard label="Creators" valueClass={STAT_NEUTRAL} note={`${fmtInt(t.active)} active`}>
              {fmtInt(t.creators)}
            </FinCard>
            <FinCard label="Fees committed" valueClass={STAT_NEGATIVE} note="Across every deal on the roster">
              {usd2(t.feeUsd)}
            </FinCard>
            <FinCard
              label="Attributed signups"
              valueClass={STAT_NEUTRAL}
              note={`${fmtInt(t.carded)} got a card, ${fmtInt(t.spenders)} spent`}
            >
              {fmtInt(t.signups)}
            </FinCard>
            <FinCard
              label="Cost per signup"
              valueClass={STAT_NEUTRAL}
              note={t.costPerCardUsd == null ? "No cards attributed yet" : `${usd2(t.costPerCardUsd)} per card`}
            >
              {usd2(t.costPerSignupUsd)}
            </FinCard>
            <FinCard label="Counted views" valueClass={STAT_NEUTRAL} note={`${fmtInt(t.countedPosts)} counted posts, last 90 days`}>
              {fmtInt(t.countedViews)}
            </FinCard>
            <FinCard
              label="CPM"
              valueClass={STAT_NEUTRAL}
              note={t.cpmUsd == null ? "No counted views yet" : "Fees per thousand counted views"}
            >
              {usd2(t.cpmUsd)}
            </FinCard>
          </div>

          <Card
            title="Roster, deal terms, signups by code, and counted views"
            actions={
              <>
                <Badge variant={data.scraping.enabled ? "success" : "default"}>
                  {data.scraping.enabled ? "Scraping on" : "Scraping off"}
                </Badge>
                <ColumnsButton columns={COLUMNS} hidden={prefs.hidden} toggleHidden={prefs.toggleHidden} />
              </>
            }
            bodyClassName="p-0"
          >
            {creators.length ? (
              <DataTable
                columns={COLUMNS}
                rows={creators}
                rowKey={(c) => c.id}
                hidden={prefs.hidden}
                widths={prefs.widths}
                setWidths={prefs.setWidths}
              />
            ) : (
              <Empty compact title="No creators yet" />
            )}
            <div className="space-y-1.5 border-t border-white/[0.06] px-5 py-4 text-xs leading-relaxed text-ink-faint">
              <p>
                Signups, cards and spend are users who typed one of the creator&apos;s invite codes at signup. Posts and views
                come from the creator&apos;s own feed, scraped every 8 hours, and only counted posts feed the totals: for
                influencers and YouTubers that is approved work (a mention of our account, or approved by hand on the Posts
                page), never the whole channel. CPM is the fee per thousand counted views. Pending is scraped posts still
                waiting for a decision. Fees, spend, costs and CPM are in USD.
              </p>
              <p>
                <ScrapingLine scraping={data.scraping} />
              </p>
            </div>
          </Card>

          {data.unclaimedCodes.length > 0 && (
            <Card title="Codes with signups that no creator claims">
              <div className="flex flex-wrap gap-2">
                {data.unclaimedCodes.map((u) => (
                  <span key={u.code} className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-2.5 py-1 text-xs text-ink-muted">
                    <span className="font-mono text-ink">{u.code}</span>{" "}
                    <span className="num">
                      {fmtInt(u.signups)} signups, {fmtInt(u.carded)} cards
                    </span>
                  </span>
                ))}
              </div>
            </Card>
          )}

          <p className="text-xs text-ink-faint">Creators are added and edited by an operator with the API admin token.</p>
        </div>
      )}
    </div>
  );
}
