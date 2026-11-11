import { NextRequest } from "next/server";
import { privateJson } from "@/lib/crm/supabase-server";
import { verifyMasterRequest } from "@/lib/crm/master-auth";
import { fetchAiCostsByTenant, usdBrlRate } from "@/lib/crm/ai-cost";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Custo real de inferencia de IA por loja, para a margem liquida do Painel Master.
// Sem cotacao USD/BRL configurada, devolve costs: null (a margem fica nula em vez
// de um numero inventado).
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyMasterRequest(request);
    if (!auth.authorized) return privateJson({ error: "unauthorized" }, 401);

    const rate = usdBrlRate();
    if (!rate) {
      return privateJson({
        costs: null,
        rate: null,
        message: "Defina USD_BRL_RATE no ambiente para converter o custo de IA em reais."
      });
    }

    const { searchParams } = new URL(request.url);
    const now = new Date();
    const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
    const from = searchParams.get("from") || defaultFrom.toISOString();
    const to = searchParams.get("to") || now.toISOString();

    const costs = await fetchAiCostsByTenant(from, to);
    return privateJson({
      costs: costs ?? null,
      rate,
      from,
      to,
      message: costs ? undefined : "Nao foi possivel ler crm_ai_usage_events."
    });
  } catch (err) {
    return privateJson({ error: "internal_error", message: err instanceof Error ? err.message : String(err) }, 500);
  }
}
