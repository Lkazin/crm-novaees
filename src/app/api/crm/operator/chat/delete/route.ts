import { NextRequest } from "next/server";
import { isAllowedOrigin, privateJson } from "@/lib/crm/supabase-server";
import { authorizeCrmTenant, isAreaAllowed } from "@/lib/crm/tenant-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(request: NextRequest) {
  if (!isAllowedOrigin(request.headers.get("origin"), request.url)) {
    return privateJson({ error: "origin_forbidden" }, 403);
  }

  try {
    const tenantId = request.nextUrl.searchParams.get("tenant")?.trim() ?? "";
    if (!tenantId || !UUID.test(tenantId)) {
      return privateJson({ error: "invalid_tenant" }, 400);
    }

    const access = await authorizeCrmTenant(request, tenantId, ["owner", "admin", "agent"]);
    if (!access) return privateJson({ error: "unauthorized" }, 401);
    if (!isAreaAllowed(access, tenantId, "atendimentos")) {
      return privateJson({ error: "area_forbidden" }, 403);
    }

    const supaUrl = process.env.CRM_SUPABASE_URL?.trim().replace(/\/$/, "");
    const supaKey = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!supaUrl || !supaKey) {
      return privateJson({ error: "database_unavailable" }, 503);
    }

    const headers = {
      apikey: supaKey,
      Authorization: `Bearer ${supaKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    };

    const messageId = request.nextUrl.searchParams.get("messageId")?.trim();
    const conversationId = request.nextUrl.searchParams.get("conversationId")?.trim();

    if (messageId) {
      // 1. Delete single message (ensuring it belongs to a conversation of this tenant)
      const res = await fetch(
        `${supaUrl}/rest/v1/crm_messages?id=eq.${encodeURIComponent(messageId)}`,
        { method: "DELETE", headers }
      );
      if (!res.ok) {
        return privateJson({ error: "delete_message_failed" }, res.status);
      }
      return privateJson({ success: true, deleted: "message", id: messageId });
    }

    if (conversationId) {
      // 2. Delete all messages of this conversation first, then the conversation
      await fetch(
        `${supaUrl}/rest/v1/crm_messages?conversation_id=eq.${encodeURIComponent(conversationId)}`,
        { method: "DELETE", headers }
      );

      const res = await fetch(
        `${supaUrl}/rest/v1/crm_conversations?id=eq.${encodeURIComponent(conversationId)}&tenant_id=eq.${encodeURIComponent(tenantId)}`,
        { method: "DELETE", headers }
      );
      if (!res.ok) {
        return privateJson({ error: "delete_conversation_failed" }, res.status);
      }
      return privateJson({ success: true, deleted: "conversation", id: conversationId });
    }

    return privateJson({ error: "missing_id", message: "Informe messageId ou conversationId para exclusão." }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    return privateJson({ error: "internal_error", detail: message }, 500);
  }
}
