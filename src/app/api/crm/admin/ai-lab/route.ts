import { privateJson, verifyOperator } from "@/lib/crm/supabase-server";
import { authorizeAiLab, freeModelIds } from "@/lib/crm/ai-lab";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(){
 try{
  const user=await verifyOperator();
  if(!user)return privateJson({error:"unauthorized"},401);
  const authorized=await authorizeAiLab();
  if(!authorized)return privateJson({error:"forbidden"},403);
  const approvedModels=freeModelIds();
  return privateJson({
    approvedModels,
    enabled:process.env.CRM_AI_LAB_TEST_ENABLED==="true",
    gatewayConfigured:!!process.env.AI_OPENAI_BASE_URL&&!!process.env.AI_API_KEY,
    evolutionInstance:process.env.EVOLUTION_INSTANCE??null,
    whatsappSending:false,
    note:"Lista aprovada localmente, sem teste de conectividade. Nunca exibe chaves."
  });
 }catch{return privateJson({error:"lab_status_unavailable"},503);}
}
