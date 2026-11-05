import { privateJson, supabaseRows, supabaseSettings, verifyOperator } from "@/lib/crm/supabase-server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Staff={role:string;enabled:boolean};
type Tenant={id:string;name:string;status:string;created_at:string};
type Channel={id:string;tenant_id:string;instance_name:string;status:string};
type Usage={tenant_id:string;status:string;prompt_tokens:number|null;completion_tokens:number|null;estimated_cost_usd:number|null};
type Limit={tenant_id:string;monthly_model_requests:number|null;monthly_token_limit:number|null;monthly_budget_usd:number|null;hard_stop_on_limit:boolean};
function serviceSettings() {
  const {url}=supabaseSettings();
  const secret=process.env.CRM_SUPABASE_SERVICE_ROLE_KEY??"";
  if(secret.length<30)throw Error("admin_service_not_configured");
  return {url,secret};
}
async function readPrivileged<T>(path:string):Promise<T> {
  const {url,secret}=serviceSettings();
  const response=await fetch(url+"/rest/v1/"+path,{
    headers:{apikey:secret,Authorization:"Bearer "+secret,Accept:"application/json"},
    cache:"no-store",signal:AbortSignal.timeout(7000)
  });
  if(!response.ok)throw Error("admin_data_unavailable");
  return await response.json() as T;
}
export async function GET() {
  try {
    const user=await verifyOperator();
    if(!user)return privateJson({error:"unauthorized"},401);
    // Read the staff record through the user's own JWT and platform_staff RLS.
    const staff=await supabaseRows<Staff[]>("platform_staff?select=role,enabled&user_id=eq."+encodeURIComponent(user.id)+"&limit=2",user.token);
    if(staff.length!==1 || !staff[0].enabled || !["MASTER","ADMINISTRADOR","FINANCEIRO","SUPORTE","VISUALIZACAO"].includes(staff[0].role))
      return privateJson({error:"platform_access_denied"},403);
    const role=staff[0].role;
    // Support/visual roles are allowed aggregate operational status, not billing secrets.
    const [tenants,channels]=await Promise.all([
      readPrivileged<Tenant[]>("crm_tenants?select=id,name,status,created_at&order=created_at.desc&limit=100"),
      readPrivileged<Channel[]>("crm_channels?select=id,tenant_id,instance_name,status&limit=200")
    ]);
    const cutoff=new Date();cutoff.setUTCDate(1);cutoff.setUTCHours(0,0,0,0);
    const usage=await readPrivileged<Usage[]>(
      "crm_ai_usage_events?select=tenant_id,status,prompt_tokens,completion_tokens,estimated_cost_usd&occurred_at=gte."+
      encodeURIComponent(cutoff.toISOString())+"&limit=1000");
    const limits=await readPrivileged<Limit[]>(
      "crm_usage_limits?select=tenant_id,monthly_model_requests,monthly_token_limit,monthly_budget_usd,hard_stop_on_limit&limit=100");
    const totals=new Map<string,{requests:number;tokens:number;costUsd:number;errors:number}>();
    for(const event of usage){
      const existing=totals.get(event.tenant_id)??{requests:0,tokens:0,costUsd:0,errors:0};
      existing.requests++;
      existing.tokens+=(event.prompt_tokens??0)+(event.completion_tokens??0);
      existing.costUsd+=Number(event.estimated_cost_usd??0);
      existing.errors+=["error","timeout","rate_limited"].includes(event.status)?1:0;
      totals.set(event.tenant_id,existing);
    }
    return privateJson({
      role,month:cutoff.toISOString().slice(0,7),limited:tenants.length>=100||usage.length>=1000||channels.length>=200,
      companies:tenants.map(t=>({
        ...t,channels:channels.filter(c=>c.tenant_id===t.id).map(c=>({instance:c.instance_name,status:c.status})),
        usage:totals.get(t.id)??{requests:0,tokens:0,costUsd:0,errors:0},
        limits:limits.find(l=>l.tenant_id===t.id)??null
      })),
      totals:{companies:tenants.length,connectedChannels:channels.filter(c=>c.status==="connected").length,
        modelEvents:usage.length},
      note:"Registros reais do Supabase. Consumo só é contabilizado quando o backend registrar eventos. Limites ainda não são executados."
    });
  } catch {
    return privateJson({error:"admin_backend_unavailable"},503);
  }
}
