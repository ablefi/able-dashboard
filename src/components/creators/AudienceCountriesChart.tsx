"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

interface AudienceRow { country: string; countryCode: string; count: number; percentage: number }

function flagEmoji(code: string): string | null {
  const c = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return null;
  return String.fromCodePoint(0x1f1e6 + (c.charCodeAt(0) - 65)) + String.fromCodePoint(0x1f1e6 + (c.charCodeAt(1) - 65));
}

/** Normalize the raw scrape_status.audience_country blob into sorted rows. */
function parseAudience(raw: unknown): AudienceRow[] {
  if (!raw) return [];
  const blob = raw as Record<string, unknown>;
  const list = (blob.audienceLocations ?? blob.audience_locations ?? blob) as unknown;
  if (!Array.isArray(list)) return [];
  return list
    .map((it) => {
      const r = it as Record<string, unknown>;
      const pctRaw = r.percentage;
      const pct = typeof pctRaw === "number" ? pctRaw : typeof pctRaw === "string" ? parseFloat(pctRaw.replace("%", "")) || 0 : 0;
      return { country: String(r.country ?? "Unknown"), countryCode: String(r.countryCode ?? r.country_code ?? ""), count: Number(r.count ?? 0), percentage: pct };
    })
    .filter((r) => r.country && r.percentage > 0)
    .sort((a, b) => b.percentage - a.percentage);
}

const PALETTE = ["#60a5fa", "#4fb8e8", "#34d399", "#a78bfa", "#fbbf24", "#f87171", "#e879f9", "#fb923c", "#22d3ee", "#a3e635", "#f472b6", "#94a3b8"];

/** Pie + country leaderboard. Ported from jp-creators. */
export function AudienceCountriesChart({ raw }: { raw: unknown }) {
  const rows = parseAudience(raw);
  if (rows.length === 0) return null;
  const total = rows.reduce((s, r) => s + r.count, 0);
  const data = rows.map((r, i) => ({ ...r, color: PALETTE[i % PALETTE.length] }));

  return (
    <div className="grid gap-4 sm:grid-cols-[1fr_1.2fr]">
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="percentage" nameKey="country" cx="50%" cy="50%" innerRadius={50} outerRadius={88} paddingAngle={data.length > 1 ? 1.5 : 0} stroke="rgba(11,20,38,0.6)" strokeWidth={2}>
              {data.map((d) => <Cell key={d.countryCode || d.country} fill={d.color} />)}
            </Pie>
            <Tooltip
              contentStyle={{ backgroundColor: "rgba(17,27,51,0.95)", border: "1px solid rgba(96,165,250,0.25)", borderRadius: "0.5rem", fontSize: "0.75rem", padding: "8px 12px" }}
              labelStyle={{ color: "#f0f4f8", fontWeight: 600 }}
              itemStyle={{ color: "#60a5fa" }}
              formatter={(_v, _n, props) => { const p = (props as { payload?: AudienceRow }).payload; return p ? [`${p.percentage.toFixed(2)}% (${p.count.toLocaleString()})`, p.country] : ["", ""]; }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="space-y-1.5 overflow-y-auto sm:max-h-60">
        {data.map((r) => {
          const flag = flagEmoji(r.countryCode);
          return (
            <li key={r.countryCode || r.country} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-xs hover:bg-white/[0.025]">
              <span className="flex min-w-0 items-center gap-2.5 text-ink">
                <span className="h-2.5 w-2.5 flex-shrink-0 rounded-sm" style={{ backgroundColor: r.color }} />
                {flag ? <span className="text-base leading-none" aria-hidden>{flag}</span> : null}
                <span className="truncate">{r.country}</span>
              </span>
              <span className="flex flex-shrink-0 items-baseline gap-2 text-ink-muted">
                <span className="num font-medium text-ink">{r.percentage.toFixed(1)}%</span>
                {total > 0 && <span className="num text-[10px] text-ink-faint">{r.count.toLocaleString()}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
