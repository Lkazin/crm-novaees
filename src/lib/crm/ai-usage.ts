import "server-only";

// Registro de custo por resposta da IA.
//
// Por que existe: o preco de venda (R$ 0,075 por mensagem no plano, R$ 0,20 na
// recarga) so faz sentido se soubermos quanto custa cada chamada. Sem isso a
// margem e um palpite. A tabela crm_ai_usage_events existia desde o inicio e
// nunca recebeu uma linha: o codigo so a usava para apagar em remocao de tenant.
//
// Nada aqui pode quebrar o atendimento: todo erro e silencioso por desenho.

export type AiUsageSample = {
  tenantId?: string | null;
  conversationId?: string | null;
  provider: string;
  model: string;
  status: "success" | "empty" | "error";
  promptTokens?: number | null;
  completionTokens?: number | null;
  estimatedCostUsd?: number | null;
  requestKey?: string | null;
};

// Precos publicos por 1M tokens (entrada/saida), em USD. Usados apenas para
// estimar; o valor real depende do provedor configurado no OmniRoute.
// Modelos desconhecidos ficam sem custo (null) em vez de um numero inventado.
const PRICE_TABLE: Array<{ match: RegExp; input: number; output: number }> = [
  { match: /gpt-oss-120b/i, input: 0.15, output: 0.75 },
  { match: /gpt-oss-20b/i, input: 0.05, output: 0.25 },
  { match: /gpt-4o-mini/i, input: 0.15, output: 0.6 },
  { match: /gpt-4o/i, input: 2.5, output: 10 },
  { match: /llama-3\.3-70b/i, input: 0.59, output: 0.79 },
  { match: /llama-3\.1-8b/i, input: 0.05, output: 0.08 },
  { match: /prompt-guard/i, input: 0, output: 0 },
];

export function estimateCostUsd(
  model: string,
  promptTokens?: number | null,
  completionTokens?: number | null
): number | null {
  if (typeof promptTokens !== "number" && typeof completionTokens !== "number") return null;
  const row = PRICE_TABLE.find(r => r.match.test(model));
  if (!row) return null;
  const p = (promptTokens ?? 0) / 1_000_000;
  const c = (completionTokens ?? 0) / 1_000_000;
  const total = p * row.input + c * row.output;
  return Number(total.toFixed(6));
}

export async function recordAiUsage(sample: AiUsageSample): Promise<void> {
  const url = process.env.CRM_SUPABASE_URL?.trim().replace(/\/$/, "");
  const key = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key || !sample.tenantId) return;

  const body = {
    tenant_id: sample.tenantId,
    conversation_id: sample.conversationId ?? null,
    provider: sample.provider,
    model: sample.model,
    status: sample.status,
    prompt_tokens: sample.promptTokens ?? null,
    completion_tokens: sample.completionTokens ?? null,
    estimated_cost_usd:
      sample.estimatedCostUsd ?? estimateCostUsd(sample.model, sample.promptTokens, sample.completionTokens),
    request_key: sample.requestKey ?? null,
  };

  try {
    await fetch(`${url}/rest/v1/crm_ai_usage_events`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    // Metrica nunca derruba atendimento.
  }
}
