"use client";

import { useMemo, useState } from "react";
import Tabs from "@/components/ui/Tabs";
import { ReportError, ReportLoading } from "@/components/ui/ReportState";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import FinCard from "@/components/ui/FinCard";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Empty from "@/components/ui/Empty";
import DataTable, { ColumnsButton, useTablePrefs } from "@/components/ui/DataTable";
import { PlatformPill } from "@/components/creators/PlatformBadge";
import { fmtCompact } from "@/components/creators/PostBits";
import { STAT_NEUTRAL } from "@/lib/statColors";
import { ACCENT, CHART, CHART_H, TOOLTIP_STYLE, axisProps, fmtInt, fmtUsd } from "@/lib/chartTheme";
import { useAbleReport } from "@/lib/useAbleReport";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { SCRAPING_OFF, useCreatorEditor } from "./CreatorForm";
import { buildPostColumns } from "./Posts";
import {
  CREATORS_PATH,
  CREATORS_REFRESH_MS,
  KIND_RULE,
  STATUS_BADGE,
  creatorHandles,
  fmtDayUtc,
  handleUrl,
  medianViewsByCreator,
  updatedLabel,
  weekStartUtc,
  type CreatorsReport,
} from "./creatorTypes";

const usd2 = (n: number | null | undefined) => fmtUsd(n, 2);
const termCls = "text-[10px] font-medium uppercase tracking-[0.06em] text-ink-faint";
const viewsTooltip = (v: number) => [fmtInt(v), "Counted views"];

export default function CreatorDetail({ id }: { id: string }) {
  const router = useRouter();
  const [tab, setTab] = useState("performance");
  const { data, at, error, loading, refresh } = useAbleReport<CreatorsReport>(CREATORS_PATH, { refreshMs: CREATORS_REFRESH_MS });
  const canEdit = useAuth().can("creators:write");
  const editor = useCreatorEditor({ report: data, refresh });
  const { setPostFlag, postBusy, feedBusy, scrapingOn } = editor;

  const creator = useMemo(() => data?.creators.find((c) => c.id === id) ?? null, [data, id]);
  const byId = useMemo(() => new Map((data?.creators ?? []).map((c) => [c.id, c])), [data]);
  const posts = useMemo(() => (data?.posts ?? []).filter((p) => p.creatorId === id), [data, id]);
  const medians = useMemo(() => medianViewsByCreator(posts), [posts]);

  const columns = useMemo(
    () =>
      buildPostColumns({
        byId,
        medians,
        showCreator: false,
        edit: canEdit ? { busy: postBusy, onFlag: (p, a) => void setPostFlag(p, a) } : undefined,
      }),
    [byId, medians, canEdit, postBusy, setPostFlag],
  );
  const prefs = useTablePrefs("able-creator-detail-posts", columns);

  // Counted posts by the Monday-start UTC week they were posted, gaps filled with 0.
  const weekly = useMemo(() => {
    const byWeek = new Map<string, { views: number; posts: number }>();
    for (const p of posts) {
      if (!p.counts) continue;
      const wk = weekStartUtc(p.postedAt);
      const w = byWeek.get(wk) ?? { views: 0, posts: 0 };
      w.views += p.viewCount;
      w.posts++;
      byWeek.set(wk, w);
    }
    const weeks = [...byWeek.keys()].sort();
    if (!weeks.length) return [];
    const out: Array<{ label: string; full: string; views: number; posts: number }> = [];
    for (let t = Date.parse(`${weeks[0]}T00:00:00Z`), end = Date.parse(`${weeks[weeks.length - 1]}T00:00:00Z`); t <= end; t += 7 * 86_400_000) {
      const wk = new Date(t).toISOString().slice(0, 10);
      const w = byWeek.get(wk) ?? { views: 0, posts: 0 };
      out.push({ label: fmtDayUtc(wk, { year: false }), full: `Week of ${fmtDayUtc(wk)}`, ...w });
    }
    return out;
  }, [posts]);

  const goToRoster = () => router.push("/creators");
  const feedRefreshing = creator ? feedBusy.has(creator.id) : false;
  const handles = creator ? creatorHandles(creator) : [];

  if (!data) {
    return (
      <div className="space-y-3">
        <PageHeader title="Creator" subtitle={updatedLabel(at)} />
        {error ? (
          <ReportError error={error} onRetry={() => void refresh()} />
        ) : (
          <ReportLoading label="Loading creator" />
        )}
      </div>
    );
  }

  if (!creator) {
    return (
      <div className="space-y-3">
        <PageHeader title="Creator not found" subtitle={updatedLabel(at)} />
        <Empty
          title="No creator on the roster has this id"
          description="They may have been removed. Signups stay attributed to their codes."
          action={
            <Link href="/creators" className="text-sm text-app-blue-light hover:underline">
              Back to creators
            </Link>
          }
        />
      </div>
    );
  }

  const c = creator;
  return (
    <div className="space-y-3">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            <Link href="/creators" aria-label="Back to creators" title="Back to creators" className="text-ink-faint transition-colors hover:text-ink">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            {c.name}
            <Badge variant={STATUS_BADGE[c.status] ?? "default"}>{c.status}</Badge>
            <span title={KIND_RULE[c.kind]}>
              <Badge>{c.kind}</Badge>
            </span>
          </span>
        }
        subtitle={updatedLabel(at)}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => void refresh()} disabled={loading}>
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
            </Button>
            {canEdit && (
              <>
                <Button variant="secondary" size="sm" onClick={() => editor.openEdit(c)}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void editor.refreshFeed(c)}
                  disabled={!scrapingOn || !handles.length || feedRefreshing}
                  title={!scrapingOn ? SCRAPING_OFF : !handles.length ? "No handle to scrape" : "Scrape this creator's feeds now. Spends ScrapeCreators credits."}
                >
                  {feedRefreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh feed
                </Button>
                <Button variant="ghost" size="sm" className="text-app-red-text hover:text-app-red-text" onClick={() => editor.askRemove(c, goToRoster)}>
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </Button>
              </>
            )}
          </>
        }
      />

      {error && <ReportError error={error} onRetry={() => void refresh()} stale /> }

      <div className={cn("space-y-3 transition-opacity", loading && "opacity-60")}>
        <div className="app-headline-grid">
          <FinCard label="Signups" valueClass={STAT_NEUTRAL}>{fmtInt(c.signups)}</FinCard>
          <FinCard label="Users with a card" valueClass={STAT_NEUTRAL}>{fmtInt(c.carded)}</FinCard>
          <FinCard label="Card spend" valueClass={STAT_NEUTRAL}>{usd2(c.spendUsd)}</FinCard>
          <FinCard label="Counted views" valueClass={STAT_NEUTRAL}>{fmtInt(c.countedViews)}</FinCard>
        </div>
        <Tabs tabs={[{ key: "performance", label: "Performance" }, { key: "content", label: "Content" }, { key: "deal", label: "Deal details" }]} active={tab} onChange={setTab} />
        {tab === "deal" && (
        <Card>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3 lg:grid-cols-6">
            <div className="col-span-2 sm:col-span-1 lg:col-span-1">
              <dt className={termCls}>Handles</dt>
              <dd className="mt-0.5 space-y-0.5">
                {handles.length ? (
                  handles.map(({ platform, handle }) => (
                    <a
                      key={platform}
                      href={handleUrl(platform, handle)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-ink-muted transition-colors hover:text-app-blue-light"
                    >
                      <PlatformPill platform={platform} />
                      <span className="min-w-0 truncate">@{handle}</span>
                    </a>
                  ))
                ) : (
                  <span className="text-ink-faint">None</span>
                )}
              </dd>
            </div>
            <div>
              <dt className={termCls}>Invite codes</dt>
              <dd className="mt-0.5 flex flex-wrap gap-1">
                {c.codes.length ? (
                  c.codes.map((code) => (
                    <span key={code} className="rounded-md bg-white/[0.04] px-1.5 py-0.5 font-mono text-[11px] text-ink-muted">
                      {code}
                    </span>
                  ))
                ) : (
                  <span className="text-ink-faint">None</span>
                )}
              </dd>
            </div>
            <div>
              <dt className={termCls}>Fee (USD)</dt>
              <dd className="mt-0.5 num text-ink">{c.feeCents ? usd2(c.feeUsd) : "None, gifted deal"}</dd>
            </div>
            <div>
              <dt className={termCls}>Started (UTC)</dt>
              <dd className="mt-0.5 text-ink">
                {fmtDayUtc(c.startedAt)}
                <span className="text-ink-faint">, {fmtInt(c.daysLive)} days live</span>
              </dd>
            </div>
            <div>
              <dt className={termCls}>Feed</dt>
              <dd className="mt-0.5 text-ink-muted">
                Scraped {fmtDayUtc(c.lastScrapedAt)}, last post {fmtDayUtc(c.lastPostedAt)}
                {c.scrapeError && <div className="text-[11px] text-app-red-text">{c.scrapeError}</div>}
              </dd>
            </div>
            <div className="col-span-2 sm:col-span-3 lg:col-span-1">
              <dt className={termCls}>Deal notes</dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-ink-muted">{c.dealNotes || <span className="text-ink-faint">None</span>}</dd>
            </div>
          </dl>
        </Card>


        )}
        {tab === "performance" && <div className="space-y-4">
        <div className="app-stat-grid grid">
          <FinCard label="Spenders" valueClass={STAT_NEUTRAL} note="Of those signups">
            {fmtInt(c.spenders)}
          </FinCard>
          <FinCard label="Cost per signup" valueClass={STAT_NEUTRAL} note="USD fee per signup">
            {usd2(c.costPerSignupUsd)}
          </FinCard>
          <FinCard label="Cost per card" valueClass={STAT_NEUTRAL} note="USD fee per user with a card">
            {usd2(c.costPerCardUsd)}
          </FinCard>
          <FinCard label="Avg views" valueClass={STAT_NEUTRAL} note="Per counted post">
            {fmtInt(c.avgViewsPerPost)}
          </FinCard>
          <FinCard label="CPM" valueClass={STAT_NEUTRAL} note="USD fee per 1,000 counted views">
            {usd2(c.cpmUsd)}
          </FinCard>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Card title="Counted views by week posted, last 90 days" className="chart-card xl:col-span-2">
            {weekly.length ? (
              <ResponsiveContainer width="100%" height={CHART_H}>
                <BarChart data={weekly} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
                  <XAxis dataKey="label" {...axisProps} minTickGap={12} />
                  <YAxis {...axisProps} tickFormatter={fmtCompact} width={44} />
                  <Tooltip
                    {...TOOLTIP_STYLE}
                    labelFormatter={(_: unknown, items: Array<{ payload?: { full?: string; posts?: number } }>) => {
                      const p = items?.[0]?.payload;
                      return p ? `${p.full}, ${fmtInt(p.posts)} counted posts` : "";
                    }}
                    formatter={viewsTooltip}
                  />
                  <Bar dataKey="views" fill={ACCENT} radius={[4, 4, 0, 0]} maxBarSize={24} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: CHART_H }}>
                <Empty compact title="No counted posts yet" description={KIND_RULE[c.kind]} />
              </div>
            )}
          </Card>

          <Card title="Signups by invite code" bodyClassName="p-0">
            {c.perCode.length ? (
              <div className="max-h-[32rem] overflow-auto">
                <table className="text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06] text-left text-ink-faint">
                      <th className="font-medium">Code</th>
                      <th className="text-right font-medium">Signups</th>
                      <th className="text-right font-medium">With a card</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.perCode.map((p) => (
                      <tr key={p.code} className="border-b border-white/[0.04] last:border-0">
                        <td className="font-mono text-ink">{p.code}</td>
                        <td className="num text-right">{fmtInt(p.signups)}</td>
                        <td className="num text-right">{fmtInt(p.carded)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty compact title="No invite codes" description="Signups are attributed by code only." />
            )}
          </Card>
        </div>


        </div>}
        {tab === "content" && <div className="space-y-4">
          <p className="text-sm text-ink-muted">{fmtInt(c.countedPosts)} counted posts · {fmtInt(c.pendingPosts)} waiting for review</p>
        <Card
          title={`Scraped posts, last 90 days (${fmtInt(posts.length)})`}
          bodyClassName="p-0"
          actions={<ColumnsButton columns={columns} hidden={prefs.hidden} toggleHidden={prefs.toggleHidden} />}
        >
          {posts.length ? (
            <DataTable
              className="max-h-[32rem]"
              columns={columns}
              rows={posts}
              rowKey={(p) => p.id}
              hidden={prefs.hidden}
              widths={prefs.widths}
              setWidths={prefs.setWidths}
              defaultSort={{ key: "posted", dir: "desc" }}
            />
          ) : (
            <Empty compact title={handles.length ? "No posts scraped in the last 90 days" : "No handle to scrape"} />
          )}
          <p className="border-t border-white/[0.06] px-3 py-2 text-[11px] leading-snug text-ink-faint">{KIND_RULE[c.kind]}</p>
        </Card>

        </div>}
      </div>
      {editor.dialogs}
    </div>
  );
}
