import { NextRequest } from "next/server";
import { privateJson } from "@/lib/crm/supabase-server";
import { authorizeAiLab, freeModelIds } from "@/lib/crm/ai-lab";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request: NextRequest){
 try{
  const authorized=await authorizeAiLab(request);
  if(!authorized)return privateJson({error:"unauthorized"},401);
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
