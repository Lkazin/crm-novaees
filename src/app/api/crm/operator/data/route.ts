import { NextRequest } from "next/server";
import { privateJson, supabaseRows, verifyOperator } from "@/lib/crm/supabase-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Membership = {tenant_id:string; role:string};
type Tenant = {id:string;name:string;status:string};
type Contact = {id:string;phone:string;display_name:string|null;created_at:string};
type Conversation = {id:string;contact_id:string;status:string;mode:string;last_message_at:string|null;assigned_to:string|null};
type Message = {id:string;conversation_id:string;direction:string;sender_type:string;body:string;created_at:string};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function GET(request:NextRequest) {
  try {
    const user=await verifyOperator();
    if (!user) return privateJson({error:"unauthorized"},401);
    const memberships=await supabaseRows<Membership[]>(
      "crm_tenant_memberships?select=tenant_id,role&user_id=eq."+encodeURIComponent(user.id),user.token);
    if (!memberships.length) return privateJson({tenants:[],selectedTenant:null,contacts:[],conversations:[],messages:[],note:"no_membership"});
    const allowed=memberships.map(m=>m.tenant_id).filter(x=>UUID.test(x));
    const tenants=await supabaseRows<Tenant[]>(
      "crm_tenants?select=id,name,status&id=in.("+allowed.join(",")+")&order=name.asc",user.token);
    const selected=request.nextUrl.searchParams.get("tenant");
    if (!selected) return privateJson({tenants,selectedTenant:null,contacts:[],conversations:[],messages:[]});
    if (!UUID.test(selected) || !allowed.includes(selected)) return privateJson({error:"tenant_forbidden"},403);
    const query="tenant_id=eq."+encodeURIComponent(selected);
    const [contacts,conversations,messages]=await Promise.all([
      supabaseRows<Contact[]>("crm_contacts?select=id,phone,display_name,created_at&"+query+"&order=created_at.desc&limit=100",user.token),
      supabaseRows<Conversation[]>("crm_conversations?select=id,contact_id,status,mode,last_message_at,assigned_to&"+query+"&order=last_message_at.desc.nullslast&limit=100",user.token),
      supabaseRows<Message[]>("crm_messages?select=id,conversation_id,direction,sender_type,body,created_at&"+query+"&order=created_at.desc&limit=300",user.token)
    ]);
    return privateJson({tenants,selectedTenant:selected,contacts,conversations,messages});
  } catch { return privateJson({error:"crm_data_unavailable"},503); }
}
