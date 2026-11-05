import { NextRequest } from "next/server";
import { privateJson, supabaseSettings, verifyOperator } from "@/lib/crm/supabase-server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function POST(request:NextRequest) {
  const origin=request.headers.get("origin");
  if(origin && origin !== new URL(request.url).origin) return privateJson({error:"forbidden"},403);
  if(!request.headers.get("content-type")?.includes("application/json"))return privateJson({error:"json_required"},415);
  if(Number(request.headers.get("content-length")??0)>1500)return privateJson({error:"request_too_large"},413);
  let body:unknown;
  try { body=await request.json(); } catch { return privateJson({error:"invalid_json"},400); }
  const input=body && typeof body==="object"?body as Record<string,unknown>:{};
  const tenant=typeof input.tenantId==="string"?input.tenantId:"";
  const phone=typeof input.phone==="string"?input.phone.replace(/\D/g,""):"";
  const name=typeof input.name==="string"?input.name.trim():"";
  if(!UUID.test(tenant)||!/^[0-9]{10,15}$/.test(phone)||name.length>160)
    return privateJson({error:"invalid_contact"},400);
  try {
    const user=await verifyOperator();
    if(!user)return privateJson({error:"unauthorized"},401);
    const {url,key}=supabaseSettings();
    // RLS enforces both membership role and active tenant; no elevated key is involved.
    const created=await fetch(url+"/rest/v1/crm_contacts",{
      method:"POST",cache:"no-store",signal:AbortSignal.timeout(7000),
      headers:{apikey:key,Authorization:"Bearer "+user.token,
        "Content-Type":"application/json",Prefer:"return=representation"},
      body:JSON.stringify({tenant_id:tenant,phone,display_name:name||null})
    });
    if(created.status===409)return privateJson({error:"contact_exists"},409);
    if(!created.ok)return privateJson({error:"contact_denied_or_unavailable"},403);
    const rows=await created.json() as {id:string}[];
    return privateJson({id:rows[0]?.id??null,created:true},201);
  } catch { return privateJson({error:"contact_service_unavailable"},503); }
}
