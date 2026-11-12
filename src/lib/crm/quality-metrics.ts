import "server-only";

// Indicadores de qualidade do atendimento para o Painel Master.
//
// Tudo aqui vem de crm_quality_events e crm_ai_usage_events — fatos gravados no
// momento em que aconteceram. Nenhum numero e estimado, arredondado "no olho"
// ou preenchido com exemplo. Quando nao ha dado, o indicador vem null e o painel
// mostra "sem dados" em vez de zero enganoso.

export type QualitySummary = {
  periodKey: string;
  totalEvents: number;
  byKind: Record<string, number>;
  /** Respostas da IA no periodo (crm_ai_usage_events com status success). */
  aiReplies: number;
  /** Respostas com pelo menos uma violacao comercial. */
  flaggedReplies: number;
  /** flaggedReplies / aiReplies, em %, ou null se nao houve resposta. */
  flaggedRate: number | null;
  /** Eventos ainda sem revisao humana. */
  pendingReview: number;
  /** Latencia media das respostas, em ms, ou null. */
  avgLatencyMs: number | null;
  /** Custo estimado em USD no periodo, ou null se nenhum evento tinha preco. */
  estimatedCostUsd: number | null;
  /** Consumo de franquia no periodo, por empresa. */
  quotaByTenant: Array<{ tenantId: string; used: number; quota: number }>;
};

function env(): { url: string; key: string } | null {
  const url = process.env.CRM_SUPABASE_URL?.trim().replace(/\/$/, "");
  const key = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return { url, key };
}

async function select<T>(path: string): Promise<T[]> {
  const e = env();
  if (!e) return [];
  try {
    const r = await fetch(`${e.url}/rest/v1/${path}`, {
      headers: { apikey: e.key, Authorization: `Bearer ${e.key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return [];
    return (await r.json()) as T[];
  } catch {
    return [];
  }
}

/** Period key no fuso do cliente: YYYY-MM. */
export function periodKeyFor(date: Date, timezone = "America/Sao_Paulo"): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
  });
  const parts = fmt.formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value ?? "0000";
  const m = parts.find((p) => p.type === "month")?.value ?? "00";
  return `${y}-${m}`;
}

type EventRow = {
  tenant_id: string;
  kind: string;
  severity: string;
  latency_ms: number | null;
  reviewed_at: string | null;
  created_at: string;
};

type UsageRow = {
  tenant_id: string;
  status: string;
  estimated_cost_usd: number | string | null;
};

type AttendanceRow = {
  tenant_id: string;
  used: number | string | null;
};

type TenantRow = {
  id: string;
  plan_quota: number | string | null;
};

/**
 * Monta o resumo do periodo. `tenantId` opcional restringe a uma empresa —
 * o isolamento multiempresa e feito na consulta, nao no cliente.
 */
export async function computeQualitySummary(params?: {
  tenantId?: string;
  periodKey?: string;
  now?: Date;
}): Promise<QualitySummary> {
  const periodKey = params?.periodKey ?? periodKeyFor(params?.now ?? new Date());
  const tenantFilter = params?.tenantId ? `&tenant_id=eq.${params.tenantId}` : "";
  const since = `${periodKey}-01`;

  const [events, usage, attendance, tenants] = await Promise.all([
    select<EventRow>(
      `crm_quality_events?created_at=gte.${since}&select=tenant_id,kind,severity,latency_ms,reviewed_at,created_at&limit=5000${tenantFilter}`
    ),
    select<UsageRow>(
      `crm_ai_usage_events?created_at=gte.${since}&select=tenant_id,status,estimated_cost_usd&limit=5000${tenantFilter}`
    ),
    select<AttendanceRow>(
      `crm_attendance_usage?period_key=eq.${periodKey}&select=tenant_id,used${tenantFilter}`
    ),
    select<TenantRow>(`crm_tenants?select=id,plan_quota${params?.tenantId ? `&id=eq.${params.tenantId}` : ""}`),
  ]);

  const byKind: Record<string, number> = {};
  let pendingReview = 0;
  let latencySum = 0;
  let latencyCount = 0;
  const flaggedConversations = new Set<string>();

  for (const ev of events) {
    byKind[ev.kind] = (byKind[ev.kind] ?? 0) + 1;
    if (!ev.reviewed_at) pendingReview += 1;
    if (typeof ev.latency_ms === "number" && ev.latency_ms > 0) {
      latencySum += ev.latency_ms;
      latencyCount += 1;
    }
    if (ev.kind === "unauthorized_url" || ev.kind === "unauthorized_price" || ev.kind === "mixed_catalogs") {
      flaggedConversations.add(`${ev.tenant_id}:${ev.created_at}`);
    }
  }

  const aiReplies = usage.filter((u) => u.status === "success").length;
  const flaggedReplies = flaggedConversations.size;

  let costSum = 0;
  let costCount = 0;
  for (const u of usage) {
    if (u.estimated_cost_usd === null || u.estimated_cost_usd === undefined) continue;
    const n = Number(u.estimated_cost_usd);
    if (Number.isFinite(n)) {
      costSum += n;
      costCount += 1;
    }
  }

  const quotaMap = new Map(attendance.map((a) => [a.tenant_id, Number(a.used ?? 0)]));
  const quotaByTenant = tenants
    .map((t) => ({
      tenantId: t.id,
      used: quotaMap.get(t.id) ?? 0,
      quota: Number(t.plan_quota ?? 0),
    }))
    .filter((t) => params?.tenantId || t.used > 0);

  return {
    periodKey,
    totalEvents: events.length,
    byKind,
    aiReplies,
    flaggedReplies,
    flaggedRate: aiReplies > 0 ? Number(((flaggedReplies / aiReplies) * 100).toFixed(2)) : null,
    pendingReview,
    avgLatencyMs: latencyCount > 0 ? Math.round(latencySum / latencyCount) : null,
    estimatedCostUsd: costCount > 0 ? Number(costSum.toFixed(6)) : null,
    quotaByTenant,
  };
}
