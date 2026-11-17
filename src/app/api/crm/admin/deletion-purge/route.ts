import { NextRequest } from "next/server";
import { isAllowedOrigin, privateJson } from "@/lib/crm/supabase-server";
import { timingSafeMatch, verifyMasterRequest } from "@/lib/crm/master-auth";
import { runDeletionPurge } from "@/lib/crm/account-deletion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Executa a exclusao definitiva dos pedidos vencidos.
//
// Protegido por sessao de Master OU por segredo de cron via header, para poder
// ser chamado por um agendador externo sem expor a rota nem aceitar segredo em query string.
function cronAuthorized(request: NextRequest): boolean {
  const secret = (process.env.CRM_WEBHOOK_SECRET || process.env.CRON_SECRET || "").trim();
  if (secret.length < 32) return false;
  const header = request.headers.get("x-cron-secret") || "";
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || "";
  return timingSafeMatch(header, secret) || timingSafeMatch(bearer, secret);
}

async function handle(request: NextRequest) {
  try {
    const authorized = cronAuthorized(request) || (await verifyMasterRequest(request)).authorized;
    if (!authorized) return privateJson({ error: "unauthorized" }, 401);

    const result = await runDeletionPurge();
    return privateJson(result);
  } catch {
    return privateJson({ error: "internal_error" }, 500);
  }
}

export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return privateJson({ error: "method_not_allowed" }, 405);
  }
  return handle(request);
}

export async function POST(request: NextRequest) {
  if (!cronAuthorized(request) && !isAllowedOrigin(request.headers.get("origin"), request.url)) {
    return privateJson({ error: "origin_forbidden" }, 403);
  }
  return handle(request);
}
