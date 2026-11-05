import { NextRequest } from "next/server";
import { privateJson, supabaseRows, supabaseSettings, verifyOperator } from "@/lib/crm/supabase-server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function POST(request:NextRequest) {
 if(request.headers.get("origin")!==new URL(request.url).origin)return privateJson({error:"origin_forbidden"},403);
 if(!request.headers.get("content-type")?.includes("application/json"))return privateJson({error:"json_required"},415);
 if(Number(request.headers.get("content-length")??0)>1024)return privateJson({error:"payload_too_large"},413);
 let body:unknown;
 try{body=await request.json();}catch{return privateJson({error:"invalid_json"},400);}
 const data=body&&typeof body==="object"?body as Record<string,unknown>:{};
 const tenant=typeof data.tenantId==="string"?data.tenantId:"";
 const conversation=typeof data.conversationId==="string"?data.conversationId:"";
 if(!UUID.test(tenant)||!UUID.test(conversation))return privateJson({error:"invalid_request"},400);
 try {
  const operator=await verifyOperator();
  if(!operator)return privateJson({error:"unauthorized"},401);
  const member=await supabaseRows<{role:string}[]>(
   "crm_tenant_memberships?select=role&tenant_id=eq."+tenant+"&user_id=eq."+operator.id+"&limit=1",operator.token);
  if(member.length!==1||!["owner","admin","agent"].includes(member[0].role))
   return privateJson({error:"not_authorized"},403);
  const {url}=supabaseSettings();
  const secret=process.env.CRM_SUPABASE_SERVICE_ROLE_KEY??"";
  if(secret.length<30)return privateJson({error:"service_not_configured"},503);
  const r=await fetch(url+"/rest/v1/rpc/crm_operator_claim_conversation",{
   method:"POST",cache:"no-store",signal:AbortSignal.timeout(9000),
   headers:{apikey:secret,Authorization:"Bearer "+secret,"Content-Type":"application/json"},
   body:JSON.stringify({p_tenant:tenant,p_conversation:conversation,p_actor:operator.id})
  });
  if(!r.ok)return privateJson({error:"handoff_denied_or_unavailable"},409);
  return privateJson({claimed:true,conversationId:conversation,mode:"human"});
 }catch{return privateJson({error:"handoff_unavailable"},503);}
}
