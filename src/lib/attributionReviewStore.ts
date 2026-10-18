import "server-only";
import { randomUUID } from "crypto";
import { backendBaseFor, BACKEND_BASES } from "./auth";
import { type ReviewState } from "./attributionReview";

const stateKey = (host: string) => `creator_attribution_review_${backendBaseFor(host) === BACKEND_BASES.production ? "prod" : "staging"}`;
const headers = () => ({ apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`, "Content-Type":"application/json" });
const endpoint = () => `${process.env.SUPABASE_URL}/rest/v1/app_state`;
export class ReviewError extends Error { constructor(message:string,public status=409){super(message);} }

export async function readReview(host: string): Promise<ReviewState> {
  const response = await fetch(`${endpoint()}?key=eq.${stateKey(host)}&select=value`, {headers:headers(),cache:"no-store"});
  if (!response.ok) throw new Error("Could not load attribution decisions");
  const rows = await response.json();
  return rows[0]?.value ?? { revision:"",answers:{} };
}

/** Compare-and-swap prevents two reviewers or a finishing job from overwriting
 * one another. No schema or globally shared staging/production state needed. */
export async function updateReview(host:string, change:(state:ReviewState)=>ReviewState):Promise<ReviewState> {
  for(let attempt=0;attempt<8;attempt++) {
    const current = await readReview(host);
    const next = { ...change(structuredClone(current)), revision:randomUUID() };
    const creating = !current.revision;
    const url = creating ? `${endpoint()}?on_conflict=key` : `${endpoint()}?key=eq.${stateKey(host)}&value->>revision=eq.${current.revision}`;
    const response = await fetch(url, {method:creating?"POST":"PATCH",headers:{...headers(),Prefer:`return=representation${creating?",resolution=ignore-duplicates":""}`},body:JSON.stringify({key:stateKey(host),value:next,updated_at:new Date().toISOString()})});
    if(!response.ok) throw new Error("Could not save attribution decisions");
    if((await response.json()).length) return next;
  }
  throw new ReviewError("Attribution changed in another window. Please try again.");
}
