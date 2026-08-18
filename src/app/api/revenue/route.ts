import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { fetchSnapshots } from "@/lib/supabaseRest";
import { getRcOverview } from "@/lib/rc";

/**
 * Revenue Analytics API — RC live overview (stat cards) + ALL-TIME daily
 * snapshots bucketed by day/week/month (the page no longer date-filters;
 * charts are always all-time per Adam).
 */

export async function GET(request: NextRequest) {
  const guard = await requireSession(request, "financials");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  try {
    const { searchParams } = new URL(request.url);
    const granularity = searchParams.get("granularity") || "day";

    const [{ overview, ok: rcOk }, snapshots] = await Promise.all([getRcOverview(), fetchSnapshots(null, null)]);

    const cumulativeRevenue = snapshots.reduce((s, x) => s + (Number(x.revenue) || 0), 0);
    const allTimeDownloads = snapshots.reduce((s, x) => s + (Number(x.new_customers) || 0), 0);
    const latestSnapshotDate = snapshots.length ? snapshots[snapshots.length - 1].snapshot_date : null;

    // Bucket: cumulative metrics take the period's LAST value; flow metrics SUM.
    let chartSnapshots = snapshots;
    if (granularity === "week" || granularity === "month") {
      const buckets: Record<string, any[]> = {};
      for (const s of snapshots) {
        const d = new Date(s.snapshot_date + "T00:00:00");
        let key: string;
        if (granularity === "week") {
          const day = d.getDay();
          const diff = d.getDate() - day + (day === 0 ? -6 : 1);
          const monday = new Date(d);
          monday.setDate(diff);
          key = monday.toISOString().split("T")[0];
        } else {
          key = s.snapshot_date.substring(0, 7) + "-01";
        }
        (buckets[key] ||= []).push(s);
      }
      chartSnapshots = Object.entries(buckets)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, group]) => {
          const last = group[group.length - 1];
          return {
            snapshot_date: date,
            active_trials: last.active_trials,
            active_subscriptions: last.active_subscriptions,
            mrr: last.mrr,
            revenue: group.reduce((sum, s) => sum + (Number(s.revenue) || 0), 0),
            new_customers: group.reduce((sum, s) => sum + (Number(s.new_customers) || 0), 0),
            active_users: last.active_users,
            transactions: group.reduce((sum, s) => sum + (Number(s.transactions) || 0), 0),
          };
        });
    }

    return NextResponse.json({ overview, rcOk, snapshots: chartSnapshots, cumulativeRevenue, allTimeDownloads, latestSnapshotDate });
  } catch (err) {
    console.error("Revenue API error:", err);
    return NextResponse.json({ error: "Failed to fetch revenue data", details: String(err) }, { status: 500 });
  }
}
