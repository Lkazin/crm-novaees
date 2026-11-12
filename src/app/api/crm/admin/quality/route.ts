import { NextRequest } from "next/server";
import { privateJson } from "@/lib/crm/supabase-server";
import { verifyMasterRequest } from "@/lib/crm/master-auth";
import { computeQualitySummary, periodKeyFor } from "@/lib/crm/quality-metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Indicadores de qualidade do atendimento no Painel Master.
//
// So Master. Os numeros vem de crm_quality_events e crm_ai_usage_events; nada
// aqui e estimado. `tenantId` restringe a uma empresa, e a consulta ja aplica o
// filtro no banco — o isolamento multiempresa nao depende do cliente.
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyMasterRequest(request);
    if (!auth.authorized) return privateJson({ error: "unauthorized" }, 401);

    const tenantId = request.nextUrl.searchParams.get("tenantId")?.trim() || undefined;
    const periodKey = request.nextUrl.searchParams.get("period")?.trim() || periodKeyFor(new Date());

    if (periodKey && !/^\d{4}-\d{2}$/.test(periodKey)) {
      return privateJson({ error: "invalid_period" }, 400);
    }

    const summary = await computeQualitySummary({ tenantId, periodKey });
    return privateJson(summary);
  } catch (err) {
    return privateJson(
      { error: "internal_error", message: err instanceof Error ? err.message : String(err) },
      500
    );
  }
}
