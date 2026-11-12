import "server-only";

// Registro de eventos de qualidade do atendimento.
//
// Por que existe: o Painel Master precisa mostrar quantas respostas sairam com
// link inventado, preco fora da base, catalogo misturado, repeticao, falha de
// envio e transferencia para humano. Sem gravar o evento no momento em que ele
// acontece, o painel so teria estimativa — e estimativa nao serve para decidir
// preco nem para provar correcao.
//
// Regra: metrica nunca derruba atendimento. Todo erro aqui e silencioso.

export type QualityKind =
  | "unauthorized_url"
  | "unauthorized_price"
  | "mixed_catalogs"
  | "duplicate_reply"
  | "send_failure"
  | "human_handoff"
  | "slow_reply";

export type QualityEvent = {
  tenantId?: string | null;
  conversationId?: string | null;
  messageId?: string | null;
  kind: QualityKind;
  severity?: "info" | "warn" | "error";
  detail?: Record<string, unknown>;
  latencyMs?: number | null;
};

const DEFAULT_SEVERITY: Record<QualityKind, "info" | "warn" | "error"> = {
  unauthorized_url: "error",
  unauthorized_price: "error",
  mixed_catalogs: "error",
  duplicate_reply: "warn",
  send_failure: "error",
  human_handoff: "info",
  slow_reply: "warn",
};

export async function recordQualityEvent(event: QualityEvent): Promise<void> {
  const url = process.env.CRM_SUPABASE_URL?.trim().replace(/\/$/, "");
  const key = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key || !event.tenantId) return;

  const body = {
    tenant_id: event.tenantId,
    conversation_id: event.conversationId ?? null,
    message_id: event.messageId ?? null,
    kind: event.kind,
    severity: event.severity ?? DEFAULT_SEVERITY[event.kind],
    detail: event.detail ?? {},
    latency_ms: event.latencyMs ?? null,
  };

  try {
    await fetch(`${url}/rest/v1/crm_quality_events`, {
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
