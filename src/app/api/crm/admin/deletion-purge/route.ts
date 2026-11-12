import { NextRequest } from "next/server";
import { privateJson } from "@/lib/crm/supabase-server";
import { verifyMasterRequest } from "@/lib/crm/master-auth";
import { runDeletionPurge } from "@/lib/crm/account-deletion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Executa a exclusao definitiva dos pedidos vencidos.
//
// Protegido por sessao de Master OU por segredo de cron, para poder ser chamado
// por um agendador externo sem expor a rota. Cada pedido roda numa transacao:
// ou apaga tudo, ou nao apaga nada.
function cronAuthorized(request: NextRequest): boolean {
  const secret = (process.env.CRM_WEBHOOK_SECRET || "").trim();
  if (secret.length < 32) return false;
  const header = request.headers.get("x-cron-secret") || "";
  const query = request.nextUrl.searchParams.get("secret") || "";
  const matches = (a: string, b: string) => {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  };
  return (header.length > 0 && matches(header, secret)) || (query.length > 0 && matches(query, secret));
}

async function handle(request: NextRequest) {
  try {
    const authorized = cronAuthorized(request) || (await verifyMasterRequest(request)).authorized;
    if (!authorized) return privateJson({ error: "unauthorized" }, 401);

    const result = await runDeletionPurge();
    return privateJson(result);
  } catch (err) {
    return privateJson(
      { error: "internal_error", message: err instanceof Error ? err.message : String(err) },
      500
    );
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
