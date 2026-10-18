import { squash, editDistance, knownPlaceSource, type CreatorRow } from "./attribution";
import type { AttributionPayload, CreatorAttribution, Demographics, UnmatchedAnswer } from "./attributionJob";

export const REVIEW_INTERVAL_MS = 48 * 60 * 60 * 1000;
export type Suggestion = { creatorId: string; name: string; reason: string; score: number };
export type ReviewAnswer = UnmatchedAnswer & {
  status: "pending" | "approved" | "refused";
  creatorId?: string;
  creatorName?: string;
  suggestions: Suggestion[];
  reviewedAt?: string;
};
export type ReviewState = {
  revision: string;
  answers: Record<string, ReviewAnswer>;
  lastRunAt?: string;
  nextRunAt?: string;
  runningUntil?: string;
  runId?: string;
  lastError?: string;
};
export const answerKey = (raw: string) => squash(raw) || raw.trim().toLowerCase();

/** Validate the full selection before changing any answer. */
export function decideAnswers(answers: Record<string, ReviewAnswer>, raws: string[], action: "approve" | "refuse", creator?: {id:string;name:string}) {
  if (!Array.isArray(raws) || raws.some(raw => typeof raw !== "string" || !raw.trim() || raw.length > 2000)) throw new Error("Invalid attribution name");
  if (!raws.length || raws.length > 100 || new Set(raws.map(answerKey)).size !== raws.length) throw new Error("Select 1–100 distinct names");
  if (action === "approve" && !creator) throw new Error("Choose an existing creator");
  const next = {...answers};
  const reviewedAt = new Date().toISOString();
  for (const raw of raws) {
    const key = answerKey(raw), row = next[key];
    if (!row || row.status !== "pending" || knownPlaceSource(raw)) throw new Error(`“${raw}” is no longer awaiting review. Refresh and try again.`);
    next[key] = {...row,status:action === "approve" ? "approved" : "refused",creatorId:action === "approve" ? creator!.id : undefined,creatorName:action === "approve" ? creator!.name : undefined,reviewedAt,suggestions:[]};
  }
  return next;
}

/** Suggestions only: never writes aliases or credits a creator automatically. */
export function suggestCreators(raw: string, creators: CreatorRow[]): Suggestion[] {
  const input = squash(raw);
  if (input.length < 3) return [];
  return creators.map((creator) => {
    let best = 0, reason = "Similar spelling";
    for (const name of [creator.name, creator.instagram_handle, creator.tiktok_handle, creator.youtube_handle, ...(creator.attribution_names ?? [])]) {
      if (!name) continue;
      const key = squash(name);
      if (key.length < 3) continue;
      const max = Math.max(3, Math.floor(Math.max(input.length, key.length) * .35));
      const distance = editDistance(input, key, max);
      let score = distance > max ? 0 : 1 - distance / Math.max(input.length, key.length);
      let why = "Similar spelling";
      if (key === input) { score = 1; why = "Matches a roster name or handle"; }
      else if (input.length >= 4 && (key.includes(input) || input.includes(key))) { score = Math.max(score, .85); why = "Name or handle appears in the answer"; }
      if (score > best) { best = score; reason = why; }
    }
    return { creatorId: creator.id, name: creator.name, score: best, reason };
  }).filter((s) => s.score >= (input.length < 8 ? .8 : .65)).sort((a,b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0,3);
}

export function mergeAnswers(state: ReviewState, payload: AttributionPayload | null): Record<string, ReviewAnswer> {
  const answers = { ...state.answers };
  for (const row of payload?.unmatched ?? []) {
    const key = answerKey(row.raw);
    answers[key] = { ...(answers[key] ?? { status: "pending", suggestions: [] }), ...row };
  }
  return answers;
}

const emptyDemo = (): Demographics => ({ ageCount: 0, avgAge: null, ageBuckets: [], gender: [], countries: [], platforms: [], platformCount: 0 });
function mergeDemo(a: Demographics, b?: Demographics): Demographics {
  if (!b) return a;
  const merge = (x: {name:string;count:number}[], y: {name:string;count:number}[]) => {
    const m = new Map(x.map(r => [r.name,r.count]));
    for(const r of y) m.set(r.name,(m.get(r.name)??0)+r.count);
    return [...m].map(([name,count])=>({name,count}));
  };
  const ageCount = a.ageCount + b.ageCount;
  return { ageCount, avgAge: ageCount ? +(((a.avgAge??0)*a.ageCount+(b.avgAge??0)*b.ageCount)/ageCount).toFixed(1) : null,
    ageBuckets:merge(a.ageBuckets,b.ageBuckets),gender:merge(a.gender,b.gender),
    countries:merge(a.countries.map(r=>({name:r.code,count:r.count})),b.countries.map(r=>({name:r.code,count:r.count}))).map(r=>({code:r.name,count:r.count})),
    platforms:merge(a.platforms,b.platforms),platformCount:a.platformCount+b.platformCount };
}

/** Apply new approvals immediately to the last snapshot. The next aggregation
 * uses the same decisions and recomputes demographics from individual rows. */
export function applyReview(payload: AttributionPayload, state: ReviewState): AttributionPayload {
  const creators = new Map(payload.creators.map(c => [c.creatorId, structuredClone(c)]));
  let addedRevenue = 0, movedToPlaces = 0;
  const places = new Map(payload.places.map(p => [p.id, {...p, display: p.id === "_chatgpt" ? "AI assistants" : p.display}]));
  const platformMix = new Map(payload.totals.platformMix.map(p => [p.name,p.count]));
  const unmatched = payload.unmatched.filter(row => {
    const decision = state.answers[answerKey(row.raw)];
    if (decision?.status !== "approved" || !decision.creatorId) {
      const knownPlace = knownPlaceSource(row.raw);
      if (!knownPlace) return true;
      const place = places.get(knownPlace.id) ?? {...knownPlace, downloads:0, payers:0, revenue:0};
      place.downloads += row.downloads; place.payers += row.payers;
      place.revenue = +(place.revenue + row.revenue).toFixed(2);
      places.set(knownPlace.id, place); movedToPlaces += row.downloads;
      return false;
    }
    const creator: CreatorAttribution = creators.get(decision.creatorId) ?? { creatorId:decision.creatorId,name:decision.creatorName??"Creator",downloads:0,payers:0,revenue:0,spellings:[],demographics:emptyDemo() };
    creator.downloads += row.downloads; creator.payers += row.payers; creator.revenue = +(creator.revenue+row.revenue).toFixed(2);
    creator.spellings.push({raw:row.raw,count:row.downloads});
    creator.demographics = mergeDemo(creator.demographics,row.demographics);
    creators.set(creator.creatorId,creator); addedRevenue += row.revenue;
    for (const p of row.demographics?.platforms ?? []) platformMix.set(p.name,(platformMix.get(p.name)??0)+p.count);
    return false;
  });
  return { ...payload, places:[...places.values()].sort((a,b)=>b.downloads-a.downloads), creators:[...creators.values()].sort((a,b)=>b.revenue-a.revenue||b.downloads-a.downloads),unmatched,
    totals:{...payload.totals,people:payload.totals.people-movedToPlaces,places:payload.totals.places+movedToPlaces,platformMix:[...platformMix].map(([name,count])=>({name,count})),creatorRevenue:+(payload.totals.creatorRevenue+addedRevenue).toFixed(2)} };
}

/** Roll up the current roster on read, so moving/detaching accounts takes
 * effect immediately without rewriting the original attribution snapshot. */
export function rollupPersonaAttribution(payload: AttributionPayload, roster: CreatorRow[]): AttributionPayload {
  const byId = new Map(roster.map(c => [c.id, c]));
  const personaByAccount: Record<string, string> = {};
  for (const c of roster) {
    if (c.parent_id && byId.get(c.parent_id)?.type === "persona") personaByAccount[c.id] = c.parent_id;
  }
  const grouped = new Map<string, CreatorAttribution>();
  for (const row of payload.creators) {
    const id = personaByAccount[row.creatorId] ?? row.creatorId;
    const existing = grouped.get(id);
    if (!existing) { grouped.set(id, {...structuredClone(row), creatorId: id, name: byId.get(id)?.name ?? row.name}); continue; }
    existing.downloads += row.downloads;
    existing.payers += row.payers;
    existing.revenue = +(existing.revenue + row.revenue).toFixed(2);
    const spellings = new Map(existing.spellings.map(s => [s.raw, s.count]));
    for (const s of row.spellings) spellings.set(s.raw, (spellings.get(s.raw) ?? 0) + s.count);
    existing.spellings = [...spellings].map(([raw, count]) => ({raw, count}));
    existing.demographics = mergeDemo(existing.demographics, row.demographics);
  }
  return {...payload, personaByAccount, creators: [...grouped.values()].sort((a,b) => b.revenue-a.revenue || b.downloads-a.downloads)};
}
