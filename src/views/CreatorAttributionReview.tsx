"use client";
import {useCallback,useEffect,useState} from "react";
import Link from "next/link";
import {Loader2,RefreshCw,ArrowLeft} from "lucide-react";
import {toast} from "react-toastify";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import {fmtDateTime} from "@/lib/dates";
import {answerKey,type ReviewState} from "@/lib/attributionReview";
import {useAuth} from "@/context/AuthContext";
import {invalidateAttribution} from "@/components/creators/attribution";
import { creatorApi, useCreatorSection } from "@/lib/creatorMarketClient";

type Data={state:ReviewState;creators:{id:string;name:string}[]};
const input="w-full rounded-xl border border-white/[0.1] bg-app-navy-card px-3 py-2 text-sm text-ink";
export default function CreatorAttributionReview(){
  const { base: creatorsBase, ar } = useCreatorSection();
  const [data,setData]=useState<Data|null>(null),[error,setError]=useState<string|null>(null),[loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false),[query,setQuery]=useState(""),[selected,setSelected]=useState(""),[creatorId,setCreatorId]=useState("");
  const [filter,setFilter]=useState("pending"),[sort,setSort]=useState("recent"),[checked,setChecked]=useState<string[]>([]),[bulkCreatorId,setBulkCreatorId]=useState("");
  const {can}=useAuth();const canWrite=can(ar?"alt-creators:write":"creators:write");
  // the second-market section links answers to its own creators only; refusing, reopening
  // and rescanning change the shared queue, so they stay in the main Creators section.
  const canRefuse=canWrite&&!ar;
  const load=useCallback(async()=>{
    try{const r=await fetch(creatorApi("/api/creators/attribution/review"),{cache:"no-store"});const j=await r.json();if(!r.ok)throw new Error(j.error||"Could not load attribution");setData(j);setError(null);}catch(e){setError(e instanceof Error?e.message:"Could not load attribution");}finally{setLoading(false);}
  },[]);
  useEffect(()=>{load();},[load]);
  const running=!!data?.state.runningUntil&&Date.parse(data.state.runningUntil)>Date.now();
  useEffect(()=>{if(!running)return;const timer=setInterval(load,10000);return()=>clearInterval(timer);},[running,load]);
  const all=Object.values(data?.state.answers??{}),unlinked=all.filter(r=>r.status!=="approved");
  const rows=unlinked.filter(r=>(filter==="all"||r.status===filter)&&r.raw.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>{
    if(sort==="name")return a.raw.localeCompare(b.raw);
    if(sort==="revenue")return b.revenue-a.revenue||b.downloads-a.downloads;
    if(sort==="installs")return b.downloads-a.downloads||a.raw.localeCompare(b.raw);
    return (Date.parse(b.lastSeenAt??"")||0)-(Date.parse(a.lastSeenAt??"")||0)||b.downloads-a.downloads||a.raw.localeCompare(b.raw);
  });
  const row=rows.find(r=>answerKey(r.raw)===selected)??rows[0];
  const key=row?answerKey(row.raw):"";
  const pendingRows=rows.filter(r=>r.status==="pending"),visibleKeys=pendingRows.map(r=>answerKey(r.raw));
  const selectedRows=unlinked.filter(r=>checked.includes(answerKey(r.raw))&&r.status==="pending");
  const allVisible=!!visibleKeys.length&&visibleKeys.every(k=>checked.includes(k));
  useEffect(()=>{setCreatorId("");},[key]);
  function toggleChecked(key:string){setChecked(current=>current.includes(key)?current.filter(k=>k!==key):[...current,key].slice(0,100));}
  async function actBulk(decision:"approve"|"refuse"){
    if(!selectedRows.length)return;
    const creator=data?.creators.find(c=>c.id===bulkCreatorId);
    const message=decision==="approve"?`Permanently link ${selectedRows.length} names to ${creator?.name}?`:`Permanently refuse ${selectedRows.length} names?`;
    if(!window.confirm(message))return;
    setBusy(true);setError(null);
    try{
      const response=await fetch(creatorApi("/api/creators/attribution/review"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"bulk_decide",decision,raws:selectedRows.map(r=>r.raw),creatorId:bulkCreatorId})});
      const result=await response.json();if(!response.ok)throw new Error(result.error||"Could not save attribution");
      setData(result);invalidateAttribution();setChecked([]);setBulkCreatorId("");
      toast.success(`${selectedRows.length} names ${decision==="approve"?"linked":"refused"}`);
    }catch(e){setError(e instanceof Error?e.message:"Request failed");}finally{setBusy(false);}
  }
  async function act(action:string){
    setBusy(true);setError(null);
    try{
      const r=await fetch(creatorApi("/api/creators/attribution/review"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,raw:row?.raw,creatorId})});
      const j=await r.json();if(!r.ok)throw new Error(j.error||"Could not save attribution");
      setData(j);invalidateAttribution();setCreatorId("");
      toast.success(action==="scan"?"Suggestions updated":action==="approve"?"Permanently linked to the creator":action==="refuse"?"Permanently refused":"Ready to review again");
    }catch(e){setError(e instanceof Error?e.message:"Request failed");}finally{setBusy(false);}
  }
  return <div className="space-y-4">
    <Link href={creatorsBase} className="inline-flex items-center gap-2 text-sm text-ink-muted"><ArrowLeft className="h-4 w-4"/>Creator roster</Link>
    <PageHeader title="Attribution" subtitle={ar?"Link the names people entered to the right second-market creator.":"Link the names people entered to the right creator."} actions={ar?undefined:<Button size="sm" variant="secondary" disabled={busy||running||!canWrite||loading||!data} onClick={()=>act("scan")}>{busy||running?<Loader2 className="h-4 w-4 animate-spin"/>:<RefreshCw className="h-4 w-4"/>}{busy||running?"Working…":"Find suggestions now"}</Button>}/>
    <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-muted">
      <span>Last scan: {data?.state.lastRunAt?fmtDateTime(data.state.lastRunAt):"Not run yet"}</span>
      <span>Next automatic scan: {data?.state.nextRunAt?`${fmtDateTime(data.state.nextRunAt)} or shortly after`:"Due"}</span>
      <span>No paid AI or ScrapeCreators calls</span>
    </div>
    {(error||data?.state.lastError)&&<div role="alert" className="rounded-xl border border-app-red/30 bg-app-red/10 p-3 text-sm text-app-red-text">{error||data?.state.lastError} <Button size="sm" variant="ghost" disabled={busy} onClick={load}>Retry loading</Button></div>}
    {loading?<div className="flex items-center gap-2 py-12 text-ink-muted"><Loader2 className="h-5 w-5 animate-spin"/>Loading attribution…</div>:data&&<div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
      <section className="overflow-hidden rounded-xl border border-white/[0.08] bg-app-navy-card/50">
        <div className="space-y-3 p-4">
          <h2 className="text-sm font-semibold text-ink">Awaiting review <span className="ml-2 text-ink-faint">{unlinked.filter(r=>r.status==="pending").length}</span></h2>
          <div className="app-toolbar grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]"><input type="search" aria-label="Search attribution names" placeholder="Search names…" className={input+" min-w-0"} value={query} onChange={e=>{setQuery(e.target.value);setChecked([]);}}/><select aria-label="Filter attribution names" className={input} value={filter} onChange={e=>{setFilter(e.target.value);setChecked([]);}}><option value="pending">Awaiting review</option><option value="refused">Permanently refused</option><option value="all">All names</option></select><select aria-label="Sort attribution names" className={input} value={sort} onChange={e=>setSort(e.target.value)}><option value="recent">Most recent activity</option><option value="installs">Most installs</option><option value="revenue">Most revenue</option><option value="name">Name A–Z</option></select></div>
          {sort==="recent"&&unlinked.length>0&&!unlinked.some(r=>r.lastSeenAt)&&<p className="text-xs text-ink-faint">Recency will appear after the next attribution refresh. Showing highest installs until then.</p>}
          {selectedRows.length>0&&<div className="flex flex-wrap items-center gap-2 rounded-xl border border-app-blue/40 bg-app-blue/10 p-3 text-sm text-ink"><span className="font-medium">{selectedRows.length} selected</span><select aria-label="Link selected names to creator" className={input+" max-w-52"} value={bulkCreatorId} disabled={busy||!canWrite} onChange={e=>setBulkCreatorId(e.target.value)}><option value="">Choose a creator…</option>{data.creators.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><Button size="sm" disabled={busy||!canWrite||!bulkCreatorId} onClick={()=>actBulk("approve")}>Approve &amp; link</Button>{canRefuse&&<Button size="sm" variant="secondary" disabled={busy} onClick={()=>actBulk("refuse")}>Permanently refuse</Button>}<button type="button" className="text-xs text-ink-muted underline" onClick={()=>setChecked([])}>Clear</button></div>}
        </div>
        <div className="max-h-[65vh] overflow-auto"><table className="w-full min-w-[30rem] table-fixed text-sm"><colgroup><col style={{width:"6%"}}/><col style={{width:"44%"}}/><col style={{width:"16%"}}/><col style={{width:"12%"}}/><col style={{width:"22%"}}/></colgroup><thead className="sticky top-0 z-10 border-b border-white/[0.12] bg-app-navy-card text-left text-xs text-ink-muted"><tr><th className="px-3 py-3"><input type="checkbox" aria-label="Select all visible awaiting-review names" disabled={busy||!canWrite||!visibleKeys.length} checked={allVisible} onChange={()=>setChecked(current=>allVisible?current.filter(k=>!visibleKeys.includes(k)):[...new Set([...current,...visibleKeys])].slice(0,100))}/></th><th className="px-4 py-3">Name entered</th><th className="px-3 py-3 text-right">Installs</th><th className="px-3 py-3 text-right">Paid</th><th className="px-4 py-3 text-right">Revenue</th></tr></thead><tbody>{rows.map(r=><tr key={answerKey(r.raw)} data-row-action={!busy?"select":undefined} data-selected={key===answerKey(r.raw)} onClick={()=>{if(!busy)setSelected(answerKey(r.raw));}} className={busy?"":"cursor-pointer"}><td className="px-3 py-3"><input type="checkbox" aria-label={`Select ${r.raw}`} disabled={busy||!canWrite||r.status!=="pending"} checked={checked.includes(answerKey(r.raw))} onClick={e=>e.stopPropagation()} onChange={()=>toggleChecked(answerKey(r.raw))}/></td><td className="break-words px-4 py-3 text-ink">{r.raw}{r.status==="refused"&&<span className="mt-1 block text-xs text-ink-faint">Permanently refused</span>}{r.lastSeenAt&&<span className="mt-1 block text-xs text-ink-faint">Last seen {fmtDateTime(r.lastSeenAt)}</span>}</td><td className="px-3 py-3 text-right num text-ink-muted">{r.downloads}</td><td className="px-3 py-3 text-right num text-ink-muted">{r.payers||"–"}</td><td className="px-4 py-3 text-right num text-ink-muted">{r.revenue?`$${r.revenue.toFixed(2)}`:"–"}</td></tr>)}</tbody></table>{!rows.length&&<p className="p-6 text-sm text-ink-muted">{unlinked.length?"No names match this filter.":"No names waiting for attribution."}</p>}</div>
      </section>
      <section className="space-y-5 rounded-xl border border-white/[0.08] bg-app-navy-card/50 p-5 lg:sticky lg:top-4">
        {selectedRows.length?<div><h2 className="text-base font-semibold text-ink">{selectedRows.length} names selected</h2><p className="mt-2 text-sm text-ink-muted">Use the controls above the list to link them all to one creator or permanently refuse them.</p></div>:row?<><div><h2 className="text-base font-semibold text-ink break-words">{row.raw}</h2><p className="mt-1 text-xs text-ink-muted">{row.status==="refused"?"Permanently refused. Future scans will leave this name alone.":"Suggested matches need your approval before anything is linked."}</p></div>
          {row.status==="refused"?(canRefuse?<Button size="sm" variant="secondary" disabled={busy} onClick={()=>act("reopen")}>Review again</Button>:null):<>
            <div className="space-y-2"><h3 className="text-sm font-medium text-ink">Suggestions</h3>{row.suggestions.filter(s=>!ar||data.creators.some(c=>c.id===s.creatorId)).length?row.suggestions.filter(s=>!ar||data.creators.some(c=>c.id===s.creatorId)).map(s=><button key={s.creatorId} disabled={busy} aria-pressed={creatorId===s.creatorId} onClick={()=>setCreatorId(s.creatorId)} className={`flex w-full flex-col gap-1 rounded-xl border p-3 text-left ${creatorId===s.creatorId?"border-app-blue bg-app-blue/10":"border-white/[0.1] bg-transparent"}`}><span className="text-sm font-medium text-ink">{s.name}</span><span className="text-xs text-ink-muted">{s.reason}</span></button>):<p className="text-sm text-ink-muted">{data.state.lastRunAt?"No close match found. You can choose a creator below.":"Run the first scan, or choose a creator below."}</p>}</div>
            <label className="block text-xs text-ink-muted">Link to creator<select aria-label="Link to creator" disabled={busy||!canWrite} value={creatorId} onChange={e=>setCreatorId(e.target.value)} className={input+" mt-2"}><option value="">Choose a creator…</option>{data.creators.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy||!creatorId||!canWrite} onClick={()=>act("approve")}>Approve &amp; link</Button>{canRefuse&&<Button size="sm" variant="secondary" disabled={busy} onClick={()=>act("refuse")}>Permanently refuse</Button>}</div>
            <p className="text-xs text-ink-faint">Approval links this name and its matching spellings permanently. Refusal keeps it in the list without future suggestions.</p>
          </>}
        </>:<p className="text-sm text-ink-muted">Select a name to review its suggestions.</p>}
        {!canWrite&&<p className="text-xs text-ink-muted">Creator edit permission is required to make decisions or run a scan.</p>}
      </section>
    </div>}
    <p className="text-xs text-ink-faint">Automatic scans run every two days. A completed manual scan starts a fresh 48-hour wait. No names are approved automatically.</p>
  </div>;
}
