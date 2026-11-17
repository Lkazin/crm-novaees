import { NextRequest } from "next/server";
import { isAllowedOrigin, privateJson } from "@/lib/crm/supabase-server";
import { authorizeCrmTenant, isAreaAllowed } from "@/lib/crm/tenant-access";
import {
  cancelDeletion,
  daysUntilPurge,
  getActiveDeletionRequest,
  scheduleDeletion,
} from "@/lib/crm/account-deletion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cancelamento e exclusao de conta pelo proprio cliente.
//
// GET    -> estado atual do pedido (nada e apagado)
// POST   -> agenda o cancelamento; o painel continua ativo ate o fim do ciclo
// DELETE -> cliente volta atras, enquanto o purge nao rodou
//
// O tenant e sempre validado por authorizeCrmTenant (owner/admin apenas).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function tenantIdFrom(request: NextRequest, body?: Record<string, unknown>): Promise<string | null> {
  const fromQuery = request.nextUrl.searchParams.get("tenant")?.trim() ?? "";
  const fromBody = typeof body?.tenantId === "string" ? body.tenantId.trim() : "";
  const candidate = fromQuery || fromBody;
  return UUID.test(candidate) ? candidate : null;
}

export async function GET(request: NextRequest) {
  try {
    const tenantId = await tenantIdFrom(request);
    if (!tenantId) return privateJson({ error: "invalid_tenant" }, 400);
    const access = await authorizeCrmTenant(request, tenantId, ["owner", "admin"]);
    if (!access) return privateJson({ error: "unauthorized" }, 401);
    if (!isAreaAllowed(access, tenantId, "plano")) return privateJson({ error: "area_forbidden" }, 403);

    const req = await getActiveDeletionRequest(tenantId);
    if (!req) return privateJson({ scheduled: false });
    return privateJson({
      scheduled: true,
      activeUntil: req.activeUntil,
      purgeAfter: req.purgeAfter,
      daysLeft: daysUntilPurge(req.purgeAfter),
    });
  } catch {
    return privateJson({ error: "internal_error" }, 500);
  }
}

export async function POST(request: NextRequest) {
  if (!isAllowedOrigin(request.headers.get("origin"), request.url)) return privateJson({ error: "origin_forbidden" }, 403);
  try {
    let body: Record<string, unknown> = {};
    try {
      const parsed = await request.json();
      if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
    } catch {
      body = {};
    }

    const tenantId = await tenantIdFrom(request, body);
    if (!tenantId) return privateJson({ error: "invalid_tenant" }, 400);
    const access = await authorizeCrmTenant(request, tenantId, ["owner", "admin"]);
    if (!access) return privateJson({ error: "unauthorized" }, 401);
    if (!isAreaAllowed(access, tenantId, "plano")) return privateJson({ error: "area_forbidden" }, 403);

    const reason = typeof body.reason === "string" ? body.reason.slice(0, 500) : undefined;
    const req = await scheduleDeletion({
      tenantId,
      requestedBy: access.operatorEmail ?? access.operatorId ?? undefined,
      reason,
    });
    if (!req) return privateJson({ error: "schedule_failed" }, 500);

    return privateJson({
      scheduled: true,
      activeUntil: req.activeUntil,
      purgeAfter: req.purgeAfter,
      daysLeft: daysUntilPurge(req.purgeAfter),
    });
  } catch {
    return privateJson({ error: "internal_error" }, 500);
  }
}

export async function DELETE(request: NextRequest) {
  if (!isAllowedOrigin(request.headers.get("origin"), request.url)) return privateJson({ error: "origin_forbidden" }, 403);
  try {
    const tenantId = await tenantIdFrom(request);
    if (!tenantId) return privateJson({ error: "invalid_tenant" }, 400);
    const access = await authorizeCrmTenant(request, tenantId, ["owner", "admin"]);
    if (!access) return privateJson({ error: "unauthorized" }, 401);
    if (!isAreaAllowed(access, tenantId, "plano")) return privateJson({ error: "area_forbidden" }, 403);

    const ok = await cancelDeletion(tenantId);
    return privateJson({ cancelled: ok });
  } catch {
    return privateJson({ error: "internal_error" }, 500);
  }
}
