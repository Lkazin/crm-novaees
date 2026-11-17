import { NextRequest } from "next/server";
import { authorizeCrmTenant } from "@/lib/crm/tenant-access";
import { isAllowedOrigin, privateJson } from "@/lib/crm/supabase-server";
import { timingSafeMatch } from "@/lib/crm/master-auth";
import { runAutoCloseForTenant, runAutoCloseAllTenants } from "@/lib/crm/auto-close";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isCronRequest(request: NextRequest): boolean {
  const cronSecret = (process.env.CRON_SECRET || process.env.CRM_WEBHOOK_SECRET || "").trim();
  if (cronSecret.length < 16) return false;
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || "";
  const headerSecret = request.headers.get("x-cron-secret")?.trim() || "";
  return timingSafeMatch(bearer, cronSecret) || timingSafeMatch(headerSecret, cronSecret);
}

export async function POST(request: NextRequest) {
  const cronOk = isCronRequest(request);
  const origin = request.headers.get("origin");
  if (!cronOk && !isAllowedOrigin(origin, request.url)) return privateJson({ error: "origin_forbidden" }, 403);

  try {
    const body = await request.json().catch(() => ({}));
    const tenantId = typeof body.tenantId === "string" ? body.tenantId : "";

    if (tenantId) {
      if (!UUID.test(tenantId)) return privateJson({ error: "invalid_tenant" }, 400);
      const access = await authorizeCrmTenant(request, tenantId, ["owner", "admin", "agent"]);
      if (!access) return privateJson({ error: "unauthorized" }, 401);

      const result = await runAutoCloseForTenant(tenantId);
      return privateJson({ ok: true, result });
    }

    if (!cronOk) {
      return privateJson({ error: "tenant_required" }, 400);
    }

    const allResult = await runAutoCloseAllTenants();
    return privateJson({ ok: true, allResult });
  } catch {
    return privateJson({ error: "auto_close_failed" }, 500);
  }
}

export async function GET(request: NextRequest) {
  if (!isCronRequest(request)) {
    return privateJson({ error: "method_not_allowed" }, 405);
  }

  try {
    const allResult = await runAutoCloseAllTenants();
    return privateJson({ ok: true, allResult });
  } catch {
    return privateJson({ error: "auto_close_failed" }, 500);
  }
}

