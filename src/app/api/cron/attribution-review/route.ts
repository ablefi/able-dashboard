import {NextRequest,NextResponse} from "next/server";
import {runAttributionReview} from "@/lib/attributionReviewJob";
import {ReviewError} from "@/lib/attributionReviewStore";
export const dynamic="force-dynamic";
export const maxDuration=300;
export async function GET(req:NextRequest) {
  const secret=process.env.CRON_SECRET;
  if(!secret||req.headers.get("authorization")!==`Bearer ${secret}`)return NextResponse.json({error:"Unauthorized"},{status:401});
  try {
    const result=await runAttributionReview(req.headers.get("host")??"");
    return NextResponse.json({ok:true,skipped:result.skipped,lastRunAt:result.state.lastRunAt,nextRunAt:result.state.nextRunAt});
  }catch(error) {
    if(error instanceof ReviewError&&error.status===409)return NextResponse.json({ok:true,skipped:true,reason:error.message});
    return NextResponse.json({error:error instanceof Error?error.message:"Scan failed"},{status:502});
  }
}
