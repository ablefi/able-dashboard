import "server-only";
import {knownPlaceSource} from "./attribution";
import { randomUUID } from "crypto";
import { readAttribution, refreshAttribution, fetchAttributionCreators } from "./attributionStore";
import { readReview, updateReview, ReviewError } from "./attributionReviewStore";
import { mergeAnswers, suggestCreators, REVIEW_INTERVAL_MS } from "./attributionReview";

export async function runAttributionReview(host:string, manual=false) {
  const previous = await readReview(host);
  if (!manual && previous.nextRunAt && Date.parse(previous.nextRunAt)>Date.now()) return { skipped:true,state:previous };
  const runId = randomUUID();
  await updateReview(host, state => {
    if (state.runningUntil && Date.parse(state.runningUntil)>Date.now()) throw new ReviewError("A suggestion scan is already running.");
    if (!manual && state.nextRunAt && Date.parse(state.nextRunAt)>Date.now()) throw new ReviewError("The next scan is not due yet.");
    return {...state,runId,runningUntil:new Date(Date.now()+10*60*1000).toISOString(),lastError:undefined};
  });
  try {
    // Analytics already refreshes every eight hours. Reuse a fresh snapshot
    // rather than fetching every legacy user again just to suggest name matches.
    const cached = await readAttribution(host);
    const payload = cached && Date.now() - Date.parse(cached.computedAt) < 8 * 60 * 60 * 1000
      ? cached : await refreshAttribution(host);
    if("error" in payload) throw new Error(payload.error);
    const creators = await fetchAttributionCreators();
    const finished = new Date();
    const state = await updateReview(host,current => {
      if(current.runId!==runId) throw new ReviewError("This scan was superseded. Refresh to see the latest results.");
      const answers=mergeAnswers(current,payload);
      for(const row of Object.values(answers)) row.suggestions=row.status==="pending"&&!knownPlaceSource(row.raw)?suggestCreators(row.raw,creators):[];
      return {...current,answers,lastRunAt:finished.toISOString(),nextRunAt:new Date(finished.getTime()+REVIEW_INTERVAL_MS).toISOString(),runningUntil:undefined,runId:undefined,lastError:undefined};
    });
    return {skipped:false,state};
  } catch(error) {
    await updateReview(host,state=>state.runId===runId?{...state,runningUntil:undefined,runId:undefined,lastError:error instanceof Error?error.message:"Scan failed"}:state);
    throw error;
  }
}
