import { NextRequest } from "next/server";
import { authorizeCrmTenant } from "@/lib/crm/tenant-access";
import { isAllowedOrigin, privateJson } from "@/lib/crm/supabase-server";
import { runAutoCloseForTenant, runAutoCloseAllTenants } from "@/lib/crm/auto-close";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin, request.url)) return privateJson({ error: "origin_forbidden" }, 403);

  try {
    const body = await request.json().catch(() => ({}));
    const tenantId = typeof body.tenantId === "string" ? body.tenantId : "";

    if (tenantId) {
      if (!UUID.test(tenantId)) return privateJson({ error: "invalid_tenant" }, 400);
      const access = await authorizeCrmTenant(request, tenantId);
      if (!access) return privateJson({ error: "unauthorized" }, 401);

      const result = await runAutoCloseForTenant(tenantId);
      return privateJson({ ok: true, result });
    }

    // If no specific tenant passed, check if request is from master/admin
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET || process.env.CRM_WEBHOOK_SECRET || "";
    const isCronAuthorized = cronSecret && authHeader === `Bearer ${cronSecret}`;

    if (!isCronAuthorized) {
      return privateJson({ error: "tenant_required" }, 400);
    }

    const allResult = await runAutoCloseAllTenants();
    return privateJson({ ok: true, allResult });
  } catch (e) {
    return privateJson({ error: e instanceof Error ? e.message : "auto_close_failed" }, 500);
  }
}

export async function GET(request: NextRequest) {
  const tenantId = request.nextUrl.searchParams.get("tenant") || request.nextUrl.searchParams.get("tenantId") || "";

  if (tenantId) {
    if (!UUID.test(tenantId)) return privateJson({ error: "invalid_tenant" }, 400);
    const access = await authorizeCrmTenant(request, tenantId);
    if (!access) return privateJson({ error: "unauthorized" }, 401);

    const result = await runAutoCloseForTenant(tenantId);
    return privateJson({ ok: true, result });
  }

  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET || process.env.CRM_WEBHOOK_SECRET || "";
  const isCronAuthorized = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (isCronAuthorized) {
    const allResult = await runAutoCloseAllTenants();
    return privateJson({ ok: true, allResult });
  }

  return privateJson({ error: "tenant_required" }, 400);
}
