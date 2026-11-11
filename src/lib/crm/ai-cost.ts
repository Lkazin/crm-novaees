// Custo real de inferencia de IA por loja, lido de crm_ai_usage_events.
//
// Alimenta a margem liquida do Painel Master: receita - despesas - custo de IA.
// O valor e gravado em USD por chamada (ver src/lib/crm/ai-usage.ts) e convertido
// aqui para BRL usando a cotacao configurada. Sem cotacao, devolve null em vez de
// um numero inventado.

import "server-only";

export type AiCostRow = { tenantId: string; costBrl: number; responses: number };

const DEFAULT_USD_BRL = Number(process.env.USD_BRL_RATE || 0);

export function usdBrlRate(): number | null {
  return Number.isFinite(DEFAULT_USD_BRL) && DEFAULT_USD_BRL > 0 ? DEFAULT_USD_BRL : null;
}

export async function fetchAiCostsByTenant(fromIso: string, toIso: string): Promise<AiCostRow[] | undefined> {
  const url = process.env.CRM_SUPABASE_URL?.trim().replace(/\/$/, "");
  const key = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY?.trim();
  const rate = usdBrlRate();
  if (!url || !key) return undefined;
  // Sem cotacao nao ha como converter: devolve undefined para a margem ficar nula.
  if (!rate) return undefined;

  try {
    const query = `/rest/v1/crm_ai_usage_events?select=tenant_id,estimated_cost_usd,status,occurred_at`
      + `&occurred_at=gte.${encodeURIComponent(fromIso)}&occurred_at=lte.${encodeURIComponent(toIso)}`;
    const res = await fetch(url + query, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(6000)
    });
    if (!res.ok) return undefined;
    const rows = (await res.json()) as Array<{ tenant_id: string; estimated_cost_usd: string | number | null; status: string }>;

    const acc = new Map<string, { usd: number; responses: number }>();
    for (const row of rows) {
      if (!row.tenant_id) continue;
      const usd = Number(row.estimated_cost_usd) || 0;
      const current = acc.get(row.tenant_id) ?? { usd: 0, responses: 0 };
      current.usd += usd;
      if (row.status === "success") current.responses += 1;
      acc.set(row.tenant_id, current);
    }

    return Array.from(acc.entries()).map(([tenantId, v]) => ({
      tenantId,
      costBrl: Number((v.usd * rate).toFixed(2)),
      responses: v.responses
    }));
  } catch {
    return undefined;
  }
}
