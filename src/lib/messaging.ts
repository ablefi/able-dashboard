/**
 * Catalogs for the backend's `workflows` module — the one entity behind
 * Emails, Push Notifications, Broadcasts and Campaigns.
 *
 * A workflow is either:
 *   • mode "simple"  — one message, one channel, one schedule. This is what
 *     the Emails / Push / Broadcasts screens create.
 *   • mode "journey" — a multi-step graph (START → … → END). This is a
 *     Campaign.
 *
 * Every value here was verified against the STAGING backend's validator and
 * its `journey-graph.types.ts` — the API rejects anything outside these sets,
 * so never invent entries.
 *
 * ⚠️ The whole module is STAGING ONLY; production 404s on /admin/workflows.
 */

// ------------------------------------------------------------- channels

export type ActionType = "push" | "email" | "in_app";

export const ACTION_TYPES: { value: ActionType; label: string; noun: string }[] = [
  { value: "email", label: "Email", noun: "email" },
  { value: "push", label: "Push notification", noun: "notification" },
  { value: "in_app", label: "Banner", noun: "banner" },
];

export const ACTION_LABELS: Record<string, string> = Object.fromEntries(ACTION_TYPES.map((a) => [a.value, a.label]));

export const ACTION_BADGE: Record<string, "info" | "purple" | "success"> = {
  email: "info",
  push: "purple",
  in_app: "success",
};

// ------------------------------------------------------------- lifecycle

export type WorkflowStatus = "draft" | "active" | "paused" | "archived";

export const STATUS_BADGE: Record<WorkflowStatus, "default" | "success" | "warning"> = {
  draft: "warning",
  active: "success",
  paused: "default",
  archived: "default",
};

export type TriggerType = "once" | "daily" | "weekly" | "monthly";

export const TRIGGER_TYPES: { value: TriggerType; label: string }[] = [
  { value: "once", label: "Once" },
  { value: "daily", label: "Every day" },
  { value: "weekly", label: "Every week" },
  { value: "monthly", label: "Every month" },
];

export const DAYS_OF_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// ------------------------------------------------------------- payloads

export type PushPayload = { title: string; body: string; deepLink?: string | null; imageUrl?: string | null };
/** The backend requires `html` OR `text` — a subject alone is rejected. */
export type EmailPayload = { subject: string; html?: string; text?: string };
/** In-app steps don't carry content: they hand the user an existing ACTIVE
 * banner from /admin/in-app-messages, by id. */
export type InAppPayload = { messageId: string };

export type ActionPayload = PushPayload | EmailPayload | InAppPayload;

// --------------------------------------------------- email body (no HTML)

/**
 * Plain text → the HTML the backend stores.
 *
 * Nobody should have to type `<p>` to send an email. You write normally;
 * blank lines become paragraphs, single newlines become line breaks.
 */
export function textToHtml(text: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return (text ?? "")
    .trim()
    .split(/\n{2,}/)
    .filter((b) => b.trim())
    .map((b) => `<p>${esc(b.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

/**
 * HTML → plain text, but ONLY when it round-trips safely.
 *
 * Returns null when the body is richer than paragraphs and breaks (links,
 * images, styling). The editor then stays in HTML mode rather than silently
 * destroying someone's markup by "simplifying" it.
 */
export function htmlToText(html: string | null | undefined): string | null {
  const h = (html ?? "").trim();
  if (!h) return "";
  const tags = [...h.matchAll(/<\s*\/?\s*([a-zA-Z][a-zA-Z0-9]*)/g)].map((m) => m[1].toLowerCase());
  if (tags.some((t) => !["p", "br", "div"].includes(t))) return null;
  if (/\sstyle=|\sclass=|\shref=/i.test(h)) return null;

  return h
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/\s*(p|div)\s*>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ------------------------------------------------------------ when to send

/** How the send is described. The status is derived from this, not set by hand. */
export type SendMode = "now" | "at" | "repeating";

/**
 * What the admin should SEE, worked out from the record.
 *
 * The backend only knows draft/active/paused/archived, which says nothing
 * about whether a one-off has already gone. Asking someone to "Set live"
 * something they already scheduled is a lifecycle concept leaking into what
 * should just be a send.
 */
export function displayStatus(w: { status: WorkflowStatus; triggerType?: TriggerType | null; scheduledAt?: string | null }): {
  label: string;
  variant: "default" | "success" | "warning" | "info";
} {
  if (w.status === "draft") return { label: "Draft", variant: "warning" };
  if (w.status === "archived") return { label: "Archived", variant: "default" };
  if (w.status === "paused") return { label: "Paused", variant: "default" };
  if (w.triggerType && w.triggerType !== "once") return { label: "Repeating", variant: "success" };
  if (w.scheduledAt) {
    const t = new Date(w.scheduledAt).getTime();
    return Number.isFinite(t) && t > Date.now() ? { label: "Scheduled", variant: "info" } : { label: "Sent", variant: "default" };
  }
  return { label: "Sending", variant: "success" };
}

// ------------------------------------------------------- journey graph

export type NodeType = "START" | "END" | "ACTION" | "WAIT" | "CONDITION";

export type WaitUnit = "minutes" | "hours" | "days";
export const WAIT_UNITS: { value: WaitUnit; label: string }[] = [
  { value: "minutes", label: "minutes" },
  { value: "hours", label: "hours" },
  { value: "days", label: "days" },
];

export type ConditionOperator = "in" | "not_in" | "equals" | "gte" | "lte" | "gt" | "lt" | "exists" | "between";

export const OPERATORS: { value: ConditionOperator; label: string; arity: "list" | "one" | "two" | "none" }[] = [
  { value: "in", label: "is one of", arity: "list" },
  { value: "not_in", label: "is not one of", arity: "list" },
  { value: "equals", label: "is", arity: "one" },
  { value: "gt", label: "is more than", arity: "one" },
  { value: "gte", label: "is at least", arity: "one" },
  { value: "lt", label: "is less than", arity: "one" },
  { value: "lte", label: "is at most", arity: "one" },
  { value: "between", label: "is between", arity: "two" },
  { value: "exists", label: "is set", arity: "none" },
];

export const OPERATOR_LABELS: Record<string, string> = Object.fromEntries(OPERATORS.map((o) => [o.value, o.label]));

/** The exact field list the validator accepts (SUPPORTED_JOURNEY_CONDITION_FIELDS). */
export type ConditionField =
  | "user.createdAt"
  | "user.country"
  | "user.gender"
  | "user.age"
  | "subscription.status"
  | "subscription.isActive"
  | "subscription.willRenew"
  | "subscription.productId"
  | "subscription.entitlementId"
  | "subscription.store"
  | "subscription.expiresAt"
  | "subscription.lastEventType"
  | "streak.score"
  | "prayer.prayedOnTimeCount"
  | "prayer.activeConcurrentPrayedOnTime";

export const CONDITION_FIELDS: { value: ConditionField; label: string; group: string; kind: "text" | "number" | "date" | "bool" }[] = [
  { value: "subscription.status", label: "Subscription status", group: "Subscription", kind: "text" },
  { value: "subscription.isActive", label: "Subscription is active", group: "Subscription", kind: "bool" },
  { value: "subscription.willRenew", label: "Will renew", group: "Subscription", kind: "bool" },
  { value: "subscription.store", label: "Store", group: "Subscription", kind: "text" },
  { value: "subscription.productId", label: "Product", group: "Subscription", kind: "text" },
  { value: "subscription.entitlementId", label: "Entitlement", group: "Subscription", kind: "text" },
  { value: "subscription.expiresAt", label: "Expires at", group: "Subscription", kind: "date" },
  { value: "subscription.lastEventType", label: "Last event", group: "Subscription", kind: "text" },
  { value: "user.country", label: "Country", group: "User", kind: "text" },
  { value: "user.gender", label: "Gender", group: "User", kind: "text" },
  { value: "user.age", label: "Age", group: "User", kind: "number" },
  { value: "user.createdAt", label: "Signed up", group: "User", kind: "date" },
  { value: "streak.score", label: "Streak", group: "Prayer", kind: "number" },
  { value: "prayer.prayedOnTimeCount", label: "Prayed-on-time count", group: "Prayer", kind: "number" },
  { value: "prayer.activeConcurrentPrayedOnTime", label: "Consecutive on-time days", group: "Prayer", kind: "number" },
];

export const FIELD_LABELS: Record<string, string> = Object.fromEntries(CONDITION_FIELDS.map((f) => [f.value, f.label]));

export type JourneyNode = { id: string; type: NodeType; data?: Record<string, unknown> };
export type JourneyEdge = { from: string; to: string; branch?: "true" | "false" };
export type JourneyGraph = { nodes: JourneyNode[]; edges: JourneyEdge[] };

/**
 * The linear step list the builder edits. The backend wants a graph, so this
 * is the editable form and `stepsToGraph` is the translation.
 *
 * A CONDITION step splits the journey: everyone matching carries on down the
 * main line, everyone else exits. That's exactly the "campaign-level exit
 * condition" Adam asked for, expressed per-step, and it keeps the editor a
 * single vertical list instead of a canvas.
 */
export type Step =
  | { id: string; kind: "action"; actionType: ActionType; payload: ActionPayload }
  | { id: string; kind: "wait"; value: number; unit: WaitUnit }
  | { id: string; kind: "condition"; field: ConditionField; operator: ConditionOperator; value?: unknown };

export const FIELD_KIND: Record<string, "text" | "number" | "date" | "bool"> = Object.fromEntries(
  CONDITION_FIELDS.map((f) => [f.value, f.kind])
);

/** Operators that carry a list of values rather than a single one. */
export const LIST_OPERATORS = new Set<ConditionOperator>(["in", "not_in", "between"]);

/**
 * Keep a condition's value consistent with its field and operator.
 *
 * Without this, switching the field from "Subscription is active" (a
 * yes/no) to "Streak" left the boolean behind, and switching the operator
 * from "is one of" to "is" left an array where the backend expects a single
 * value. Number fields also have to send real numbers — a string "3" is not
 * the same thing to the API.
 */
export function coerceConditionValue(field: ConditionField, operator: ConditionOperator, raw: unknown): unknown {
  const kind = FIELD_KIND[field] ?? "text";
  if (operator === "exists") return undefined;

  const asScalar = (v: unknown) => (Array.isArray(v) ? v[0] : v);
  const toKind = (v: unknown) => {
    if (kind === "bool") return v === true || v === "true";
    if (kind === "number") {
      const n = Number(v);
      return Number.isFinite(n) ? n : "";
    }
    return v === undefined || v === null ? "" : String(v);
  };

  if (LIST_OPERATORS.has(operator)) {
    const arr = Array.isArray(raw) ? raw : raw === undefined || raw === "" ? [] : [raw];
    // A yes/no field has nothing sensible to list — fall back to a single value.
    if (kind === "bool") return toKind(asScalar(arr));
    return arr.map(toKind).filter((v) => v !== "");
  }
  return toKind(asScalar(raw));
}

export function newStepId(existing: Step[]): string {
  // Stable, readable ids — the graph stores them, so they must survive edits.
  let n = existing.length + 1;
  const taken = new Set(existing.map((s) => s.id));
  while (taken.has(`s${n}`)) n++;
  return `s${n}`;
}

/** Steps → the graph shape the backend validates. */
export function stepsToGraph(steps: Step[]): JourneyGraph {
  // One shared END. CONDITION false-branches route here too, which is what
  // "everyone else leaves the journey" means.
  const END = "end";
  const nodes: JourneyNode[] = [{ id: "start", type: "START", data: {} }];

  for (const s of steps) {
    if (s.kind === "action") {
      nodes.push({ id: s.id, type: "ACTION", data: { actionType: s.actionType, payload: s.payload } });
    } else if (s.kind === "wait") {
      nodes.push({ id: s.id, type: "WAIT", data: { duration: { value: s.value, unit: s.unit } } });
    } else {
      nodes.push({
        id: s.id,
        type: "CONDITION",
        data: { condition: { field: s.field, operator: s.operator, ...(s.operator === "exists" ? {} : { value: s.value }) } },
      });
    }
  }
  nodes.push({ id: END, type: "END", data: {} });

  const seq = steps.map((s) => s.id);
  const edges: JourneyEdge[] = [{ from: "start", to: seq[0] ?? END }];
  seq.forEach((id, i) => {
    const next = i + 1 < seq.length ? seq[i + 1] : END;
    if (steps[i].kind === "condition") {
      // A CONDITION needs BOTH branches: true continues, false drops to END.
      edges.push({ from: id, to: next, branch: "true" });
      edges.push({ from: id, to: END, branch: "false" });
    } else {
      edges.push({ from: id, to: next });
    }
  });

  return { nodes, edges };
}

/** Graph → steps, for editing a journey that already exists. */
export function graphToSteps(graph: JourneyGraph | null | undefined): Step[] {
  if (!graph?.nodes?.length) return [];
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const out: Step[] = [];
  const start = graph.nodes.find((n) => n.type === "START");
  if (!start) return [];

  const seen = new Set<string>();
  let cur: string | undefined = graph.edges.find((e) => e.from === start.id)?.to;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const node = byId.get(cur);
    if (!node || node.type === "END") break;
    const d = (node.data ?? {}) as Record<string, any>;
    if (node.type === "ACTION") {
      out.push({ id: node.id, kind: "action", actionType: d.actionType, payload: d.payload ?? {} });
    } else if (node.type === "WAIT") {
      out.push({ id: node.id, kind: "wait", value: d.duration?.value ?? 1, unit: d.duration?.unit ?? "days" });
    } else if (node.type === "CONDITION") {
      out.push({ id: node.id, kind: "condition", field: d.condition?.field, operator: d.condition?.operator, value: d.condition?.value });
    }
    // Follow the main line: the true branch for a condition, else the only edge.
    const outEdges = graph.edges.filter((e) => e.from === cur);
    cur = (node.type === "CONDITION" ? outEdges.find((e) => e.branch === "true") : outEdges[0])?.to;
  }
  return out;
}

/** One-line human summary of a step, for the collapsed list rows. */
export function describeStep(s: Step): string {
  if (s.kind === "wait") return `Wait ${s.value} ${s.unit}`;
  if (s.kind === "condition") {
    const f = FIELD_LABELS[s.field] ?? s.field;
    const op = OPERATOR_LABELS[s.operator] ?? s.operator;
    if (s.operator === "exists") return `Only continue if ${f} is set`;
    // A yes/no field reads as "… is Yes", not "… is true".
    const v =
      FIELD_KIND[s.field] === "bool"
        ? s.value === true || s.value === "true"
          ? "Yes"
          : "No"
        : Array.isArray(s.value)
          ? s.value.join(", ")
          : s.value;
    return `Only continue if ${f} ${op} ${v ?? ""}`.trim();
  }
  const p = s.payload as Record<string, string>;
  if (s.actionType === "email") return `Email — ${p.subject || "no subject"}`;
  if (s.actionType === "push") return `Push — ${p.title || "no title"}`;
  return "Show a banner";
}

/** Client-side mirror of the backend validator, so the builder can flag
 * problems before a round trip. The backend is still the authority. */
export function validateSteps(steps: Step[]): string[] {
  const errs: string[] = [];
  if (steps.length === 0) errs.push("Add at least one step.");
  steps.forEach((s, i) => {
    const n = `Step ${i + 1}`;
    if (s.kind === "wait") {
      if (!(s.value > 0)) errs.push(`${n}: the wait has to be longer than zero.`);
    } else if (s.kind === "condition") {
      if (!s.field) errs.push(`${n}: pick what to check.`);
      if (!s.operator) errs.push(`${n}: pick a comparison.`);
      if (s.operator !== "exists" && (s.value === undefined || s.value === "" || (Array.isArray(s.value) && !s.value.length)))
        errs.push(`${n}: give the condition a value.`);
    } else {
      const p = s.payload as Record<string, string>;
      if (s.actionType === "email") {
        if (!p.subject?.trim()) errs.push(`${n}: the email needs a subject.`);
        if (!p.html?.trim() && !p.text?.trim()) errs.push(`${n}: the email needs a body.`);
      } else if (s.actionType === "push") {
        if (!p.title?.trim()) errs.push(`${n}: the notification needs a title.`);
        if (!p.body?.trim()) errs.push(`${n}: the notification needs a message.`);
      } else if (!p.messageId) {
        errs.push(`${n}: pick which banner to show.`);
      }
    }
  });
  return errs;
}
