/**
 * Shared Recharts styling for the Able API report pages.
 *
 * Colours are CSS variables, not hex, so the theme picker restyles charts
 * live along with everything else. SVG presentation attributes accept var().
 */

export const CHART = {
  grid: "var(--color-rule)",
  tick: "var(--color-ink-faint)",
  tickFont: 11,
};

export const TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: "var(--color-app-navy-raised)",
    border: "1px solid var(--color-rule)",
    borderRadius: "8px",
    fontSize: 12,
  },
  labelStyle: { color: "var(--color-ink)" },
  itemStyle: { color: "var(--color-ink)" },
  cursor: { fill: "rgba(0,0,0,0.04)" },
};

/** Categorical series, one hue light to dark (see --color-cat-* in globals.css). */
export const SERIES = [
  "var(--color-cat-3)",
  "var(--color-cat-1)",
  "var(--color-cat-5)",
  "var(--color-cat-2)",
  "var(--color-cat-4)",
  "var(--color-cat-6)",
];

/** Money in / out, matching statColors. */
export const MONEY_IN = "var(--color-app-green)";
export const MONEY_OUT = "var(--color-app-red-text)";
export const ACCENT = "var(--color-app-blue-light)";

/** Standard chart heights: a full panel and a compact one in a 3-up grid. */
export const CHART_H = 200;
export const CHART_H_SM = 160;

export const axisProps = {
  tick: { fill: CHART.tick, fontSize: CHART.tickFont },
  tickLine: false,
  axisLine: false,
} as const;

export const fmtInt = (n: number | null | undefined) => (n == null ? "-" : Math.round(n).toLocaleString());
export const fmtUsd = (n: number | null | undefined, digits = 0) =>
  n == null ? "-" : `$${n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
export const fmtPct = (n: number | null | undefined, digits = 1) => (n == null ? "-" : `${n.toFixed(digits)}%`);
