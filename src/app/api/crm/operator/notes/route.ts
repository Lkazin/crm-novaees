import { NextRequest } from "next/server";
import { isAllowedOrigin, privateJson, supabaseSettings } from "@/lib/crm/supabase-server";
import { authorizeCrmTenant, isAreaAllowed } from "@/lib/crm/tenant-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  if (!isAllowedOrigin(request.headers.get("origin"), request.url)) {
    return privateJson({ error: "origin_forbidden" }, 403);
  }
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return privateJson({ error: "json_required" }, 415);
  }

  try {
    const body = await request.json();
    const tenantId = typeof body.tenantId === "string" ? body.tenantId.trim() : "";
    const conversationId = typeof body.conversationId === "string" ? body.conversationId.trim() : "";
    const noteBody = typeof body.body === "string" ? body.body.trim() : "";

    if (!UUID.test(tenantId) || !UUID.test(conversationId)) {
      return privateJson({ error: "invalid_params", message: "Empresa ou conversa inválida." }, 400);
    }
    if (!noteBody || noteBody.length > 2000) {
      return privateJson({ error: "invalid_note", message: "A nota interna deve ter entre 1 e 2.000 caracteres." }, 400);
    }

    const access = await authorizeCrmTenant(request, tenantId, ["owner", "admin", "agent"]);
    if (!access) return privateJson({ error: "unauthorized" }, 401);
    if (!isAreaAllowed(access, tenantId, "atendimentos")) {
      return privateJson({ error: "area_forbidden" }, 403);
    }

    const { url } = supabaseSettings();
    const secret = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
    if (secret.length < 30) return privateJson({ error: "service_not_configured" }, 503);

    // Ensure conversation belongs to tenant
    const rConv = await fetch(
      `${url}/rest/v1/crm_conversations?id=eq.${encodeURIComponent(conversationId)}&tenant_id=eq.${encodeURIComponent(tenantId)}&select=id&limit=1`,
      { headers: { apikey: secret, Authorization: `Bearer ${secret}` }, cache: "no-store", signal: AbortSignal.timeout(5000) }
    );
    if (!rConv.ok) return privateJson({ error: "conversation_lookup_failed" }, 503);
    const convs = (await rConv.json()) as Array<{ id: string }>;
    if (convs.length !== 1) return privateJson({ error: "conversation_not_found" }, 404);

    const payload: Record<string, unknown> = {
      tenant_id: tenantId,
      conversation_id: conversationId,
      body: noteBody
    };
    if (access.operatorId && UUID.test(access.operatorId)) {
      payload.author_id = access.operatorId;
    }

    const rInsert = await fetch(`${url}/rest/v1/crm_internal_notes`, {
      method: "POST",
      headers: {
        apikey: secret,
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(6000)
    });
    if (!rInsert.ok) {
      const detail = await rInsert.text().catch(() => "");
      console.error("[operator-notes-post-error]", rInsert.status, detail);
      return privateJson({ error: "note_save_failed", message: "Não foi possível salvar a nota interna." }, 500);
    }
    const created = (await rInsert.json()) as Array<{
      id: string;
      conversation_id: string;
      author_id?: string | null;
      body: string;
      created_at: string;
    }>;

    return privateJson({ success: true, note: created[0] });
  } catch (err) {
    return privateJson({
      error: "internal_error",
      message: err instanceof Error ? err.message : "Erro ao salvar nota interna."
    }, 500);
  }
}

export async function DELETE(request: NextRequest) {
  if (!isAllowedOrigin(request.headers.get("origin"), request.url)) {
    return privateJson({ error: "origin_forbidden" }, 403);
  }

  try {
    const tenantId = request.nextUrl.searchParams.get("tenant")?.trim() ?? "";
    const noteId = request.nextUrl.searchParams.get("noteId")?.trim() ?? "";
    if (!UUID.test(tenantId) || !UUID.test(noteId)) {
      return privateJson({ error: "invalid_params" }, 400);
    }

    const access = await authorizeCrmTenant(request, tenantId, ["owner", "admin", "agent"]);
    if (!access) return privateJson({ error: "unauthorized" }, 401);
    if (!isAreaAllowed(access, tenantId, "atendimentos")) {
      return privateJson({ error: "area_forbidden" }, 403);
    }

    const { url } = supabaseSettings();
    const secret = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
    if (secret.length < 30) return privateJson({ error: "service_not_configured" }, 503);

    const rDel = await fetch(
      `${url}/rest/v1/crm_internal_notes?id=eq.${encodeURIComponent(noteId)}&tenant_id=eq.${encodeURIComponent(tenantId)}`,
      {
        method: "DELETE",
        headers: { apikey: secret, Authorization: `Bearer ${secret}` },
        cache: "no-store",
        signal: AbortSignal.timeout(5000)
      }
    );
    if (!rDel.ok) return privateJson({ error: "note_delete_failed" }, 500);

    return privateJson({ success: true, deleted: noteId });
  } catch {
    return privateJson({ error: "internal_error" }, 500);
  }
}
