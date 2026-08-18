/** RevenueCat live overview metrics (28-day aggregates) — shared by the
 * Revenue Analytics and Dashboard APIs. Returns zeros + ok:false if RC is
 * unreachable so pages can degrade gracefully. */

export interface RcOverview {
  active_trials: number;
  active_subscriptions: number;
  mrr: number;
  revenue: number;
  new_customers: number;
  active_users: number;
  transactions: number;
}

export async function getRcOverview(): Promise<{ overview: RcOverview; ok: boolean }> {
  const zero: RcOverview = {
    active_trials: 0,
    active_subscriptions: 0,
    mrr: 0,
    revenue: 0,
    new_customers: 0,
    active_users: 0,
    transactions: 0,
  };
  const RC_KEY = process.env.RC_API_KEY;
  const RC_PROJECT = process.env.RC_PROJECT_ID;
  if (!RC_KEY || !RC_PROJECT) return { overview: zero, ok: false };
  try {
    const res = await fetch(`https://api.revenuecat.com/v2/projects/${RC_PROJECT}/metrics/overview`, {
      headers: { Authorization: `Bearer ${RC_KEY}`, "Content-Type": "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return { overview: zero, ok: false };
    const data = await res.json();
    const metrics = data.metrics || [];
    const get = (id: string) => metrics.find((m: { id: string }) => m.id === id);
    return {
      ok: true,
      overview: {
        active_trials: get("active_trials")?.value ?? 0,
        active_subscriptions: get("active_subscriptions")?.value ?? 0,
        mrr: get("mrr")?.value ?? 0,
        revenue: get("revenue")?.value ?? 0,
        new_customers: get("new_customers")?.value ?? 0,
        active_users: get("active_users")?.value ?? 0,
        transactions: get("num_tx_last_28_days")?.value ?? 0,
      },
    };
  } catch {
    return { overview: zero, ok: false };
  }
}
