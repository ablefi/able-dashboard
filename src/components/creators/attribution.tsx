"use client";

import { useEffect, useState } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import type { AttributionPayload, CreatorAttribution, Demographics } from "@/lib/attributionJob";
import { regionFlag, regionName } from "@/lib/countries";
import { creatorApi, useCreatorSection } from "@/lib/creatorMarketClient";

/**
 * Shared pieces for reading and showing creator attribution.
 *
 * All of it comes from one stored payload, recomputed by the 8-hourly cron, so
 * every page here is a cheap read rather than its own crawl.
 *
 * The rule running through these components: never show a rate without the
 * count it came from. Attribution has been collected since 15 Sep 2026 and the
 * numbers are still small, so "100% conversion" usually means one person. Each
 * component states its own denominator rather than trusting the reader to
 * remember.
 */

/** Below this, a percentage or an average says more about noise than reality. */
export const MIN_SAMPLE = 10;

let cached: AttributionPayload | null = null;
export function invalidateAttribution(){ cached = null; }

/** Fetches the stored payload once per page load and shares it. */
export function useAttribution(): { data: AttributionPayload | null; loading: boolean } {
  const [data, setData] = useState<AttributionPayload | null>(cached);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    // Revalidate on navigation so approvals made elsewhere are visible.
    let dead = false;
    (async () => {
      try {
        const r = await fetch(creatorApi("/api/creators/attribution"), { cache: "no-store" });
        const j = await r.json();
        if (dead) return;
        cached = j?.attribution ?? null;
        setData(cached);
      } catch {
        /* leave it null; every consumer renders an empty state */
      } finally {
        if (!dead) setLoading(false);
      }
    })();
    return () => { dead = true; };
  }, []);

  return { data, loading };
}

export function attributionFor(data: AttributionPayload | null, creatorId: string): CreatorAttribution | null {
  return data?.creators.find((c) => c.creatorId === (data?.personaByAccount?.[creatorId] ?? creatorId)) ?? null;
}

/**
 * A platform from which literally nobody has answered, app-wide.
 *
 * Returns "Android" when the question has reached iOS and not Android, or the
 * reverse, and null once both are represented. Read from the payload rather
 * than hardcoded, so it retires itself the day the other build ships.
 */
export function missingAnswerPlatform(data: AttributionPayload | null): string | null {
  const mix = data?.totals?.platformMix;
  if (!mix || mix.length === 0) return null;
  const seen = new Set(mix.filter((m) => m.count > 0).map((m) => m.name));
  if (seen.size !== 1) return null;
  if (seen.has("ios")) return "Android";
  if (seen.has("android")) return "iOS";
  return null;
}

const money = (n: number) => `$${n < 100 ? n.toFixed(2) : Math.round(n).toLocaleString()}`;

/**
 * Deliberately identical to the Stat on the views side of the creator page.
 * They sit side by side, so a smaller number or tighter padding here reads as
 * a mistake rather than a distinction.
 */
export function Stat({
  label, value, tone, onClick, hint,
}: {
  label: string; value: string; tone?: "green" | "blue"; onClick?: () => void; hint?: string;
}) {
  const colour = tone === "green" ? "text-app-green" : tone === "blue" ? "text-app-blue-light" : "text-ink";
  const body = (
    <>
      {/* nowrap: the info dot pushed "Avg / post (all)" onto a second line,
          which made that box taller and stretched its whole grid row, so the
          two columns stopped lining up again. */}
      <div className="flex items-center gap-1 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
        {label}
        {hint && <InfoDot text={hint} />}
      </div>
      <div className={`mt-1 num text-2xl font-semibold ${colour}`}>{value}</div>
    </>
  );
  const base = "rounded-xl border border-white/[0.06] bg-app-navy-card/40 px-4 py-3";
  if (!onClick) return <div className={base}>{body}</div>;
  return (
    <button onClick={onClick} className={`${base} w-full text-left transition-colors hover:border-app-blue/30 hover:bg-app-navy-card/60`}>
      {body}
    </button>
  );
}

/**
 * A small "i" that reveals its note in OUR tooltip, not the browser's.
 *
 * It used the native `title` attribute, which meant a one-second delay, OS
 * chrome that ignores the dark theme, and nothing at all on a click. This is a
 * plain hover popover in the dashboard's own styling, and it opens on focus
 * too so it is reachable from the keyboard.
 */
export function InfoDot({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <span
        role="button"
        tabIndex={0}
        aria-label={text}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}
        className="inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border border-white/25 text-[8px] font-bold leading-none text-ink-faint transition-colors hover:border-app-blue/50 hover:text-app-blue-light"
      >
        i
      </span>
      {/* Below the dot, not above. These stats sit at the top of their section,
          so a tooltip anchored above was rendering off the top of the page. */}
      {open && (
        <span
          role="tooltip"
          className="pointer-events-none absolute top-full left-1/2 z-30 mt-1.5 w-max max-w-[15rem] -translate-x-1/2 rounded-lg border border-white/[0.1] bg-app-navy px-2.5 py-1.5 text-[11px] font-normal normal-case tracking-normal text-ink-muted shadow-xl shadow-black/50"
        >
          {text}
        </span>
      )}
    </span>
  );
}

/**
 * Charts, not bars-in-a-list.
 *
 * Pies for the two-or-three-way splits (gender, geography) where the question
 * is "what share", bars for the ordered ones (age) where a pie would
 * scramble a sequence that has a natural order. Every tooltip and label still
 * carries the raw count, because the whole set is small enough that a
 * percentage on its own would flatter it.
 */

const PIE_COLORS = ["#3b82f6", "#ec4899", "#22d3ee", "#a78bfa", "#f59e0b", "#34d399", "#f472b6", "#60a5fa", "#fbbf24", "#94a3b8"];
const TICK = "#8499b3";
const GRID = "rgba(255,255,255,0.05)";

function ChartTip({ active, payload, total }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  const count = Number(p.value) || 0;
  return (
    <div className="rounded-lg border border-white/[0.1] bg-app-navy px-2.5 py-1.5 text-xs shadow-xl">
      <div className="text-ink">{p.payload?.name ?? p.name}</div>
      <div className="num text-ink-muted">
        {count} <span className="opacity-70">({Math.round((count / Math.max(total, 1)) * 100)}%)</span>
      </div>
    </div>
  );
}

function PieSplit({
  rows, height = 150, colors,
}: {
  rows: { name: string; count: number }[]; height?: number;
  /** Fix a colour per label, for splits where the colour should mean something. */
  colors?: Record<string, string>;
}) {
  const total = rows.reduce((s, r) => s + r.count, 0);
  const colourAt = (name: string, i: number) => colors?.[name] ?? PIE_COLORS[i % PIE_COLORS.length];
  if (!total) return <Nothing />;
  return (
    <div className="flex items-center gap-3">
      <ResponsiveContainer width="55%" height={height}>
        <PieChart>
          <Pie data={rows} dataKey="count" nameKey="name" innerRadius="52%" outerRadius="86%" paddingAngle={2} stroke="none">
            {rows.map((r, i) => <Cell key={i} fill={colourAt(r.name, i)} />)}
          </Pie>
          <Tooltip content={<ChartTip total={total} />} />
        </PieChart>
      </ResponsiveContainer>
      <ul className="min-w-0 flex-1 space-y-1">
        {rows.slice(0, 6).map((r, i) => (
          <li key={r.name} className="flex items-baseline gap-1.5 text-[11px]">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colourAt(r.name, i) }} />
            <span className="min-w-0 flex-1 truncate text-ink-muted">{r.name}</span>
            <span className="shrink-0 num text-ink-faint">
              {r.count} <span className="opacity-60">({Math.round((r.count / total) * 100)}%)</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BarSplit({ rows, height = 150 }: { rows: { name: string; count: number }[]; height?: number }) {
  const total = rows.reduce((s, r) => s + r.count, 0);
  if (!total) return <Nothing />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="name" tick={{ fill: TICK, fontSize: 10 }} axisLine={false} tickLine={false} interval={0} />
        <YAxis tick={{ fill: TICK, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} content={<ChartTip total={total} />} />
        <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={34} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function Nothing() {
  return <div className="flex h-[150px] items-center justify-center text-xs text-ink-faint">Nothing on record</div>;
}

const GENDER_LABEL: Record<string, string> = { male: "Male", female: "Female" };
const PLATFORM_LABEL: Record<string, string> = { ios: "iOS", android: "Android" };
/** Fixed per platform, so iOS is the same colour on every creator's page. */
const PLATFORM_COLORS: Record<string, string> = { iOS: "#60a5fa", Android: "#34d399" };
const relabel = (rows: { name: string; count: number }[], map: Record<string, string>) =>
  rows.map((r) => ({ ...r, name: map[r.name] ?? r.name }));

/**
 * Who a creator actually brings in: age, gender, geography.
 *
 * This is the part that is genuinely new. Until now a creator's audience was
 * inferred from their platform; this is the age and country of people who
 * installed BECAUSE of them.
 */
export function CreatorDemographics({
  demo, downloads, missingPlatform,
}: {
  demo: Demographics; downloads: number;
  /** A platform nobody has answered from, app-wide. Named so the platform
   *  chart can say why it is one-sided instead of implying a finding. */
  missingPlatform?: string | null;
}) {
  // No small-sample banner: every chart already carries its raw counts, and
  // the note repeated what "avg 27.9 from 10" says on its own.
  void downloads;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-x-6 gap-y-5 lg:grid-cols-2">
        <Block title="Age" note={demo.avgAge != null ? `avg ${demo.avgAge} from ${demo.ageCount}` : undefined}>
          <BarSplit rows={demo.ageBuckets} />
        </Block>
        <Block title="Gender">
          <PieSplit rows={relabel(demo.gender, GENDER_LABEL)} />
        </Block>
        <Block title="Geography">
          <PieSplit rows={demo.countries.map((c) => ({ name: `${regionFlag(c.code)} ${regionName(c.code) || c.code}`, count: c.count }))} />
        </Block>
        <Block title="Platform" note={demo.platformCount ? `from ${demo.platformCount}` : undefined}>
          <PieSplit rows={relabel(demo.platforms, PLATFORM_LABEL)} colors={PLATFORM_COLORS} />
          {missingPlatform && (
            /* Without this the chart reads 100% iOS and looks like a fact
               about the creator. It is a fact about the build: the question
               only ships on one platform so far. Driven by the payload, so it
               disappears on its own once the other platform answers. */
            <p className="mt-1.5 text-[11px] leading-snug text-app-orange/90">
              {missingPlatform} is not being asked this question yet, so nobody on it can appear here.
            </p>
          )}
        </Block>
      </div>
    </div>
  );
}

function Block({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">{title}</span>
        {note && <span className="text-[11px] text-ink-muted">{note}</span>}
      </div>
      {children}
    </div>
  );
}

/** The attribution card for one creator's detail page. */
export function CreatorAttributionCard({ attribution, loading }: { attribution: CreatorAttribution | null; loading: boolean }) {
  const [answersOpen, setAnswersOpen] = useState(false);
  if (loading) return <div className="h-24 animate-pulse rounded-xl bg-white/[0.03]" />;

  if (!attribution || attribution.downloads === 0) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-app-navy-card/40 px-4 py-5 text-sm text-ink-muted">
        <div className="mb-1 font-medium text-ink">Nobody has named this creator yet</div>
        Onboarding only started asking on 15 September, and only new signups are asked. A creator who posted before
        then can have brought people in without any of it showing here.
      </div>
    );
  }

  const { downloads, payers, revenue, spellings } = attribution;
  return (
    <>
      {/* Four boxes, all the same shape, no sub-lines. The answer list used to
          sit under them as its own row, which made this column taller than the
          views column beside it; it now hangs off Installs, which is the number
          those answers are. */}
      <div className="grid grid-cols-2 gap-3">
        <Stat
          label="Attributed installs"
          value={downloads.toLocaleString()}
          tone="blue"
          onClick={() => setAnswersOpen(true)}
          hint={`Counted from ${spellings.length} ${spellings.length === 1 ? "answer" : "answers"}. Click to read them.`}
        />
        <Stat label="Conversion to paying" value={`${((payers / downloads) * 100).toFixed(0)}%`} />
        <Stat label="Attributed revenue" value={money(revenue)} tone="green" />
        <Stat label="Revenue per install" value={money(revenue / downloads)} />
      </div>

      {answersOpen && (
        <AnswerSheet
          title={`${downloads} ${downloads === 1 ? "install" : "installs"}, from these answers`}
          subtitle="The exact wording people typed. If one of these is not this creator, that is what to tell me."
          rows={spellings.map((sp) => ({ label: sp.raw, count: sp.count }))}
          onClose={() => setAnswersOpen(false)}
        />
      )}
    </>
  );
}

/** Centre-screen sheet listing raw answers and their counts. */
function AnswerSheet({
  title, subtitle, rows, onClose,
}: {
  title: string; subtitle: string; rows: { label: string; count: number }[]; onClose: () => void;
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/[0.09] bg-app-navy-card shadow-2xl shadow-black/60">
        <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-ink">{title}</h3>
            <p className="mt-0.5 text-xs text-ink-faint">{subtitle}</p>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-md px-2 py-1 text-sm text-ink-muted transition-colors hover:bg-white/[0.06] hover:text-ink" aria-label="Close">
            ✕
          </button>
        </div>
        <ul className="divide-y divide-white/[0.04] overflow-auto px-5 py-2">
          {rows.map((r) => (
            <li key={r.label} className="flex items-baseline justify-between gap-3 py-2">
              <span className="min-w-0 break-words font-mono text-[12px] text-ink">{r.label}</span>
              <span className="shrink-0 num text-sm text-ink-muted">{r.count}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Places and People, side by side. Used in User Analysis under Acquisition. */
export function PlacesAndPeople({ data, loading }: { data: AttributionPayload | null; loading: boolean }) {
  const { base: creatorsBase } = useCreatorSection();
  if (loading) return <div className="h-64 animate-pulse rounded-xl bg-white/[0.03]" />;
  if (!data) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-app-navy-card/40 px-4 py-5 text-sm text-ink-muted">
        No attribution computed yet. It refreshes every 8 hours.
      </div>
    );
  }

  const people = data.creators;
  const peopleTotal = people.reduce((s, c) => s + c.downloads, 0);
  const placesTotal = data.places.reduce((s, p) => s + p.downloads, 0);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card title="Places" sub={`${placesTotal.toLocaleString()} answers named a channel`}>
        <Rows
          rows={data.places.map((p) => ({ key: p.id, label: p.display, downloads: p.downloads, payers: p.payers, revenue: p.revenue }))}
        />
      </Card>
      <Card title="People" sub={`${peopleTotal.toLocaleString()} answers named a creator on the roster`}>
        <Rows
          rows={people.map((c) => ({ key: c.creatorId, label: c.name, downloads: c.downloads, payers: c.payers, revenue: c.revenue }))}
          empty="Nobody has been named yet."
        />
        {data.unmatched.length > 0 && (
          /* One line, not a wall of chips. The list only grows, so rendering
             every unrecognised name inline would take over the card within
             weeks. The sheet is where you actually read them. */
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/[0.06] pt-2.5">
            <span className="text-[11px] text-ink-muted">
              Named, but not recognised
              <span className="ml-1.5 num text-ink-faint">{data.unmatched.length}</span>
            </span>
            <a href={`${creatorsBase}/attribution`} className="rounded-md border border-white/[0.1] px-2 py-0.5 text-[11px] font-medium text-app-blue-light">Review in Attribution</a>
          </div>
        )}
      </Card>


    </div>
  );
}

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-app-navy-card/40 p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {sub && <p className="mt-0.5 text-xs text-ink-faint">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

function Rows({ rows, empty = "Nothing yet." }: { rows: { key: string; label: string; downloads: number; payers: number; revenue: number }[]; empty?: string }) {
  if (!rows.length) return <div className="py-6 text-center text-xs text-ink-faint">{empty}</div>;
  return (
    <div className="max-h-[320px] overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-app-navy-card/95">
          <tr className="border-b border-white/[0.06] text-left">
            <Th>Source</Th>
            <Th right>Installs</Th>
            <Th right>Paid</Th>
            <Th right>Revenue</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-white/[0.04]">
              <td className="py-1.5 pr-3 text-ink">{r.label}</td>
              <td className="py-1.5 pr-3 text-right num text-ink-muted">{r.downloads.toLocaleString()}</td>
              <td className="py-1.5 pr-3 text-right num text-ink-muted">{r.payers.toLocaleString()}</td>
              <td className="py-1.5 text-right num font-medium text-app-green">{r.revenue > 0 ? money(r.revenue) : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`py-2 pr-3 text-[11px] font-semibold uppercase tracking-wider text-ink-faint ${right ? "text-right" : ""}`}>
      {children}
    </th>
  );
}
