import "server-only";
import type { Incoming } from "@/lib/agent/parse";

// Explicit opt-in. Uses a server-only privileged key and a verified exact channel binding.
// Never expose this key in NEXT_PUBLIC_ variables or React components.
type Channel={id:string;tenant_id:string;status:string};
type Tenant={id:string;status:string};
type RecordId={id:string};
type RequestMethod="GET"|"POST"|"PATCH";

function settings() {
  const url=process.env.CRM_SUPABASE_URL?.trim()??"";
  const key=process.env.CRM_SUPABASE_SERVICE_ROLE_KEY?.trim()??"";
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url) || key.length<30)
    throw new Error("crm_supabase_ingest_not_configured");
  return {url:url.replace(/\/$/,""),key};
}
async function db<T>(table:string, query:string, method:RequestMethod, payload?:unknown):Promise<T> {
  const {url,key}=settings();
  const response=await fetch(url+"/rest/v1/"+table+query,{
    method,cache:"no-store",signal:AbortSignal.timeout(8000),
    headers:{
      apikey:key,Authorization:"Bearer "+key,
      Accept:"application/json",
      "Content-Type":"application/json",
      ...(method==="POST"?{Prefer:"resolution=ignore-duplicates,return=representation"}:
        method==="PATCH"?{Prefer:"return=minimal"}:{})
    },
    ...(payload!==undefined?{body:JSON.stringify(payload)}:{})
  });
  if(!response.ok) throw new Error("crm_supabase_ingest_failed");
  if(method==="PATCH")return undefined as T;
  return await response.json() as T;
}
function one<T>(rows:T[],label:string):T {
  if(rows.length!==1)throw new Error("crm_supabase_"+label+"_not_unique");
  return rows[0];
}
export async function persistIncomingInSupabase(incoming:Incoming):Promise<"off"|"created"|"duplicate"> {
  if(process.env.CRM_SUPABASE_INGEST_ENABLED!=="true")return "off";
  if(incoming.instance!==process.env.EVOLUTION_INSTANCE)throw new Error("crm_supabase_wrong_instance");
  // Resolve tenant from the binding in the database, NEVER from the untrusted webhook payload.
  const channels=await db<Channel[]>("crm_channels",
    "?select=id,tenant_id,status&instance_name=eq."+encodeURIComponent(incoming.instance)+"&limit=2","GET");
  const channel=one(channels,"channel");
  if(channel.status!=="connected")throw new Error("crm_supabase_channel_inactive");
  const tenant=one(await db<Tenant[]>("crm_tenants",
    "?select=id,status&id=eq."+channel.tenant_id+"&limit=2","GET"),"tenant");
  if(tenant.status!=="active")throw new Error("crm_supabase_tenant_inactive");
  const t=channel.tenant_id;
  const contactQuery="?select=id&tenant_id=eq."+t+"&phone=eq."+incoming.number+"&limit=2";
  let contacts=await db<RecordId[]>("crm_contacts",contactQuery,"GET");
  if(!contacts.length) {
    await db<RecordId[]>("crm_contacts","?on_conflict=tenant_id,phone","POST",
      {tenant_id:t,phone:incoming.number});
    contacts=await db<RecordId[]>("crm_contacts",contactQuery,"GET");
  }
  const contact=one(contacts,"contact");
  const conversationQuery="?select=id&tenant_id=eq."+t+
    "&contact_id=eq."+contact.id+"&channel_id=eq."+channel.id+"&limit=2";
  let threads=await db<RecordId[]>("crm_conversations",conversationQuery,"GET");
  if(!threads.length) {
    await db<RecordId[]>("crm_conversations","?on_conflict=tenant_id,contact_id,channel_id","POST",
      {tenant_id:t,contact_id:contact.id,channel_id:channel.id,mode:"human",status:"open"});
    threads=await db<RecordId[]>("crm_conversations",conversationQuery,"GET");
  }
  const conversation=one(threads,"conversation");
  // Explicit idempotency check. A concurrent retry may still hit the unique index below.
  const existing=await db<RecordId[]>("crm_messages",
    "?select=id&tenant_id=eq."+t+"&conversation_id=eq."+conversation.id+
    "&external_id=eq."+encodeURIComponent(incoming.id)+"&direction=eq.inbound&limit=1","GET");
  if(existing.length)return "duplicate";
  try {
    await db<RecordId[]>("crm_messages","","POST",{
      tenant_id:t,conversation_id:conversation.id,external_id:incoming.id,
      direction:"inbound",sender_type:"customer",body:incoming.text,delivery_status:"received"
    });
  } catch {
    // Only treat as duplicate if the unique inbox record can now actually be found.
    const latest=await db<RecordId[]>("crm_messages",
      "?select=id&tenant_id=eq."+t+"&conversation_id=eq."+conversation.id+
      "&external_id=eq."+encodeURIComponent(incoming.id)+"&direction=eq.inbound&limit=1","GET");
    if(latest.length)return "duplicate";
    throw new Error("crm_supabase_ingest_failed");
  }
  const now=new Date().toISOString();
  await db<void>("crm_conversations","?id=eq."+conversation.id+"&tenant_id=eq."+t,"PATCH",
    {last_message_at:now,updated_at:now});
  return "created";
}
