import { NextRequest } from "next/server";
import { authorizeCrmTenant } from "@/lib/crm/tenant-access";
import { isAllowedOrigin, privateJson, supabaseSettings } from "@/lib/crm/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin, request.url)) return privateJson({ error: "origin_forbidden" }, 403);

  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get("tenantId") || "";

  if (!UUID.test(tenantId)) {
    return privateJson({ error: "invalid_tenant" }, 400);
  }

  try {
    const access = await authorizeCrmTenant(request, tenantId, ["owner", "admin", "agent"]);
    if (!access) return privateJson({ error: "not_authorized" }, 403);

    const { url } = supabaseSettings();
    const secret = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY ?? "";
    if (secret.length < 30) return privateJson({ error: "service_not_configured" }, 503);

    // Fast indexed query: pending handoffs requiring urgent human attention
    const rHandoffs = await fetch(
      `${url}/rest/v1/crm_handoffs?tenant_id=eq.${tenantId}&status=eq.pending&select=id,conversation_id,reason,created_at&order=created_at.desc&limit=5`,
      {
        headers: { apikey: secret, Authorization: `Bearer ${secret}` },
        cache: "no-store",
        signal: AbortSignal.timeout(3000)
      }
    ).catch(() => null);

    const handoffs = rHandoffs && rHandoffs.ok
      ? ((await rHandoffs.json()) as Array<{ id: string; conversation_id: string; reason?: string; created_at: string }>)
      : [];

    return privateJson({
      ok: true,
      waitingCount: handoffs.length,
      latestHandoff: handoffs[0] || null,
      timestamp: Date.now()
    });
  } catch (err) {
    return privateJson({ error: err instanceof Error ? err.message : "pulse_failed" }, 500);
  }
}

