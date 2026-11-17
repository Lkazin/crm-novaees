import "server-only";
import { NextRequest } from "next/server";
import { supabaseRows, verifyOperator } from "@/lib/crm/supabase-server";
import { verifyMasterRequest } from "@/lib/crm/master-auth";

export type AuthorizedAdmin={id:string;role:"MASTER"|"ADMINISTRADOR"|"FINANCEIRO"};
export async function authorizeAiLab(request?: NextRequest):Promise<AuthorizedAdmin|null>{
  if (request) {
    const master = await verifyMasterRequest(request);
    if (master.authorized) {
      return { id: master.actor || "master", role: "MASTER" };
    }
  }
  const user=await verifyOperator();
  if(!user)return null;
  const members=await supabaseRows<{enabled:boolean;role:string}[]>(
    "platform_staff?select=role,enabled&user_id=eq."+encodeURIComponent(user.id)+"&limit=2",user.token);
  if(members.length!==1||!members[0].enabled||
    !["MASTER","ADMINISTRADOR"].includes(members[0].role))return null;
  return {id:user.id,role:members[0].role as AuthorizedAdmin["role"]};
}
export function freeModelIds():string[]{
  // Operator must deliberately approve IDs that are free in their own provider account.
  // A model's name is NOT evidence of free usage or commercial permission.
  return [...new Set((process.env.CRM_AI_LAB_FREE_MODEL_IDS??"").split(",")
    .map(s=>s.trim()).filter(s=>/^[\w./:-]{1,140}$/.test(s)))].slice(0,20);
}
