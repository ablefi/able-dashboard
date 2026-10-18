"use client";

import { isProductionDashboard } from "@/lib/apiBase";

import { useEffect, useState } from "react";
import { Check, Copy, Palette, RotateCcw, X } from "lucide-react";
import {
  DEFAULT_THEME, PRESETS, applyTheme, clearTheme, readTheme, writeTheme, themeHex,
  type ThemeSettings,
} from "@/lib/theme";
import { DEFAULT_FONT, FONTS, readFont, writeFont, type FontKey } from "@/lib/fonts";
import { DEFAULT_PRESENTATION, PRESENTATIONS, readPresentation, writePresentation, type Presentation } from "@/lib/presentation";

/**
 * Defined at module scope on purpose.
 *
 * This lived inside ThemePicker, which meant every value change produced a
 * brand-new component type — React unmounted the input and mounted a fresh
 * one mid-drag, so the thumb was dropped the moment it moved and the sliders
 * appeared frozen. A component defined during render is never stable.
 */
function Slider({
  label, value, min, max, suffix, onChange,
}: { label: string; value: number; min: number; max: number; suffix: string; onChange: (n: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline justify-between">
        <span className="text-[0.75rem] text-ink-muted">{label}</span>
        <span className="tabular-nums text-[0.6875rem] text-ink-faint">{value}{suffix}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="app-range w-full"
      />
    </label>
  );
}

/**
 * Live palette control.
 *
 * The point is to stop guessing at colour in commits: move the sliders, watch
 * the whole dashboard change under them, and when one looks right, copy the
 * values out so they can be baked into globals.css as the new default.
 *
 * Nothing here ships to users — it's a local override stored in this browser.
 */
export default function ThemePicker() {
  const [open, setOpen] = useState(false);
  const [t, setT] = useState<ThemeSettings>(DEFAULT_THEME);
  const [dirty, setDirty] = useState(false);
  const [copied, setCopied] = useState(false);
  const [font, setFont] = useState<FontKey>(DEFAULT_FONT);
  const [pres, setPres] = useState<Presentation>(DEFAULT_PRESENTATION);

  // Staging only. the owner wants to keep dialling the palette in without the
  // control sitting on the live dashboard for everyone else to nudge, so this
  // renders nowhere on the production host. Same hostname check the staging
  // badge uses — one build, no flag to remember.
  const [enabled, setEnabled] = useState(false);
  useEffect(() => { setFont(readFont()); setPres(readPresentation()); }, []);

  useEffect(() => {
    if (isProductionDashboard()) return;
    setEnabled(true);
    // Re-apply on mount so a chosen theme survives navigation and reloads.
    const saved = readTheme();
    if (saved) { setT(saved); setDirty(true); applyTheme(saved); }
  }, []);

  const update = (patch: Partial<ThemeSettings>) => {
    const next = { ...t, ...patch };
    setT(next);
    setDirty(true);
    applyTheme(next);
    writeTheme(next);
  };

  const reset = () => {
    setT(DEFAULT_THEME);
    setDirty(false);
    clearTheme();
    writeTheme(null);
  };

  const copy = async () => {
    const hex = themeHex(t);
    const text = [
      `/* hue ${t.hue} · sat ${t.sat}% · light ${t.light}% · accent ${t.accentHue}/${t.accentSat}% · scale ${t.scale}% */`,
      ...Object.entries(hex).map(([k, v]) => `  ${k}: ${v};`),
      `  /* html { font-size: ${t.scale}%; } */`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch { /* nothing more to try */ }
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  if (!enabled) return null;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Theme"
        className="fixed bottom-4 right-4 z-40 flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.1] bg-app-navy-raised/90 text-ink-muted shadow-xl shadow-black/40 backdrop-blur transition-colors hover:border-app-blue/40 hover:text-ink"
      >
        <Palette className="h-4 w-4" />
        {dirty && <span className="absolute right-0 top-0 h-2 w-2 rounded-full bg-app-blue-light ring-2 ring-app-navy" />}
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 w-72 rounded-2xl border border-white/[0.1] bg-app-navy-raised/95 p-4 shadow-2xl shadow-black/50 backdrop-blur">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[0.8125rem] font-semibold text-ink">Theme</span>
        <div className="flex items-center gap-1">
          <button onClick={reset} title="Back to the shipped palette" className="flex h-7 w-7 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-white/[0.07] hover:text-ink">
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setOpen(false)} className="flex h-7 w-7 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-white/[0.07] hover:text-ink">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Typeface. Same live-switch idea as the colours: the only way to judge
          a font is to read a real screen set in it. Each chip previews itself,
          so the list shows what it is offering rather than describing it. */}
      <div className="mb-3 border-b border-white/[0.07] pb-3">
        <p className="mb-1.5 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-faint">Font</p>
        <div className="grid grid-cols-2 gap-1">
          {FONTS.map((f) => (
            <button
              key={f.value}
              onClick={() => { setFont(f.value); writeFont(f.value); }}
              title={f.hint}
              style={{ fontFamily: f.stack }}
              className={
                "rounded-md border px-2 py-1 text-left text-[0.75rem] transition-colors " +
                (font === f.value
                  ? "border-app-blue/50 bg-app-blue/[0.12] text-ink"
                  : "border-white/[0.08] text-ink-muted hover:border-app-blue/40 hover:text-ink")
              }
            >
              {f.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[0.625rem] leading-relaxed text-ink-faint">
          {FONTS.find((f) => f.value === font)?.hint}
        </p>
      </div>

      {/* Old vs new for how the screens themselves present. Same live-switch
          mechanism, so the two can be judged on real data rather than in the
          abstract. */}
      <div className="mb-3 border-b border-white/[0.07] pb-3">
        <p className="mb-1.5 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-faint">Presentation</p>
        <div className="grid grid-cols-2 gap-1">
          {PRESENTATIONS.map((m) => (
            <button
              key={m.value}
              onClick={() => { setPres(m.value); writePresentation(m.value); }}
              title={m.hint}
              className={
                "rounded-md border px-2 py-1 text-left text-[0.6875rem] transition-colors " +
                (pres === m.value
                  ? "border-app-blue/50 bg-app-blue/[0.12] text-ink"
                  : "border-white/[0.08] text-ink-muted hover:border-app-blue/40 hover:text-ink")
              }
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[0.625rem] leading-relaxed text-ink-faint">
          {PRESENTATIONS.find((m) => m.value === pres)?.hint}
        </p>
      </div>

      <div className="mb-3 flex flex-wrap gap-1">
        {PRESETS.map((p) => (
          <button
            key={p.name}
            onClick={() => update(p.theme)}
            className="rounded-md border border-white/[0.08] px-2 py-1 text-[0.6875rem] text-ink-muted transition-colors hover:border-app-blue/40 hover:text-ink"
          >
            {p.name}
          </button>
        ))}
      </div>

      <div className="space-y-2.5">
        <Slider label="Surface hue" value={t.hue} min={180} max={280} suffix="°" onChange={(hue) => update({ hue })} />
        <Slider label="Colourfulness" value={t.sat} min={0} max={60} suffix="%" onChange={(sat) => update({ sat })} />
        <Slider label="Lightness" value={t.light} min={6} max={26} suffix="%" onChange={(light) => update({ light })} />
        <Slider label="Accent hue" value={t.accentHue} min={180} max={290} suffix="°" onChange={(accentHue) => update({ accentHue })} />
        <Slider label="Accent punch" value={t.accentSat} min={40} max={100} suffix="%" onChange={(accentSat) => update({ accentSat })} />
        <Slider label="Text size" value={t.scale} min={85} max={110} suffix="%" onChange={(scale) => update({ scale })} />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <div className="flex flex-1 gap-1">
          {["--color-app-navy", "--color-app-navy-light", "--color-app-navy-card", "--color-app-navy-raised", "--color-app-blue"].map((v) => (
            <span key={v} className="h-6 flex-1 rounded border border-white/[0.08]" style={{ background: `var(${v})` }} />
          ))}
        </div>
        <button
          onClick={copy}
          title="Copy the values so they can be made the default"
          className="flex h-7 items-center gap-1 rounded-md border border-white/[0.08] px-2 text-[0.6875rem] text-ink-muted transition-colors hover:border-app-blue/40 hover:text-ink"
        >
          {copied ? <Check className="h-3 w-3 text-app-green" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <p className="mt-2 text-[0.6875rem] leading-relaxed text-ink-faint">
        Only changes this browser. Find one you like, hit Copy and send it over, and it becomes the real default.
      </p>
    </div>
  );
}
