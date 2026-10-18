import { knownPlaceSource } from "@/lib/attribution";
import { NextRequest,NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { marketOf, marketPermission, marketCreatorIds, type Market } from "@/lib/creatorMarket";
import { readAttribution,fetchAttributionCreators } from "@/lib/attributionStore";
import { readReview,updateReview,ReviewError } from "@/lib/attributionReviewStore";
import { answerKey,decideAnswers,mergeAnswers } from "@/lib/attributionReview";
import { runAttributionReview } from "@/lib/attributionReviewJob";
export const dynamic="force-dynamic";
export const maxDuration=300;

/** The queue is one shared list of answers. The second-market section sees pending
 * answers plus those linked to its own creators, and links only to them. */
async function view(host:string,market:Market) {
  const [state,payload,creators,inMarket]=await Promise.all([readReview(host),readAttribution(host),fetchAttributionCreators(),marketCreatorIds(market)]);
  const mine=creators.filter(c=>inMarket.has(c.id));
  const visible=(r:{status:string;creatorId?:string;raw:string})=>(r.status==="approved"||!knownPlaceSource(r.raw))&&(market==="en"||r.status==="pending"||(!!r.creatorId&&inMarket.has(r.creatorId)));
  return {state:{...state,answers:Object.fromEntries(Object.entries(mergeAnswers(state,payload)).filter(([,r])=>visible(r)))},creators:mine.map(c=>({id:c.id,name:c.name})).sort((a,b)=>a.name.localeCompare(b.name))};
}
function failure(error:unknown) {
  return NextResponse.json({error:error instanceof Error?error.message:"Attribution request failed"},{status:error instanceof ReviewError?error.status:500});
}
export async function GET(req:NextRequest) {
  const market=marketOf(req);
  const guard=await requireSession(req,marketPermission(market));
  if(!guard.ok)return NextResponse.json({error:guard.error},{status:guard.status});
  try{return NextResponse.json(await view(req.headers.get("host")??"",market));}catch(error){return failure(error);}
}
export async function POST(req:NextRequest) {
  const market=marketOf(req);
  const guard=await requireSession(req,marketPermission(market,true));
  if(!guard.ok)return NextResponse.json({error:guard.error},{status:guard.status});
  const host=req.headers.get("host")??"";
  try {
    const body=await req.json();
    if(market==="alt") {
      // Refusing, reopening and rescanning change the shared queue for both
      // sections, so they stay in the main Creators section. The second market links answers to
      // its own creators only.
      const inMarket=await marketCreatorIds("alt");
      const linkingOwn=(body.action==="approve"||(body.action==="bulk_decide"&&body.decision==="approve"))&&inMarket.has(String(body.creatorId));
      if(!linkingOwn)throw new ReviewError("In the second-market section you can link answers to that market's creators. Refusing and rescanning are done in the main Creators section.",403);
    }
    if(body.action==="scan") {
      await runAttributionReview(host,true);
      return NextResponse.json(await view(host,market));
    }
    if(body.action==="bulk_decide") {
      if(!["approve","refuse"].includes(body.decision)||!Array.isArray(body.raws))throw new ReviewError("Invalid bulk attribution decision",400);
      const [payload,creators]=await Promise.all([readAttribution(host),fetchAttributionCreators()]);
      const creator=creators.find(c=>c.id===body.creatorId);
      try { await updateReview(host,state=>({...state,answers:decideAnswers(mergeAnswers(state,payload),body.raws,body.decision,creator)})); }
      catch(error){if(error instanceof Error && !(error instanceof ReviewError))throw new ReviewError(error.message,400);throw error;}
      return NextResponse.json(await view(host,market));
    }
    if(!["approve","refuse","reopen"].includes(body.action)||typeof body.raw!=="string"||!body.raw.trim()||body.raw.length>2000) throw new ReviewError("Invalid attribution decision",400);
    const [payload,creators]=await Promise.all([readAttribution(host),fetchAttributionCreators()]);
    const creator=creators.find(c=>c.id===body.creatorId);
    if(body.action==="approve"&&!creator)throw new ReviewError("Choose an existing creator",400);
    await updateReview(host,state=>{
      const answers=mergeAnswers(state,payload),key=answerKey(body.raw),row=answers[key];
      if(!row)throw new ReviewError("This answer is no longer in the list. Refresh and try again.");
      if(knownPlaceSource(body.raw)&&row.status!=="approved")throw new ReviewError("This is a known source, not a creator name. Refresh the list.");
      if(row.status==="approved") {
        if(body.action==="approve"&&row.creatorId===creator?.id)return state;
        throw new ReviewError("This answer has already been linked to a creator.");
      }
      answers[key]={...row,status:body.action==="approve"?"approved":body.action==="refuse"?"refused":"pending",creatorId:body.action==="approve"?creator!.id:undefined,creatorName:body.action==="approve"?creator!.name:undefined,reviewedAt:new Date().toISOString(),suggestions:[]};
      return {...state,answers};
    });
    return NextResponse.json(await view(host,market));
  }catch(error){return failure(error);}
}
