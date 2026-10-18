"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Loader2, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import FinCard from "@/components/ui/FinCard";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Empty from "@/components/ui/Empty";
import RowMenu, { type RowAction } from "@/components/ui/RowMenu";
import DataTable, { ColumnsButton, useTablePrefs, type Column } from "@/components/ui/DataTable";
import { PlatformPill } from "@/components/creators/PlatformBadge";
import { STAT_NEGATIVE, STAT_NEUTRAL } from "@/lib/statColors";
import { fmtInt, fmtUsd } from "@/lib/chartTheme";
import { useAbleReport } from "@/lib/useAbleReport";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { SCRAPING_OFF, useCreatorEditor } from "./CreatorForm";
import {
  CREATORS_PATH,
  CREATORS_REFRESH_MS,
  STATUS_BADGE,
  creatorHandles,
  fmtDayUtc,
  handleUrl,
  updatedLabel,
  type CreatorRow,
  type CreatorsReport,
} from "./creatorTypes";

const usd2 = (n: number | null | undefined) => fmtUsd(n, 2);
const sub = "text-[11px] leading-snug text-ink-faint";
const num = (n: number) => <span className="num">{fmtInt(n)}</span>;

function buildColumns(opts: {
  feedBusy: ReadonlySet<string>;
  actions?: (c: CreatorRow) => RowAction[];
}): Column<CreatorRow>[] {
  const cols: Column<CreatorRow>[] = [
    {
      key: "creator",
      header: "Creator",
      width: 210,
      hideable: false,
      sortValue: (c) => c.name.toLowerCase(),
      cell: (c) => (
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Link href={`/creators/${encodeURIComponent(c.id)}`} className="truncate font-medium text-ink transition-colors hover:text-app-blue-light">
              {c.name}
            </Link>
            {opts.feedBusy.has(c.id) && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-ink-faint" aria-label="Refreshing feed" />}
          </div>
          <div className={cn(sub, "truncate")} title={c.dealNotes || undefined}>
            {c.kind}
            {c.dealNotes ? `, ${c.dealNotes}` : ""}
          </div>
          {c.scrapeError && (
            <div className="truncate text-[11px] leading-snug text-app-red-text" title={c.scrapeError}>
              {c.scrapeError}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "handles",
      header: "Handles",
      width: 170,
      cell: (c) => {
        const handles = creatorHandles(c);
        if (!handles.length) return <span className="text-ink-faint">None</span>;
        return (
          <div className="space-y-0.5">
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
      width: 140,
      sortValue: (c) => c.codes.join(","),
      cell: (c) =>
        c.codes.length ? (
          <div className="flex flex-wrap gap-1 whitespace-normal">
            {c.perCode.map((p) => (
              <span
                key={p.code}
                className="rounded-md bg-white/[0.04] px-1.5 py-0.5 font-mono text-[11px] text-ink-muted"
                title={`${p.signups.toLocaleString()} signups, ${p.carded.toLocaleString()} with a card`}
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
      width: 130,
      sortValue: (c) => c.status,
      cell: (c) => (
        <div>
          <Badge variant={STATUS_BADGE[c.status] ?? "default"}>{c.status}</Badge>
          <div className={sub} title="Deal start (UTC) and days live">
            {fmtDayUtc(c.startedAt)}, {fmtInt(c.daysLive)} days
          </div>
        </div>
      ),
    },
    { key: "fee", header: "Fee", width: 95, align: "right", sortValue: (c) => c.feeCents, cell: (c) => <span className="num">{usd2(c.feeUsd)}</span> },
    { key: "signups", header: "Signups", width: 85, align: "right", sortValue: (c) => c.signups, cell: (c) => num(c.signups) },
    { key: "cards", header: "With a card", width: 90, align: "right", sortValue: (c) => c.carded, cell: (c) => num(c.carded) },
    { key: "spenders", header: "Spenders", width: 85, align: "right", sortValue: (c) => c.spenders, cell: (c) => num(c.spenders) },
    { key: "spend", header: "Card spend", width: 105, align: "right", sortValue: (c) => c.spendUsd, cell: (c) => <span className="num">{usd2(c.spendUsd)}</span> },
    {
      key: "costPerSignup",
      header: "Cost per signup",
      width: 105,
      align: "right",
      sortValue: (c) => c.costPerSignupUsd ?? Number.POSITIVE_INFINITY,
      cell: (c) => <span className="num">{usd2(c.costPerSignupUsd)}</span>,
    },
    {
      key: "costPerCard",
      header: "Cost per card",
      width: 105,
      align: "right",
      sortValue: (c) => c.costPerCardUsd ?? Number.POSITIVE_INFINITY,
      cell: (c) => <span className="num">{usd2(c.costPerCardUsd)}</span>,
    },
    { key: "posts", header: "Counted posts", width: 90, align: "right", sortValue: (c) => c.countedPosts, cell: (c) => num(c.countedPosts) },
    { key: "views", header: "Counted views", width: 100, align: "right", sortValue: (c) => c.countedViews, cell: (c) => num(c.countedViews) },
    { key: "avgViews", header: "Avg views", width: 90, align: "right", sortValue: (c) => c.avgViewsPerPost, cell: (c) => num(c.avgViewsPerPost) },
    {
      key: "cpm",
      header: "CPM",
      width: 85,
      align: "right",
      sortValue: (c) => c.cpmUsd ?? Number.POSITIVE_INFINITY,
      cell: (c) => <span className="num">{usd2(c.cpmUsd)}</span>,
    },
    {
      key: "pending",
      header: "Pending",
      width: 80,
      align: "right",
      sortValue: (c) => c.pendingPosts,
      cell: (c) =>
        c.pendingPosts ? <Badge variant="warning" className="num">{fmtInt(c.pendingPosts)}</Badge> : <span className="num">0</span>,
    },
    {
      key: "lastPost",
      header: "Last post",
      width: 115,
      sortValue: (c) => c.lastPostedAt ?? "",
      cell: (c) => (
        <div>
          <div>{fmtDayUtc(c.lastPostedAt)}</div>
          <div className={sub}>Scraped {fmtDayUtc(c.lastScrapedAt)}</div>
        </div>
      ),
    },
  ];
  if (opts.actions) {
    const actions = opts.actions;
    cols.push({
      key: "actions",
      header: "",
      width: 48,
      clip: false,
      hideable: false,
      cell: (c) => <RowMenu actions={actions(c)} label={`Actions for ${c.name}`} />,
    });
  }
  return cols;
}

function scrapingNote(scraping: CreatorsReport["scraping"]): string {
  if (!scraping.enabled) return "SCRAPECREATORS_API_KEY not set";
  if (!scraping.credits) return "Feeds refresh every 8 hours";
  return `${fmtInt(scraping.credits.remaining)} credits left on ${fmtDayUtc(scraping.credits.at, { year: false })}`;
}

export default function Creators() {
  const { data, at, error, loading, refresh } = useAbleReport<CreatorsReport>(CREATORS_PATH, { refreshMs: CREATORS_REFRESH_MS });
  const canEdit = useAuth().can("creators:write");
  const editor = useCreatorEditor({ report: data, refresh });
  const { openEdit, askRemove, refreshFeed, feedBusy, scrapingOn } = editor;

  const columns = useMemo(
    () =>
      buildColumns({
        feedBusy,
        actions: canEdit
          ? (c) => [
              { label: "Edit", icon: Pencil, onClick: () => openEdit(c) },
              // Only a feed with a handle can be pulled, and only while scraping is on.
              ...(scrapingOn && creatorHandles(c).length && !feedBusy.has(c.id)
                ? [{ label: "Refresh feed", icon: RefreshCw, onClick: () => void refreshFeed(c) }]
                : []),
              { label: "Remove", icon: Trash2, danger: true, onClick: () => askRemove(c) },
            ]
          : undefined,
      }),
    [feedBusy, canEdit, scrapingOn, openEdit, askRemove, refreshFeed],
  );
  const prefs = useTablePrefs("able-creators", columns);
  const creators = useMemo(() => data?.creators ?? [], [data]);
  const t = data?.totals;
  const allBusy = feedBusy.has("*");

  return (
    <div className="space-y-3">
      <PageHeader
        title="Creators"
        subtitle={updatedLabel(at)}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => void refresh()} disabled={loading}>
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
            </Button>
            {canEdit && data && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void refreshFeed()}
                  disabled={!scrapingOn || allBusy}
                  title={scrapingOn ? "Scrape every creator's feeds now. Spends ScrapeCreators credits." : SCRAPING_OFF}
                >
                  {allBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh all feeds
                </Button>
                <Button size="sm" onClick={editor.openAdd}>
                  <Plus className="h-3.5 w-3.5" /> Add creator
                </Button>
              </>
            )}
          </>
        }
      />

      {error && <div className="rounded-lg border border-app-red/30 bg-app-red/10 px-3 py-2 text-sm text-app-red-text">{error}</div>}

      {!data || !t ? (
        loading || !error ? (
          <div className="flex items-center justify-center py-24 text-ink-muted">
            <Loader2 className="mr-2 h-6 w-6 animate-spin" /> Loading creators…
          </div>
        ) : null
      ) : (
        <div className={cn("space-y-3 transition-opacity", loading && "opacity-60")}>
          <div className="app-stat-grid grid">
            <FinCard label="Creators" valueClass={STAT_NEUTRAL} note={`${fmtInt(t.active)} active`}>
              {fmtInt(t.creators)}
            </FinCard>
            <FinCard label="Fees committed" valueClass={STAT_NEGATIVE} note="USD, every deal on the roster">
              {usd2(t.feeUsd)}
            </FinCard>
            <FinCard label="Signups" valueClass={STAT_NEUTRAL} note="Typed a creator's invite code">
              {fmtInt(t.signups)}
            </FinCard>
            <FinCard label="Users with a card" valueClass={STAT_NEUTRAL} note="Of those signups">
              {fmtInt(t.carded)}
            </FinCard>
            <FinCard label="Spenders" valueClass={STAT_NEUTRAL} note="Of those signups">
              {fmtInt(t.spenders)}
            </FinCard>
            <FinCard label="Card spend" valueClass={STAT_NEUTRAL} note="USD, by those signups">
              {usd2(t.spendUsd)}
            </FinCard>
            <FinCard label="Cost per signup" valueClass={STAT_NEUTRAL} note="USD fees per signup">
              {usd2(t.costPerSignupUsd)}
            </FinCard>
            <FinCard label="Cost per card" valueClass={STAT_NEUTRAL} note="USD fees per user with a card">
              {usd2(t.costPerCardUsd)}
            </FinCard>
            <FinCard label="Counted views" valueClass={STAT_NEUTRAL} note={`${fmtInt(t.countedPosts)} counted posts, last 90 days`}>
              {fmtInt(t.countedViews)}
            </FinCard>
            <FinCard label="CPM" valueClass={STAT_NEUTRAL} note="USD fees per 1,000 counted views">
              {usd2(t.cpmUsd)}
            </FinCard>
            <FinCard label="Pending posts" valueClass={t.pendingPosts ? "text-app-orange" : STAT_NEUTRAL} note="Waiting for approve or exclude">
              {fmtInt(t.pendingPosts)}
            </FinCard>
            <FinCard label="Scraping" valueClass={data.scraping.enabled ? "text-app-green" : "text-ink-faint"} note={scrapingNote(data.scraping)}>
              {data.scraping.enabled ? "On" : "Off"}
            </FinCard>
          </div>

          <Card
            title={`Roster (${fmtInt(creators.length)})`}
            actions={<ColumnsButton columns={columns} hidden={prefs.hidden} toggleHidden={prefs.toggleHidden} />}
            bodyClassName="p-0"
          >
            {creators.length ? (
              <DataTable
                className="max-h-[32rem]"
                columns={columns}
                rows={creators}
                rowKey={(c) => c.id}
                hidden={prefs.hidden}
                widths={prefs.widths}
                setWidths={prefs.setWidths}
              />
            ) : (
              <Empty
                compact
                title="No creators yet"
                action={
                  canEdit ? (
                    <Button size="sm" onClick={editor.openAdd}>
                      <Plus className="h-3.5 w-3.5" /> Add creator
                    </Button>
                  ) : undefined
                }
              />
            )}
            <p className="border-t border-white/[0.06] px-3 py-2 text-[11px] leading-snug text-ink-faint">
              Signups, cards and spend: users who typed one of the creator&apos;s invite codes at signup. Views: counted posts from
              the creator&apos;s feed, scraped every 8 hours. Influencers and YouTubers count approved work only; UGC and brand
              accounts count every post not excluded. CPM: fee per 1,000 counted views. Money in USD.
            </p>
          </Card>

          {data.unclaimedCodes.length > 0 && (
            <Card title="Codes with signups that no creator claims">
              <div className="flex flex-wrap gap-1.5">
                {data.unclaimedCodes.map((u) => (
                  <span key={u.code} className="rounded-md border border-white/[0.06] bg-white/[0.03] px-2 py-0.5 text-xs text-ink-muted">
                    <span className="font-mono text-ink">{u.code}</span>{" "}
                    <span className="num">
                      {fmtInt(u.signups)} signups, {fmtInt(u.carded)} with a card
                    </span>
                  </span>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
      {editor.dialogs}
    </div>
  );
}
