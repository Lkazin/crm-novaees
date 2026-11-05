import "server-only";
import type { Incoming } from "@/lib/agent/parse";

type Channel={id:string;tenant_id:string;status:string};
type Tenant={id:string;status:string};
type Contact={id:string};
type Thread={id:string;mode:string;status:string};
type Flags={ai_sending_enabled:boolean};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function read<T>(path:string):Promise<T[]>{
 const url=process.env.CRM_SUPABASE_URL??"";
 const key=process.env.CRM_SUPABASE_SERVICE_ROLE_KEY??"";
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)||key.length<30)
   throw new Error("outbound_guard_not_configured");
 const result=await fetch(url.replace(/\/$/,"")+"/rest/v1/"+path,{
  cache:"no-store",signal:AbortSignal.timeout(5000),
  headers:{apikey:key,Authorization:"Bearer "+key}
 });
 if(!result.ok)throw new Error("outbound_guard_db_unavailable");
 const data=await result.json() as unknown;
 if(!Array.isArray(data))throw new Error("outbound_guard_invalid_result");
 return data as T[];
}
function exactlyOne<T>(rows:T[]):T|null{return rows.length===1?rows[0]:null;}

/** Default deny: no lab message can be sent unless backed by an active,
 * explicitly AI-mode conversation and an enabled tenant flag.
 * Run this check immediately before outbound sending, not just on webhook receipt.
 */
export async function outboundAllowed(incoming:Incoming):Promise<boolean>{
 if(process.env.CRM_SUPABASE_INGEST_ENABLED!=="true")return false;
 if(incoming.instance!==process.env.EVOLUTION_INSTANCE)return false;
 const channel=exactlyOne(await read<Channel>(
   "crm_channels?select=id,tenant_id,status&instance_name=eq."+encodeURIComponent(incoming.instance)+"&limit=2"));
 if(!channel||channel.status!=="connected"||!UUID.test(channel.tenant_id))return false;
 const tenant=exactlyOne(await read<Tenant>(
   "crm_tenants?select=id,status&id=eq."+channel.tenant_id+"&limit=2"));
 if(!tenant||tenant.status!=="active")return false;
 const flags=exactlyOne(await read<Flags>(
   "crm_tenant_settings?select=ai_sending_enabled&tenant_id=eq."+channel.tenant_id+"&limit=2"));
 if(!flags?.ai_sending_enabled)return false;
 const contact=exactlyOne(await read<Contact>(
   "crm_contacts?select=id&tenant_id=eq."+channel.tenant_id+"&phone=eq."+incoming.number+"&limit=2"));
 if(!contact)return false;
 const thread=exactlyOne(await read<Thread>(
   "crm_conversations?select=id,mode,status&tenant_id=eq."+channel.tenant_id+
   "&contact_id=eq."+contact.id+"&channel_id=eq."+channel.id+"&limit=2"));
 return !!thread&&thread.mode==="ai"&&thread.status==="open";
}
