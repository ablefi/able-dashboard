"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { geoOrthographic, geoNaturalEarth1, geoPath, geoGraticule } from "d3-geo";
import { Globe2, Loader2 } from "lucide-react";
import { LAND_GEOMETRY, COUNTRY_POINTS } from "@/data/globe";
import { regionCodeFromName, regionFlag, regionName } from "@/lib/countries";
import { readAnalysisCache } from "@/lib/userAnalysisRunner";
import { useAxios } from "@/api/axiosInstance";
import type { GeoCell } from "@/lib/geoPlace";

/**
 * Where our users are, on a slowly turning globe.
 *
 * Each dot is a grid cell of real users, not a country. The globe used to plot
 * the `country` STRING at a hardcoded country centroid, which was wrong twice
 * over: `country` is the weakest field we hold (43% of payers carry one against
 * 92% carrying coordinates, and 4% of the whole base), and a centroid is
 * nowhere anybody lives — every UK user sat in a field in Lancashire and every
 * Indonesian in the middle of Borneo. Cells come from lib/geoPlace, which
 * prefers real coordinates and falls back to the timezone's reference city.
 *
 * Dots placed by coordinate are drawn bright; dots inferred from a timezone are
 * drawn dim and hollow, because they all stack on one point per zone and would
 * otherwise read as a huge genuine cluster on Kolkata or New York.
 *
 * The land and graticule go through d3-geo rather than hand-rolled trig,
 * because the hard part is clipping continents at the horizon: naively
 * dropping the far-side points leaves flat chords across Africa, and d3 splits
 * the rings along the limb properly. The dots do NOT, because a point needs
 * none of that reasoning, and there are thousands of them per frame.
 *
 * Drawn to a canvas, not SVG. As SVG the reprojection ran inside React's
 * render, so every frame re-rendered the component and handed the browser a
 * fresh ~80KB path string to re-parse, which dropped frames here and janked
 * the rest of the dashboard. On canvas the rotation never touches React at
 * all; only hover does.
 *
 * A frame costs about 4ms against this payload, measured on the real 3,206
 * cells: basemap 3.0, cells 0.3, dots 1.1. It runs at 30fps and stops entirely
 * when the card scrolls out of view, because the cost that matters for a
 * decorative card is not whether it can keep up, it is how much of the main
 * thread it holds away from whatever you are actually doing.
 */

type Tally = { name: string; code?: string; count: number };
type Country = { code: string; name: string; count: number };
/** A cell with its trig precomputed, so the draw loop does no per-frame sin/cos. */
type Prepared = GeoCell & { value: number; sinLat: number; cosLat: number; sinLon: number; cosLon: number };
type Plotted = Prepared & { x: number; y: number; r: number };

type Mode = "paying" | "all";

const SIZE = 460;
const R = SIZE / 2 - 26;
/** The flat map is wider than the globe; both scale down with the card. */
const MAP_W = 760;
const MAP_H = 400;
type View = "globe" | "map";
/** Compact mode shows the globe at about 300px instead of 460px. */
const COMPACT_SCALE = 0.65;
const VIEW_KEY = "app_user_globe_view";
const GRATICULE = geoGraticule().step([20, 20]).precision(2)();
/** Centre latitude of the projection, in radians — matches rotate([spin, -18]). */
const TILT = (18 * Math.PI) / 180;
const SIN_TILT = Math.sin(TILT);
const COS_TILT = Math.cos(TILT);

type Payload = {
  countries: Tally[];
  paying: Tally[];
  total: number;
  cells?: GeoCell[];
  placed?: number;
  placedPaying?: number;
  gps?: number;
  gpsPaying?: number;
  droppedUsers?: number;
  payingTotal?: number;
};

/**
 * Country-centroid cells, for a payload stored before the globe plotted real
 * positions.
 *
 * This is the old behaviour, kept only as a graceful degradation: without it
 * the globe would render as a bare sphere with no dots at all between deploying
 * this and the next User Analysis crawl. They are emitted with `gps: 0` so they
 * draw hollow, which is honest — a country centroid is an approximation of the
 * same kind as a timezone, and nobody lives at one.
 */
function fallbackCells(geo: Payload | null, mode: "paying" | "all"): GeoCell[] {
  const src = (mode === "paying" ? geo?.paying : geo?.countries) ?? [];
  const byCode = new Map<string, GeoCell>();
  for (const r of src) {
    const code = r.code ?? regionCodeFromName(r.name);
    const pt = code ? COUNTRY_POINTS[code] : undefined;
    if (!code || !pt) continue;
    const seen = byCode.get(code);
    if (seen) { seen.count += r.count; seen.paying += r.count; continue; }
    // Built per mode, so count and paying carry the same figure: whichever
    // one the caller reads is the tally it asked for.
    byCode.set(code, { lon: pt[0], lat: pt[1], count: r.count, paying: r.count, gps: 0, cc: code });
  }
  return [...byCode.values()];
}

/** Signups per ISO alpha-2 country, the shape of Able's `/stats` byCountry. */
export type CountryCount = { code: string; count: number };

/**
 * With `countries`, the globe draws that tally (at country centroids, every
 * user, no paying split) and skips the User Analysis payload entirely.
 */
export default function UserGlobe({
  countries: provided,
  compact = false,
  title = "Where our users are",
}: {
  countries?: CountryCount[];
  /** Smaller globe and card chrome, no side list, for a 2-up row beside a country table. */
  compact?: boolean;
  title?: string;
} = {}) {
  const external = provided !== undefined;
  const [fetched, setGeo] = useState<Payload | null>(null);
  const geo = useMemo<Payload | null>(() => {
    if (!provided) return fetched;
    const tallies = provided.map((c) => ({ code: c.code, name: regionName(c.code) || c.code, count: c.count }));
    return { countries: tallies, paying: [], total: tallies.reduce((n, c) => n + c.count, 0) };
  }, [provided, fetched]);
  const [modeChoice, setMode] = useState<Mode>("paying");
  // An external tally has no paying split, so it is always shown as all users.
  const mode: Mode = external ? "all" : modeChoice;
  const axios = useAxios();
  const [source, setSource] = useState<"server" | "local" | null>(null);
  const [hover, setHover] = useState<Country | null>(null);
  const [view, setViewState] = useState<View>("globe");
  useEffect(() => {
    try { if (localStorage.getItem(VIEW_KEY) === "map") setViewState("map"); } catch { /* private window */ }
  }, []);
  const setView = (next: View) => {
    setViewState(next);
    try { localStorage.setItem(VIEW_KEY, next); } catch { /* private window */ }
  };
  const width = view === "map" ? MAP_W : SIZE;
  const height = view === "map" ? MAP_H : SIZE;
  // Display size only; the canvas still draws at width x height and CSS scales it,
  // so hit-testing (which maps back into drawing space) is unaffected.
  const displayWidth = compact ? Math.round(width * COMPACT_SCALE) : width;
  const wellHeight = compact ? Math.round(SIZE * COMPACT_SCALE) : SIZE;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // The draw loop reads these rather than closing over state, so it can be
  // started once and never torn down as data or hover changes.
  const cellsRef = useRef<Prepared[]>([]);
  const hoverRef = useRef<string | null>(null);
  const mouseRef = useRef<{ x: number; y: number } | null>(null);
  // The draw loop needs the country totals to label a hovered dot, but must not
  // be rebuilt when they change.
  const countriesRef = useRef<Country[]>([]);
  /** Whether the card is actually in the viewport. Starts true so the first
   * frames paint before the observer has had a chance to report. */
  const onScreenRef = useRef(true);

  // Prefer the centrally-stored tally so this works on any machine; fall back
  // to whatever this browser happens to have cached from a local crawl.
  useEffect(() => {
    if (external) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/user-geo", { cache: "no-store" });
        const d = await res.json();
        if (!cancelled && d?.geo?.countries?.length) {
          setGeo(d.geo);
          setSource("server");
          return;
        }
      } catch {
        /* fall through to the local cache */
      }
      // readAnalysisCache, not readCache: the crawl stores {total, stats,
      // computedAt} while readCache insists on its own {at, data} envelope and
      // returns null for anything else. This fallback could never fire.
      const cached = readAnalysisCache();
      if (cancelled) return;
      const s = cached?.stats as any;
      if (s?.userCountryData?.length) {
        const local: Payload = {
          countries: s.userCountryData,
          paying: s.payingCountryData ?? [],
          total: cached?.total ?? 0,
          cells: s.geoCells ?? [],
          placed: s.geoPlaced ?? 0,
          placedPaying: s.geoPlacedPaying ?? 0,
          gps: s.geoGps ?? 0,
          // Left undefined when the cached crawl predates this counter, so the
          // footer names the dot styles instead of claiming a count of zero.
          ...(s.geoGpsPaying != null ? { gpsPaying: s.geoGpsPaying } : {}),
          droppedUsers: s.geoDroppedUsers ?? 0,
          payingTotal: s.payingCount ?? 0,
        };
        setGeo(local);
        setSource("local");
        // Self-heal: publish this browser's tally so the globe isn't empty
        // elsewhere until the next nightly crawl happens to run.
        fetch("/api/user-geo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(local),
        }).catch(() => {
          /* best effort */
        });
      } else {
        setGeo({ countries: [], paying: [], total: 0 });
      }
    })();
    return () => { cancelled = true; };
  }, [external]);

  /**
   * Cells for the current mode, with their trig precomputed.
   *
   * In paying mode a cell's value is its paying headcount, so cells with no
   * payers drop out entirely rather than drawing at zero size.
   */

  const cells = useMemo<Prepared[]>(() => {
    const src = geo?.cells?.length ? geo.cells : fallbackCells(geo, mode);
    const out: Prepared[] = [];
    for (const c of src) {
      const value = mode === "paying" ? c.paying : c.count;
      if (value <= 0) continue;
      const la = (c.lat * Math.PI) / 180;
      const lo = (c.lon * Math.PI) / 180;
      out.push({
        ...c, value,
        sinLat: Math.sin(la), cosLat: Math.cos(la),
        sinLon: Math.sin(lo), cosLon: Math.cos(lo),
      });
    }
    return out.sort((a, b) => b.value - a.value);
  }, [geo, mode]);

  /**
   * The side list: countries, merged onto one code each.
   *
   * The merge is not decoration. A payload written before the crawl resolved
   * codes holds the device's own spelling, so Germany arrives as three separate
   * rows (Deutschland, Germany, Almanya) that all resolve to DE. Summing them
   * into one entry is what stops the list showing the same country three times
   * at a third of its real size.
   */
  const countries = useMemo<Country[]>(() => {
    const src = (mode === "paying" ? geo?.paying : geo?.countries) ?? [];
    const byCode = new Map<string, Country>();
    for (const r of src) {
      // `code` is written by the current crawl; fall back to resolving the name
      // so a payload stored before that still renders.
      const code = r.code ?? regionCodeFromName(r.name);
      if (!code) continue;
      const seen = byCode.get(code);
      if (seen) seen.count += r.count;
      else byCode.set(code, { code, name: regionName(code) || r.name, count: r.count });
    }
    return [...byCode.values()].sort((a, b) => b.count - a.count);
  }, [geo, mode]);

  const listed = countries.reduce((n, c) => n + c.count, 0);
  const max = countries[0]?.count ?? 1;
  const loading = geo === null;
  const hasCells = cells.length > 0;
  /**
   * Whether the payload carries REAL positions, as opposed to the country
   * centroids fallbackCells invents. Everything the header and footer claim
   * hangs off this: a legacy payload has no `placed` count, so quoting the
   * "N of M located" line against it would read "0 of 3,612 located" while the
   * globe visibly shows hundreds of dots.
   */
  const hasRealCells = (geo?.cells?.length ?? 0) > 0;
  const empty = !loading && !hasCells && countries.length === 0;
  const showGlobe = !loading && !empty;

  /**
   * How many users we located, and out of how many.
   *
   * Counted from the payload rather than by summing the drawn cells: the very
   * long tail of one-user cells is trimmed before publishing, so summing what
   * is on screen would quietly under-report the thing the header claims.
   */
  const located = (mode === "paying" ? geo?.placedPaying : geo?.placed) || 0;
  const denominator = (mode === "paying" ? geo?.payingTotal : geo?.total) || 0;
  /**
   * How many of the located users this mode has a real fix for. Left undefined
   * rather than defaulted to 0 when the payload predates the counter, because
   * "0 placed by device location" beside thousands of solid dots is a worse
   * answer than not giving a number at all.
   */
  const byGps = mode === "paying" ? geo?.gpsPaying : geo?.gps;
  const dropped = geo?.droppedUsers || 0;

  useEffect(() => { cellsRef.current = cells; }, [cells]);
  useEffect(() => { hoverRef.current = hover?.code ?? null; }, [hover]);

  // One rAF loop for the lifetime of the canvas. It owns the rotation angle
  // outright — no state, so no re-render per frame. It never pauses: hovering
  // used to stop it, which froze the globe whenever the cursor crossed the card.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const flat = view === "map";
    const W = flat ? MAP_W : SIZE;
    const H = flat ? MAP_H : SIZE;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    const c = SIZE / 2;
    const projection = geoOrthographic().scale(R).translate([c, c]);
    const path = geoPath(projection, ctx);

    // The flat map never moves, so its basemap is drawn once to an offscreen
    // canvas and each frame only blits it and redraws the dots (hover still
    // needs redraws). Dots are projected once per data change, not per frame.
    const mapProjection = geoNaturalEarth1().fitExtent([[10, 10], [W - 10, H - 10]], { type: "Sphere" });
    let basemap: HTMLCanvasElement | null = null;
    if (flat) {
      basemap = document.createElement("canvas");
      basemap.width = W * dpr;
      basemap.height = H * dpr;
      const b = basemap.getContext("2d")!;
      b.scale(dpr, dpr);
      const bPath = geoPath(mapProjection, b);
      b.beginPath(); bPath({ type: "Sphere" });
      b.fillStyle = "#1b1b1b"; b.fill();
      b.strokeStyle = "rgba(154,154,154,0.07)"; b.lineWidth = 0.5;
      b.beginPath(); bPath(GRATICULE); b.stroke();
      b.beginPath(); bPath(LAND_GEOMETRY);
      b.fillStyle = "rgba(65,65,65,0.9)"; b.fill();
      b.strokeStyle = "rgba(153,153,153,0.45)"; b.stroke();
      b.strokeStyle = "rgba(154,154,154,0.25)"; b.lineWidth = 1;
      b.beginPath(); bPath({ type: "Sphere" }); b.stroke();
    }
    let mapSource: Prepared[] | null = null;
    let mapPlotted: Plotted[] = [];

    const ocean = ctx.createRadialGradient(c - 0.24 * R, c - 0.36 * R, 0, c - 0.24 * R, c - 0.36 * R, R);
    ocean.addColorStop(0, "#343434");
    ocean.addColorStop(0.7, "#1b1b1b");
    ocean.addColorStop(1, "#0f0f0f");

    const atmo = ctx.createRadialGradient(c, c, 0, c, c, R + 18);
    atmo.addColorStop(0.82, "rgba(154,154,154,0)");
    atmo.addColorStop(0.96, "rgba(154,154,154,0.16)");
    atmo.addColorStop(1, "rgba(154,154,154,0)");

    let raf = 0;
    let lastDraw = performance.now();
    let spin = 0;

    /**
     * 30fps, and deliberately still 30fps.
     *
     * The old comment justified this with "reprojecting the coastline costs
     * ~9ms". Measured against the real 3,206-cell payload it is about 4ms a
     * frame, so that reason was wrong, and 60fps would fit. It is still not
     * worth taking: the globe advances 0.006 deg/ms, which at 30fps is 0.2
     * degrees, and near the centre of a 204px disc that is 0.7px. The motion
     * is already sub-pixel per frame, so doubling the rate buys nothing you
     * can see and doubles how much of the main thread a decorative card holds
     * while you are trying to scroll or click something else.
     */
    const FRAME_MS = 1000 / 30;

    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      const elapsed = t - lastDraw;
      if (elapsed < FRAME_MS) return;
      // Off screen is not just the tab being hidden, which rAF already handles:
      // the globe sits near the top of a long dashboard, so scrolling past it
      // used to leave it redrawing forever against nobody's eyes.
      if (!onScreenRef.current) { lastDraw = t; return; }
      lastDraw = t;
      // Advance by real elapsed time so the speed is frame-rate independent,
      // but clamp it: background tabs suspend rAF, so the first frame back can
      // be minutes wide and the globe would visibly lurch.
      let plotted: Plotted[] = [];
      if (flat) {
        ctx.clearRect(0, 0, W, H);
        ctx.drawImage(basemap!, 0, 0, W, H);
        if (mapSource !== cellsRef.current) {
          mapSource = cellsRef.current;
          const peakFlat = mapSource[0]?.value ?? 1;
          mapPlotted = [];
          for (const p of mapSource) {
            const xy = mapProjection([p.lon, p.lat]);
            if (!xy) continue;
            mapPlotted.push({ ...p, x: xy[0], y: xy[1], r: 1 + Math.sqrt(p.value / peakFlat) * 5.5 });
          }
        }
        plotted = mapPlotted;
      } else {
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

      ctx.strokeStyle = "rgba(154,154,154,0.07)";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      path(GRATICULE);
      ctx.stroke();

      ctx.beginPath();
      path(LAND_GEOMETRY);
      ctx.fillStyle = "rgba(65,65,65,0.9)";
      ctx.fill();
      ctx.strokeStyle = "rgba(153,153,153,0.45)";
      ctx.stroke();

      ctx.strokeStyle = "rgba(154,154,154,0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(c, c, R, 0, 2 * Math.PI);
      ctx.stroke();

      // A cell is on the near side when its angular distance from the centre of
      // the disc is under 90°.
      //
      // Both the cull and the projection are done here rather than through d3.
      // The land and graticule still go through geoPath, which has to clip rings
      // at the limb properly, but a point needs none of that: it is either in
      // front or it is not. Expanding cos(lon - lam) through the angle-addition
      // identity against each cell's precomputed sin/cos turns a trig call into
      // two multiplies, and writing x and y straight out avoids the array d3
      // allocates per point. Over 3,206 cells that measured 0.27ms down to
      // 0.05ms a frame. The formulas are plain orthographic, matching
      // rotate([spin, -18]) so dots stay registered with the coastline.
      const lam = (-spin * Math.PI) / 180;
      const sinLam = Math.sin(lam);
      const cosLam = Math.cos(lam);
      const peak = cellsRef.current[0]?.value ?? 1;
      for (const p of cellsRef.current) {
        const cosDelta = p.cosLon * cosLam + p.sinLon * sinLam;
        const cosc = SIN_TILT * p.sinLat + COS_TILT * p.cosLat * cosDelta;
        if (cosc <= 0.02) continue;
        const sinDelta = p.sinLon * cosLam - p.cosLon * sinLam;
        // sqrt so a city with 100x the users isn't 100x the radius
        plotted.push({
          ...p,
          x: c + R * p.cosLat * sinDelta,
          y: c - R * (COS_TILT * p.sinLat - SIN_TILT * p.cosLat * cosDelta),
          r: 1.1 + Math.sqrt(p.value / peak) * 6.5,
        });
      }
      }

      const lit = hoverRef.current;

      /**
       * Dots are drawn as five batched paths, not one path per dot.
       *
       * Each style gets a single beginPath, every circle in it is a subpath,
       * and one fill or stroke ends it. That is five canvas state changes a
       * frame instead of two per visible dot, and it measured 1.14ms down to
       * 0.59ms. `moveTo` before each arc is what keeps them separate subpaths;
       * without it the canvas joins consecutive circles with a straight line.
       *
       * Filling one path also fixes something the old loop got wrong by
       * accident. Overlapping translucent circles used to compound, so a dense
       * city stacked alpha until it blew out to a white blob. Inside a single
       * path they merge under the nonzero winding rule instead, so a cluster
       * reads as a bright area rather than a smear.
       *
       * shadowBlur is gone with it. It is the most expensive thing you can ask
       * a 2D canvas for, and it was being set on every dot to produce a glow
       * the halo pass already draws.
       */
      const arc = (p: Plotted, r: number) => {
        ctx.moveTo(p.x + r, p.y);
        ctx.arc(p.x, p.y, r, 0, 2 * Math.PI);
      };

      // Halos first, so every core sits on top of every halo. A halo goes to
      // cells placed by real coordinates, plus every cell of the country being
      // hovered.
      ctx.fillStyle = "rgba(154,154,154,0.16)";
      ctx.beginPath();
      for (const p of plotted) if (p.gps > 0 && lit !== p.cc) arc(p, p.r + 2.5);
      ctx.fill();

      if (lit) {
        ctx.fillStyle = "rgba(215,215,215,0.30)";
        ctx.beginPath();
        for (const p of plotted) if (lit === p.cc) arc(p, p.r + 2.5);
        ctx.fill();
      }

      // Solid cores: we know where these people are.
      ctx.fillStyle = "rgba(190,190,190,0.95)";
      ctx.beginPath();
      for (const p of plotted) if (p.gps > 0 && lit !== p.cc) arc(p, p.r);
      ctx.fill();

      // A timezone-placed cell is a guess at city level, and every user in the
      // zone lands on the very same point. Drawn hollow so a stack of them
      // cannot pass for a real cluster.
      ctx.strokeStyle = "rgba(190,190,190,0.42)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const p of plotted) if (p.gps === 0 && lit !== p.cc) arc(p, p.r);
      ctx.stroke();

      if (lit) {
        ctx.fillStyle = "rgba(238,238,238,0.98)";
        ctx.beginPath();
        for (const p of plotted) if (lit === p.cc && p.gps > 0) arc(p, p.r);
        ctx.fill();
        ctx.strokeStyle = "rgba(215,215,215,0.8)";
        ctx.beginPath();
        for (const p of plotted) if (lit === p.cc && p.gps === 0) arc(p, p.r);
        ctx.stroke();
      }

      // Re-test under the cursor every frame, not just on mousemove — the
      // globe keeps turning, so what sits under a still cursor changes.
      const m = mouseRef.current;
      if (m) {
        let found: Plotted | null = null;
        for (const p of plotted) {
          const d = Math.hypot(p.x - m.x, p.y - m.y);
          if (d <= p.r + 4 && (!found || d < Math.hypot(found.x - m.x, found.y - m.y))) found = p;
        }
        const code = found?.cc ?? null;
        if (code !== hoverRef.current) {
          hoverRef.current = code;
          const row = code ? countriesRef.current.find((x) => x.code === code) : null;
          setHover(row ?? (code ? { code, name: regionName(code) || code, count: 0 } : null));
        }
      }
    };

    const io = new IntersectionObserver(
      ([entry]) => { onScreenRef.current = entry.isIntersecting; },
      { threshold: 0 }
    );
    io.observe(canvas);

    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); io.disconnect(); };
  }, [showGlobe, view]);

  useEffect(() => { countriesRef.current = countries; }, [countries]);

  const subtitle = loading
    ? "Loading…"
    : empty
      ? (external ? "No signups yet" : "Run User Analysis to fill this in")
      : hasRealCells && denominator > 0
        ? `${located.toLocaleString()} of ${denominator.toLocaleString()} ${mode === "paying" ? "paying users" : "users"} located · ${countries.length} countries`
        : `${listed.toLocaleString()} ${mode === "paying" ? "paying users" : "users"} · ${countries.length} countries`;

  return (
    <div
      className={
        compact
          ? "app-card relative overflow-hidden rounded-xl border border-white/[0.06] bg-app-navy-card/60"
          : "relative overflow-hidden rounded-2xl border border-white/[0.06] bg-app-navy-card/40"
      }
    >
      <div
        className={
          compact
            ? "app-card-head flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-white/[0.06] px-5 py-4"
            : "flex flex-wrap items-start justify-between gap-3 px-5 pt-5"
        }
      >
        {compact ? (
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
            <h2 className="text-sm font-semibold text-ink">{title}</h2>
            <span className="text-[11px] text-ink-faint">{subtitle}</span>
          </div>
        ) : (
          <div>
            <h2 className="text-sm font-semibold text-ink">{title}</h2>
            <p className="mt-0.5 text-xs text-ink-faint">{subtitle}</p>
          </div>
        )}
        {geo !== null && (
          <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex gap-1 rounded-lg border border-white/[0.08] bg-app-navy-card/60 p-0.5" role="group" aria-label="View">
            {(["globe", "map"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={
                  "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors " +
                  (view === v ? "bg-app-blue/15 text-app-blue-light" : "text-ink-muted hover:text-ink")
                }
              >
                {v === "globe" ? "Globe" : "Flat map"}
              </button>
            ))}
          </div>
          {!external && (
          <div className="inline-flex gap-1 rounded-lg border border-white/[0.08] bg-app-navy-card/60 p-0.5">
            {(["paying", "all"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={
                  "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors " +
                  (mode === m ? "bg-app-blue/15 text-app-blue-light" : "text-ink-muted hover:text-ink")
                }
              >
                {m === "paying" ? "Paying" : "All users"}
              </button>
            ))}
          </div>
          )}
          </div>
        )}
      </div>

      <div className={compact ? "grid" : "grid gap-4 lg:grid-cols-[1fr_260px]"}>
      <div className={compact ? "relative flex justify-center py-2" : "relative flex justify-center pb-4"}>
        {loading ? (
          <div className="flex items-center justify-center text-ink-faint" style={{ height: wellHeight }}>
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : empty ? (
          <div className="flex flex-col items-center justify-center gap-2 text-ink-faint" style={{ height: wellHeight }}>
            {!compact && <Globe2 className="h-8 w-8 opacity-40" />}
            <p className="max-w-xs text-center text-xs">
              {external
                ? "No signups yet. Countries appear here as people sign up."
                : "Open User Analysis once and this fills in, it reuses the location data from that crawl."}
            </p>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            className="max-w-full"
            style={{ width: displayWidth, height: "auto", aspectRatio: `${width} / ${height}` }}
            onMouseMove={(e) => {
              // The canvas can be laid out smaller than its drawing surface,
              // so map the cursor back into SIZE-space before hit-testing.
              const rect = e.currentTarget.getBoundingClientRect();
              mouseRef.current = {
                x: ((e.clientX - rect.left) * width) / rect.width,
                y: ((e.clientY - rect.top) * height) / rect.height,
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
          <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 rounded-lg border border-white/[0.1] bg-app-navy px-3 py-1.5 text-xs shadow-xl">
            <span className="text-ink">{regionFlag(hover.code)} {hover.name}</span>
            {hover.count > 0 && <span className="ml-2 tabular-nums text-app-blue-light">{hover.count.toLocaleString()}</span>}
          </div>
        )}
      </div>

        {/* The globe is the nice part, but a sphere only ever shows you half
            the world at once, the list is what you actually read off. */}
        {!compact && !loading && !empty && (
          <div className="hidden pr-5 lg:block">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">Top countries</div>
            <ol className="space-y-1.5">
              {countries.slice(0, 10).map((p) => (
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
                      className="h-full rounded-full bg-app-blue-light/70 transition-[width] duration-300"
                      style={{ width: `${Math.max(3, (p.count / max) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ol>
            {countries.length > 10 && (
              <p className="mt-3 text-[10px] text-ink-faint">+{countries.length - 10} more countries</p>
            )}
          </div>
        )}
      </div>

      {!loading && !empty && (
        <div className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-white/[0.06] ${compact ? "px-3 py-1.5" : "px-5 py-2.5"} text-[10px] text-ink-faint`}>
          <span>
            {hasRealCells
              ? (byGps != null
                  ? `${byGps.toLocaleString()} placed by device location, the rest by timezone (hollow dots)`
                  : "Solid dots are device location, hollow dots are placed by timezone") +
                (dropped > 0 ? ` · ${dropped.toLocaleString()} in dots too small to draw` : "")
              : external
                ? "Dots sit at the centre of each signup country"
                : "Approximate country positions until the next User Analysis run"}
          </span>
          <span>{external ? "from the country chosen at signup" : source === "local" ? "from this browser's last analysis" : "updated with User Analysis"}</span>
        </div>
      )}
    </div>
  );
}
