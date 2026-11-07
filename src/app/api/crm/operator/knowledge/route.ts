import { NextRequest } from "next/server";
import { isAllowedOrigin, privateJson, supabaseRows, supabaseSettings, verifyOperator } from "@/lib/crm/supabase-server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Article={id:string;title:string;body:string;status:string;updated_at:string};
type Operator={id:string;token:string};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function valid(value:unknown,min:number,max:number):value is string {
  return typeof value==="string"&&value.trim().length>=min&&value.length<=max;
}
function checkOrigin(request:NextRequest) {
  return isAllowedOrigin(request.headers.get("origin"), request.url);
}
async function write(path:string,method:"POST"|"PATCH",operator:Operator,values:object) {
  const {url,key}=supabaseSettings();
  return fetch(url+"/rest/v1/"+path,{
    method,cache:"no-store",signal:AbortSignal.timeout(8000),
    headers:{apikey:key,Authorization:"Bearer "+operator.token,"Content-Type":"application/json",Prefer:"return=representation"},
    body:JSON.stringify(values)
  });
}
export async function GET(request:NextRequest) {
  const tenant=request.nextUrl.searchParams.get("tenant")??"";
  if(!UUID.test(tenant))return privateJson({error:"invalid_tenant"},400);
  try {
    const operator=await verifyOperator();
    if(!operator)return privateJson({error:"unauthorized"},401);
    const members=await supabaseRows<{tenant_id:string}[]>(
      "crm_tenant_memberships?select=tenant_id&tenant_id=eq."+tenant+"&user_id=eq."+operator.id+"&limit=1",
      operator.token);
    if(!members.length)return privateJson({error:"tenant_forbidden"},403);
    const rows=await supabaseRows<Article[]>(
      "crm_knowledge_articles?select=id,title,body,status,updated_at&tenant_id=eq."+tenant+"&order=updated_at.desc&limit=100",
      operator.token);
    return privateJson({articles:rows,limited:rows.length===100});
  }catch{return privateJson({error:"knowledge_unavailable"},503);}
}
export async function POST(request:NextRequest) {
  if(!checkOrigin(request))return privateJson({error:"origin_forbidden"},403);
  if(!request.headers.get("content-type")?.includes("application/json"))return privateJson({error:"json_required"},415);
  if(Number(request.headers.get("content-length")??0)>22000)return privateJson({error:"payload_too_large"},413);
  let data:unknown;
  try{data=await request.json();}catch{return privateJson({error:"invalid_json"},400);}
  const payload=data&&typeof data==="object"?data as Record<string,unknown>:{};
  if(!UUID.test(String(payload.tenantId??""))||!valid(payload.title,3,200)||!valid(payload.body,1,20000))
    return privateJson({error:"invalid_article"},400);
  const articleStatus=["draft","published","archived"].includes(String(payload.status??""))
    ? String(payload.status)
    : "published";
  try {
    const operator=await verifyOperator();
    if(!operator)return privateJson({error:"unauthorized"},401);
    const members=await supabaseRows<{tenant_id:string}[]>(
      "crm_tenant_memberships?select=tenant_id&tenant_id=eq."+payload.tenantId+"&user_id=eq."+operator.id+"&limit=1",
      operator.token);
    if(!members.length)return privateJson({error:"tenant_forbidden"},403);
    const response=await write("crm_knowledge_articles","POST",operator,{
      tenant_id:payload.tenantId,title:(payload.title as string).trim(),
      body:(payload.body as string).trim(),status:articleStatus,created_by:operator.id
    });
    if(!response.ok)return privateJson({error:"knowledge_denied"},403);
    const added=await response.json() as {id:string}[];
    if(added.length!==1)return privateJson({error:"knowledge_unconfirmed"},503);
    return privateJson({created:true,id:added[0].id,status:articleStatus},201);
  }catch{return privateJson({error:"knowledge_service_unavailable"},503);}
}
export async function PATCH(request:NextRequest) {
  if(!checkOrigin(request))return privateJson({error:"origin_forbidden"},403);
  if(!request.headers.get("content-type")?.includes("application/json"))return privateJson({error:"json_required"},415);
  if(Number(request.headers.get("content-length")??0)>22000)return privateJson({error:"payload_too_large"},413);
  let data:unknown;
  try{data=await request.json();}catch{return privateJson({error:"invalid_json"},400);}
  const payload=data&&typeof data==="object"?data as Record<string,unknown>:{};
  if(!UUID.test(String(payload.tenantId??""))||!UUID.test(String(payload.id??""))||
     !valid(payload.title,3,200)||!valid(payload.body,1,20000)||
     !["draft","published","archived"].includes(String(payload.status??"")))
    return privateJson({error:"invalid_article"},400);
  try {
    const operator=await verifyOperator();
    if(!operator)return privateJson({error:"unauthorized"},401);
    const tenant=String(payload.tenantId),id=String(payload.id);
    const members=await supabaseRows<{tenant_id:string}[]>(
      "crm_tenant_memberships?select=tenant_id&tenant_id=eq."+tenant+"&user_id=eq."+operator.id+"&limit=1",
      operator.token);
    if(!members.length)return privateJson({error:"tenant_forbidden"},403);
    const existing=await supabaseRows<{id:string}[]>(
      "crm_knowledge_articles?select=id&id=eq."+id+"&tenant_id=eq."+tenant+"&limit=1",operator.token);
    if(!existing.length)return privateJson({error:"not_found"},404);
    const response=await write("crm_knowledge_articles?id=eq."+id+"&tenant_id=eq."+tenant,
      "PATCH",operator,{title:(payload.title as string).trim(),body:(payload.body as string).trim(),
        status:payload.status,updated_at:new Date().toISOString()});
    if(!response.ok)return privateJson({error:"knowledge_denied"},403);
    const updated=await response.json() as {id:string}[];
    if(updated.length!==1)return privateJson({error:"knowledge_denied"},403);
    return privateJson({updated:true});
  }catch{return privateJson({error:"knowledge_service_unavailable"},503);}
}
