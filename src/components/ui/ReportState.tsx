import { AlertCircle } from "lucide-react";
import Button from "./Button";

export function ReportError({ error, onRetry, stale = false }: { error: string; onRetry?: () => void; stale?: boolean }) {
  const setup = /API_TOKEN|not (set|configured)|SUPABASE|YOUR-PROJECT/i.test(error);
  return (
    <div className="app-report-state" role="alert">
      <AlertCircle className="h-5 w-5 shrink-0 text-ink-muted" aria-hidden />
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold text-ink">{setup ? "Live data is not connected" : stale ? "Could not update this report" : "This report is temporarily unavailable"}</h2>
        <p className="mt-1 text-sm text-ink-muted">{setup ? "The dashboard needs its server-side data credentials. Your layout is ready; no sample figures are shown as real data." : stale ? "The last loaded figures are still shown below. Try refreshing in a moment." : "We could not load the latest figures. Try again in a moment."}</p>
        <details className="mt-2 text-xs text-ink-faint"><summary className="cursor-pointer">Technical details</summary><p className="mt-2 break-words">{error}</p></details>
      </div>
      {onRetry && !setup && <Button size="sm" variant="secondary" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export function ReportLoading({ label = "Loading report" }: { label?: string }) {
  return (
    <div className="space-y-4" role="status" aria-label={label} aria-busy="true">
      <span className="sr-only">{label}</span>
      <div className="app-headline-grid">
        {[0, 1, 2, 3].map((n) => <div key={n} className="app-skeleton-card"><div className="app-skeleton h-3 w-24" /><div className="app-skeleton mt-4 h-7 w-20" /></div>)}
      </div>
      <div className="app-skeleton-card space-y-4">{[0, 1, 2, 3, 4].map((n) => <div key={n} className="app-skeleton h-5 w-full" />)}</div>
    </div>
  );
}
