"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { geoOrthographic, geoPath, geoGraticule } from "d3-geo";
import { Globe2, Loader2 } from "lucide-react";
import { LAND_GEOMETRY, COUNTRY_POINTS } from "@/data/globe";
import { regionCodeFromName, regionFlag } from "@/lib/countries";
import { readCache } from "@/lib/swrCache";
import { CACHE_KEY } from "@/lib/userAnalysisRunner";

/**
 * Where our users are, on a slowly turning globe.
 *
 * Deliberately a decorative piece rather than an analysis tool — the numbers
 * live in User Analysis. The job here is to make the scale of the thing feel
 * real at a glance.
 *
 * Uses d3-geo's orthographic projection rather than hand-rolled trig, because
 * the hard part is clipping continents at the horizon: naively dropping the
 * far-side points leaves flat chords across Africa. d3 splits the rings along
 * the limb properly.
 *
 * Drawn to a canvas, not SVG. Reprojecting the coastline costs ~7ms a frame,
 * and as SVG that ran inside React's render — so every frame re-rendered the
 * component and handed the browser a fresh ~80KB path string to re-parse,
 * which dropped frames here and janked the rest of the dashboard. On canvas
 * the rotation never touches React at all; only hover does.
 */

type Row = { name: string; count: number };
type Point = { code: string; name: string; count: number; lon: number; lat: number };
type Plotted = Point & { x: number; y: number; r: number };

const SIZE = 460;
const R = SIZE / 2 - 26;
const GRATICULE = geoGraticule().step([20, 20]).precision(2)();

export default function UserGlobe() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [payingRows, setPayingRows] = useState<Row[]>([]);
  const [mode, setMode] = useState<"paying" | "all">("paying");
  const [total, setTotal] = useState(0);
  const [source, setSource] = useState<"server" | "local" | null>(null);
  const [hover, setHover] = useState<Point | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // The draw loop reads these rather than closing over state, so it can be
  // started once and never torn down as data or hover changes.
  const pointsRef = useRef<Point[]>([]);
  const plottedRef = useRef<Plotted[]>([]);
  const hoverRef = useRef<string | null>(null);
  const mouseRef = useRef<{ x: number; y: number } | null>(null);

  // Prefer the centrally-stored tally so this works on any machine; fall back
  // to whatever this browser happens to have cached from a local crawl.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/user-geo", { cache: "no-store" });
        const d = await res.json();
        if (!cancelled && d?.geo?.countries?.length) {
          setRows(d.geo.countries);
          setPayingRows(d.geo.paying ?? []);
          setTotal(d.geo.total || 0);
          setSource("server");
          return;
        }
      } catch {
        /* fall through to the local cache */
      }
      const cached = readCache<{ total: number; stats: { userCountryData?: Row[]; payingCountryData?: Row[] } | null }>(CACHE_KEY);
      if (cancelled) return;
      const local = cached?.data?.stats?.userCountryData;
      const localPaying = cached?.data?.stats?.payingCountryData ?? [];
      if (local?.length) {
        setRows(local);
        setPayingRows(localPaying);
        setTotal(cached?.data?.total ?? 0);
        setSource("local");
        // Self-heal: publish this browser's tally so the globe isn't empty
        // elsewhere until the next nightly crawl happens to run.
        fetch("/api/user-geo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ countries: local, paying: localPaying, total: cached?.data?.total ?? 0, coverage: 0 }),
        }).catch(() => {
          /* best effort */
        });
      } else {
        setRows([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /** Country rows → plottable points, dropping anything we can't place. */
  const points = useMemo<Point[]>(() => {
    const src = mode === "paying" ? payingRows : rows;
    if (!src) return [];
    const out: Point[] = [];
    for (const r of src) {
      const code = regionCodeFromName(r.name);
      const p = code ? COUNTRY_POINTS[code] : undefined;
      if (!code || !p) continue;
      out.push({ code, name: r.name, count: r.count, lon: p[0], lat: p[1] });
    }
    return out.sort((a, b) => b.count - a.count);
  }, [rows, payingRows, mode]);

  const max = points[0]?.count ?? 1;
  const loading = rows === null;
  const empty = rows !== null && points.length === 0;
  const showGlobe = !loading && !empty;

  useEffect(() => { pointsRef.current = points; }, [points]);
  useEffect(() => { hoverRef.current = hover?.code ?? null; }, [hover]);

  // One rAF loop for the lifetime of the canvas. It owns the rotation angle
  // outright — no state, so no re-render per frame. It never pauses: hovering
  // used to stop it, which froze the globe whenever the cursor crossed the card.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = SIZE * dpr;
    canvas.height = SIZE * dpr;
    ctx.scale(dpr, dpr);

    const c = SIZE / 2;
    const projection = geoOrthographic().scale(R).translate([c, c]);
    const path = geoPath(projection, ctx);

    const ocean = ctx.createRadialGradient(c - 0.24 * R, c - 0.36 * R, 0, c - 0.24 * R, c - 0.36 * R, R);
    ocean.addColorStop(0, "#1b3766");
    ocean.addColorStop(0.7, "#0e1c36");
    ocean.addColorStop(1, "#080f1f");

    const atmo = ctx.createRadialGradient(c, c, 0, c, c, R + 18);
    atmo.addColorStop(0.82, "rgba(96,165,250,0)");
    atmo.addColorStop(0.96, "rgba(96,165,250,0.16)");
    atmo.addColorStop(1, "rgba(96,165,250,0)");

    let raf = 0;
    let lastDraw = performance.now();
    let spin = 0;

    // Reprojecting the coastline costs ~9ms, so drawing every rAF frame would
    // eat half a core for a decorative widget. At 6°/sec a 30fps redraw moves
    // the globe well under a pixel per frame — indistinguishable, half the work.
    const FRAME_MS = 1000 / 30;

    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      const elapsed = t - lastDraw;
      if (elapsed < FRAME_MS) return;
      lastDraw = t;
      // Advance by real elapsed time so the speed is frame-rate independent,
      // but clamp it: background tabs suspend rAF, so the first frame back can
      // be minutes wide and the globe would visibly lurch.
      spin = (spin + Math.min(elapsed, 50) * 0.006) % 360;
      projection.rotate([spin, -18]);

      ctx.clearRect(0, 0, SIZE, SIZE);

      ctx.fillStyle = atmo;
      ctx.beginPath();
      ctx.arc(c, c, R + 18, 0, 2 * Math.PI);
      ctx.fill();

      ctx.fillStyle = ocean;
      ctx.beginPath();
      ctx.arc(c, c, R, 0, 2 * Math.PI);
      ctx.fill();

      ctx.strokeStyle = "rgba(96,165,250,0.07)";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      path(GRATICULE);
      ctx.stroke();

      ctx.beginPath();
      path(LAND_GEOMETRY);
      ctx.fillStyle = "rgba(36,70,111,0.9)";
      ctx.fill();
      ctx.strokeStyle = "rgba(107,163,224,0.45)";
      ctx.stroke();

      ctx.strokeStyle = "rgba(96,165,250,0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(c, c, R, 0, 2 * Math.PI);
      ctx.stroke();

      // A point is on the near side when its angular distance from the centre
      // of the disc is under 90°.
      const lam = (-spin * Math.PI) / 180;
      const phi = (18 * Math.PI) / 180;
      const peak = pointsRef.current[0]?.count ?? 1;
      const plotted: Plotted[] = [];
      for (const p of pointsRef.current) {
        const la = (p.lat * Math.PI) / 180;
        const lo = (p.lon * Math.PI) / 180;
        const cosc = Math.sin(phi) * Math.sin(la) + Math.cos(phi) * Math.cos(la) * Math.cos(lo - lam);
        if (cosc <= 0.02) continue;
        const xy = projection([p.lon, p.lat]);
        // sqrt so a country with 100x the users isn't 100x the radius
        if (xy) plotted.push({ ...p, x: xy[0], y: xy[1], r: 2 + Math.sqrt(p.count / peak) * 7 });
      }
      plottedRef.current = plotted;

      for (const p of plotted) {
        ctx.fillStyle = "rgba(96,165,250,0.18)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r + 3, 0, 2 * Math.PI);
        ctx.fill();
      }
      ctx.save();
      ctx.shadowColor = "rgba(125,211,252,0.9)";
      ctx.shadowBlur = 6;
      for (const p of plotted) {
        ctx.fillStyle = hoverRef.current === p.code ? "rgba(191,219,254,0.95)" : "rgba(125,211,252,0.95)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, 2 * Math.PI);
        ctx.fill();
      }
      ctx.restore();

      // Re-test under the cursor every frame, not just on mousemove — the
      // globe keeps turning, so what sits under a still cursor changes.
      const m = mouseRef.current;
      if (m) {
        let found: Plotted | null = null;
        for (const p of plotted) {
          const d = Math.hypot(p.x - m.x, p.y - m.y);
          if (d <= p.r + 4 && (!found || d < Math.hypot(found.x - m.x, found.y - m.y))) found = p;
        }
        if ((found?.code ?? null) !== hoverRef.current) {
          hoverRef.current = found?.code ?? null;
          setHover(found ? { code: found.code, name: found.name, count: found.count, lon: found.lon, lat: found.lat } : null);
        }
      }
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [showGlobe]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-jp-navy-card/40">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
        <div>
          <h2 className="text-sm font-semibold text-ink">Where our users are</h2>
          <p className="mt-0.5 text-xs text-ink-faint">
            {loading
              ? "Loading…"
              : empty
                ? "Run User Analysis to fill this in"
                : `${points.reduce((n, p) => n + p.count, 0).toLocaleString()} ${mode === "paying" ? "paying users" : "users"} · ${points.length} countries`}
          </p>
        </div>
        {!loading && (
          <div className="inline-flex gap-1 rounded-lg border border-white/[0.08] bg-jp-navy-card/60 p-0.5">
            {(["paying", "all"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={
                  "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors " +
                  (mode === m ? "bg-jp-blue/15 text-jp-blue-light" : "text-ink-muted hover:text-ink")
                }
              >
                {m === "paying" ? "Paying" : "All users"}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
      <div className="relative flex justify-center pb-4">
        {loading ? (
          <div className="flex h-[460px] items-center justify-center text-ink-faint">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : empty ? (
          <div className="flex h-[460px] flex-col items-center justify-center gap-2 text-ink-faint">
            <Globe2 className="h-8 w-8 opacity-40" />
            <p className="max-w-xs text-center text-xs">
              {mode === "paying" && rows?.length
                ? "No paying users have a country on record yet."
                : "Open User Analysis once and this fills in — it reuses the country data from that crawl."}
            </p>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            className="max-w-full"
            style={{ width: SIZE, height: SIZE, aspectRatio: "1 / 1" }}
            onMouseMove={(e) => {
              // The canvas can be laid out smaller than its drawing surface,
              // so map the cursor back into SIZE-space before hit-testing.
              const rect = e.currentTarget.getBoundingClientRect();
              mouseRef.current = {
                x: ((e.clientX - rect.left) * SIZE) / rect.width,
                y: ((e.clientY - rect.top) * SIZE) / rect.height,
              };
            }}
            onMouseLeave={() => {
              mouseRef.current = null;
              hoverRef.current = null;
              setHover(null);
            }}
          />
        )}

        {hover && (
          <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 rounded-lg border border-white/[0.1] bg-jp-navy px-3 py-1.5 text-xs shadow-xl">
            <span className="text-ink">{regionFlag(hover.code)} {hover.name}</span>
            <span className="ml-2 text-jp-blue-light">{hover.count.toLocaleString()}</span>
          </div>
        )}
      </div>

        {/* The globe is the nice part, but a sphere only ever shows you half
            the world at once — the list is what you actually read off. */}
        {!loading && !empty && (
          <div className="hidden pr-5 lg:block">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">Top countries</div>
            <ol className="space-y-1.5">
              {points.slice(0, 10).map((p) => (
                <li
                  key={p.code}
                  onMouseEnter={() => setHover(p)}
                  onMouseLeave={() => setHover(null)}
                  className="cursor-default"
                >
                  <div className="flex items-baseline justify-between gap-2 text-[11px]">
                    <span className={hover?.code === p.code ? "text-ink" : "text-ink-muted"}>
                      {regionFlag(p.code)} {p.name}
                    </span>
                    <span className="shrink-0 tabular-nums text-ink-faint">{p.count.toLocaleString()}</span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/[0.05]">
                    <div
                      className="h-full rounded-full bg-jp-blue-light/70 transition-[width] duration-300"
                      style={{ width: `${Math.max(3, (p.count / max) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ol>
            {points.length > 10 && (
              <p className="mt-3 text-[10px] text-ink-faint">+{points.length - 10} more countries</p>
            )}
          </div>
        )}
      </div>

      {!loading && !empty && (
        <div className="flex items-center justify-between border-t border-white/[0.06] px-5 py-2.5 text-[10px] text-ink-faint">
          <span>Hover a country for its count</span>
          <span>{source === "local" ? "from this browser's last analysis" : "updated with User Analysis"}</span>
        </div>
      )}
    </div>
  );
}
