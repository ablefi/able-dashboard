"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Shared post-card bits ported from jp-creators: thumbUrl (IG thumbnails
 * route through our proxy — IG CDN URLs are blocker-hostile and expire),
 * ExpandableCaption (tap to expand/collapse), and the gradient Sparkline.
 */

export function thumbUrl(post: { id: string; platform: string; thumbnail_url: string | null }): string | null {
  if (!post.thumbnail_url) return null;
  if (post.platform === "instagram") return `/api/creators/thumb/${post.id}`;
  return post.thumbnail_url;
}

export function fmtCompact(n: number): string {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
}

export function fmtRelative(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
  if (d <= 0) return "today";
  if (d === 1) return "1d ago";
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  return mo === 1 ? "1mo ago" : `${mo}mo ago`;
}

export function ExpandableCaption({
  text,
  className = "",
  clampLines = 2,
}: {
  text: string | null | undefined;
  className?: string;
  clampLines?: 1 | 2 | 3;
}) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const value = text ?? "";
  const empty = value.trim().length === 0;

  // Detect ACTUAL visual truncation (scrollHeight > clientHeight) rather than
  // guessing from character count — so any caption that's clipped is
  // expandable, including short ones that just wrap past the clamp. Re-measures
  // on resize and when expand/collapse toggles.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setOverflowing(el.scrollHeight > el.clientHeight + 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [value, expanded, clampLines]);

  if (empty) return <div className={`${className} text-ink-faint`}>(no caption)</div>;

  const clampClass = expanded
    ? "whitespace-pre-wrap"
    : clampLines === 1 ? "line-clamp-1" : clampLines === 3 ? "line-clamp-3" : "line-clamp-2";
  const interactive = overflowing || expanded;

  return (
    <div
      ref={ref}
      onClick={interactive ? (e) => { e.preventDefault(); e.stopPropagation(); setExpanded((v) => !v); } : undefined}
      className={`${className} ${clampClass} ${interactive ? "cursor-pointer transition-colors hover:text-jp-blue-light" : ""}`}
      title={interactive ? (expanded ? "Tap to collapse" : "Tap to expand") : undefined}
    >
      {value}
    </div>
  );
}

export function Sparkline({ values, width = 80, height = 24, className = "" }: { values: number[]; width?: number; height?: number; className?: string }) {
  const [id] = useState(() => `spark-${Math.random().toString(36).slice(2, 9)}`);
  if (values.length < 2) return <div className={`text-xs text-ink-faint ${className}`}>—</div>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);
  const points = values.map((v, i) => [i * stepX, height - ((v - min) / range) * height] as const);
  const path = points.map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`)).join(" ");
  const area = `${path} L${width},${height} L0,${height} Z`;

  return (
    <svg width={width} height={height} className={className} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
