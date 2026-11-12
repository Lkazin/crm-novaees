import "server-only";

// Cancelamento e exclusao de conta pedidos pelo cliente.
//
// Regra: o pedido nao apaga nada na hora. O painel continua ativo ate o fim do
// ciclo ja pago (active_until) e a exclusao definitiva so roda depois disso
// (purge_after). Antes do purge o cliente pode voltar atras.

export type DeletionStatus = "scheduled" | "cancelled" | "purged";

export type DeletionRequest = {
  id: string;
  tenantId: string;
  status: DeletionStatus;
  activeUntil: string;
  purgeAfter: string;
  createdAt: string;
};

function env(): { url: string; key: string } | null {
  const url = process.env.CRM_SUPABASE_URL?.trim().replace(/\/$/, "");
  const key = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return { url, key };
}

async function rest<T>(path: string, init?: RequestInit): Promise<T | null> {
  const e = env();
  if (!e) return null;
  try {
    const r = await fetch(`${e.url}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: e.key,
        Authorization: `Bearer ${e.key}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return null;
    const text = await r.text();
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/**
 * Fim do ciclo ja pago, no fuso do cliente.
 * Usa o mesmo period_key da franquia (YYYY-MM) para o corte cair no dia 1º.
 */
export function endOfBillingCycle(now: Date, timezone = "America/Sao_Paulo"): Date {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
  });
  const parts = fmt.formatToParts(now);
  const y = Number(parts.find((p) => p.type === "year")?.value ?? "1970");
  const m = Number(parts.find((p) => p.type === "month")?.value ?? "01");
  // Primeiro instante do mês seguinte, no fuso do cliente.
  const nextMonth = m === 12 ? 1 : m + 1;
  const nextYear = m === 12 ? y + 1 : y;
  const iso = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00-03:00`;
  return new Date(iso);
}

/** Quantos dias faltam ate a exclusao definitiva. */
export function daysUntilPurge(purgeAfter: string, now = new Date()): number {
  const diff = new Date(purgeAfter).getTime() - now.getTime();
  if (!Number.isFinite(diff)) return 0;
  return Math.max(0, Math.ceil(diff / 86_400_000));
}

/** Pedido ativo da empresa, se houver. */
export async function getActiveDeletionRequest(tenantId: string): Promise<DeletionRequest | null> {
  const rows = await rest<
    Array<{
      id: string;
      tenant_id: string;
      status: DeletionStatus;
      active_until: string;
      purge_after: string;
      created_at: string;
    }>
  >(
    `crm_deletion_requests?tenant_id=eq.${encodeURIComponent(tenantId)}&status=eq.scheduled&select=id,tenant_id,status,active_until,purge_after,created_at&limit=1`
  );
  if (!rows || rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id,
    tenantId: r.tenant_id,
    status: r.status,
    activeUntil: r.active_until,
    purgeAfter: r.purge_after,
    createdAt: r.created_at,
  };
}

/**
 * Agenda o cancelamento. Idempotente: se ja existe pedido ativo, devolve o
 * existente em vez de criar outro.
 */
export async function scheduleDeletion(params: {
  tenantId: string;
  requestedBy?: string;
  reason?: string;
  now?: Date;
  timezone?: string;
}): Promise<DeletionRequest | null> {
  const existing = await getActiveDeletionRequest(params.tenantId);
  if (existing) return existing;

  const now = params.now ?? new Date();
  const activeUntil = endOfBillingCycle(now, params.timezone);

  const rows = await rest<
    Array<{
      id: string;
      tenant_id: string;
      status: DeletionStatus;
      active_until: string;
      purge_after: string;
      created_at: string;
    }>
  >(`crm_deletion_requests`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      tenant_id: params.tenantId,
      requested_by: params.requestedBy ?? null,
      reason: params.reason ?? null,
      status: "scheduled",
      active_until: activeUntil.toISOString(),
      purge_after: activeUntil.toISOString(),
    }),
  });

  if (!rows || rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id,
    tenantId: r.tenant_id,
    status: r.status,
    activeUntil: r.active_until,
    purgeAfter: r.purge_after,
    createdAt: r.created_at,
  };
}

/** Cliente volta atras antes do purge. */
export async function cancelDeletion(tenantId: string): Promise<boolean> {
  const rows = await rest<Array<{ id: string }>>(
    `crm_deletion_requests?tenant_id=eq.${encodeURIComponent(tenantId)}&status=eq.scheduled`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ status: "cancelled", cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
    }
  );
  return Array.isArray(rows) && rows.length > 0;
}

/** Pedidos vencidos: purge_after ja passou e ainda estao agendados. */
export async function listDueDeletions(now = new Date()): Promise<DeletionRequest[]> {
  const rows = await rest<
    Array<{
      id: string;
      tenant_id: string;
      status: DeletionStatus;
      active_until: string;
      purge_after: string;
      created_at: string;
    }>
  >(
    `crm_deletion_requests?status=eq.scheduled&purge_after=lte.${encodeURIComponent(
      now.toISOString()
    )}&select=id,tenant_id,status,active_until,purge_after,created_at&limit=50`
  );
  if (!rows) return [];
  return rows.map((r) => ({
    id: r.id,
    tenantId: r.tenant_id,
    status: r.status,
    activeUntil: r.active_until,
    purgeAfter: r.purge_after,
    createdAt: r.created_at,
  }));
}

/** Chama a RPC que apaga tudo numa transacao. Devolve as contagens por tabela. */
export async function purgeTenant(tenantId: string): Promise<Record<string, number> | null> {
  return rest<Record<string, number>>(`rpc/crm_purge_tenant`, {
    method: "POST",
    body: JSON.stringify({ p_tenant: tenantId }),
  });
}

/** Marca o pedido como purgado depois que a RPC respondeu. */
export async function markPurged(requestId: string): Promise<boolean> {
  const rows = await rest<Array<{ id: string }>>(
    `crm_deletion_requests?id=eq.${encodeURIComponent(requestId)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ status: "purged", purged_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
    }
  );
  return Array.isArray(rows) && rows.length > 0;
}

export type PurgeRunResult = {
  checked: number;
  purged: Array<{ tenantId: string; requestId: string; counts: Record<string, number> }>;
  failed: Array<{ tenantId: string; requestId: string; error: string }>;
};

/**
 * Executa a exclusao dos pedidos vencidos. Idempotente: se a RPC falhar, o
 * pedido continua 'scheduled' e sera tentado de novo na proxima execucao.
 */
export async function runDeletionPurge(now = new Date()): Promise<PurgeRunResult> {
  const due = await listDueDeletions(now);
  const result: PurgeRunResult = { checked: due.length, purged: [], failed: [] };

  for (const req of due) {
    const counts = await purgeTenant(req.tenantId);
    if (counts === null) {
      result.failed.push({ tenantId: req.tenantId, requestId: req.id, error: "purge_rpc_failed" });
      continue;
    }
    await markPurged(req.id);
    result.purged.push({ tenantId: req.tenantId, requestId: req.id, counts });
  }

  return result;
}
