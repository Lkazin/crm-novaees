import { NextRequest } from "next/server";
import { isAllowedOrigin, privateJson } from "@/lib/crm/supabase-server";
import { authorizeCrmTenant, isAreaAllowed } from "@/lib/crm/tenant-access";
import {
  deleteConversationCascade,
  deleteSingleMessageCascade,
  syncDeleteConversationToWhatsApp,
  syncDeleteMessageToWhatsApp
} from "@/lib/crm/chat-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveConversationWhatsAppTarget(
  supaUrl: string,
  supaKey: string,
  tenantId: string,
  conversationId: string
): Promise<{ phone: string; instanceName: string } | null> {
  const headers = { apikey: supaKey, Authorization: `Bearer ${supaKey}` };
  try {
    const rConv = await fetch(
      `${supaUrl}/rest/v1/crm_conversations?id=eq.${encodeURIComponent(conversationId)}&tenant_id=eq.${encodeURIComponent(tenantId)}&select=contact_id,channel_id&limit=1`,
      { headers, cache: "no-store", signal: AbortSignal.timeout(5000) }
    );
    if (!rConv.ok) return null;
    const convs = (await rConv.json()) as Array<{ contact_id?: string; channel_id?: string }>;
    const conv = convs[0];
    if (!conv?.contact_id) return null;

    const [rContact, rChannel] = await Promise.all([
      fetch(`${supaUrl}/rest/v1/crm_contacts?id=eq.${encodeURIComponent(conv.contact_id)}&select=phone&limit=1`, {
        headers, cache: "no-store", signal: AbortSignal.timeout(5000)
      }),
      conv.channel_id
        ? fetch(`${supaUrl}/rest/v1/crm_channels?id=eq.${encodeURIComponent(conv.channel_id)}&select=instance_name&limit=1`, {
            headers, cache: "no-store", signal: AbortSignal.timeout(5000)
          })
        : fetch(`${supaUrl}/rest/v1/crm_channels?tenant_id=eq.${encodeURIComponent(tenantId)}&status=eq.connected&select=instance_name&limit=1`, {
            headers, cache: "no-store", signal: AbortSignal.timeout(5000)
          })
    ]);

    const contacts = rContact.ok ? ((await rContact.json()) as Array<{ phone?: string }>) : [];
    const channels = rChannel.ok ? ((await rChannel.json()) as Array<{ instance_name?: string }>) : [];
    const phone = contacts[0]?.phone?.trim() || "";
    const instanceName = channels[0]?.instance_name?.trim() || "";
    if (!phone || !instanceName) return null;
    return { phone, instanceName };
  } catch {
    return null;
  }
}

export async function DELETE(request: NextRequest) {
  if (!isAllowedOrigin(request.headers.get("origin"), request.url)) {
    return privateJson({ error: "origin_forbidden", message: "Origem não autorizada para exclusão." }, 403);
  }

  try {
    const tenantId = request.nextUrl.searchParams.get("tenant")?.trim() ?? "";
    if (!tenantId || !UUID.test(tenantId)) {
      return privateJson({ error: "invalid_tenant", message: "Identificador de empresa inválido." }, 400);
    }

    const access = await authorizeCrmTenant(request, tenantId, ["owner", "admin", "agent"]);
    if (!access) return privateJson({ error: "unauthorized", message: "Sessão expirada. Faça login novamente." }, 401);
    if (!isAreaAllowed(access, tenantId, "atendimentos")) {
      return privateJson({ error: "area_forbidden", message: "Sem permissão para apagar conversas ou mensagens." }, 403);
    }

    const supaUrl = process.env.CRM_SUPABASE_URL?.trim().replace(/\/$/, "");
    const supaKey = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!supaUrl || !supaKey) {
      return privateJson({ error: "database_unavailable", message: "Banco de dados indisponível no momento." }, 503);
    }

    const readHeaders = { apikey: supaKey, Authorization: `Bearer ${supaKey}` };
    const messageId = request.nextUrl.searchParams.get("messageId")?.trim();
    const conversationId = request.nextUrl.searchParams.get("conversationId")?.trim();

    if (messageId) {
      if (!UUID.test(messageId)) {
        return privateJson({ error: "invalid_message_id", message: "ID da mensagem inválido." }, 400);
      }

      // 1. Fetch message metadata before deleting so we can also revoke it on WhatsApp
      let whatsappSynced = false;
      try {
        const rMsg = await fetch(
          `${supaUrl}/rest/v1/crm_messages?id=eq.${encodeURIComponent(messageId)}&tenant_id=eq.${encodeURIComponent(tenantId)}&select=conversation_id,external_id,direction&limit=1`,
          { headers: readHeaders, cache: "no-store", signal: AbortSignal.timeout(5000) }
        );
        if (rMsg.ok) {
          const rows = (await rMsg.json()) as Array<{ conversation_id?: string; external_id?: string | null; direction?: string }>;
          const msg = rows[0];
          if (msg?.conversation_id && msg?.external_id) {
            const target = await resolveConversationWhatsAppTarget(supaUrl, supaKey, tenantId, msg.conversation_id);
            if (target) {
              whatsappSynced = await syncDeleteMessageToWhatsApp(
                target.instanceName,
                target.phone,
                msg.external_id,
                msg.direction === "outbound"
              );
            }
          }
        }
      } catch {}

      const del = await deleteSingleMessageCascade(supaUrl, supaKey, tenantId, messageId);
      if (!del.ok) {
        return privateJson({
          error: "delete_message_failed",
          message: "Não foi possível apagar a mensagem no banco de dados.",
          detail: del.detail
        }, del.status);
      }
      return privateJson({
        success: true,
        deleted: "message",
        id: messageId,
        whatsappSynced
      });
    }

    if (conversationId) {
      if (!UUID.test(conversationId)) {
        return privateJson({ error: "invalid_conversation_id", message: "ID da conversa inválido." }, 400);
      }

      // 1. Capture WhatsApp target + recent external_ids before cascade delete
      let whatsappSync = { revokedCount: 0, archived: false };
      try {
        const [target, rMsgs] = await Promise.all([
          resolveConversationWhatsAppTarget(supaUrl, supaKey, tenantId, conversationId),
          fetch(
            `${supaUrl}/rest/v1/crm_messages?conversation_id=eq.${encodeURIComponent(conversationId)}&tenant_id=eq.${encodeURIComponent(tenantId)}&select=external_id,direction&order=created_at.desc&limit=25`,
            { headers: readHeaders, cache: "no-store", signal: AbortSignal.timeout(5000) }
          )
        ]);
        const recentMsgs = rMsgs.ok
          ? ((await rMsgs.json()) as Array<{ external_id?: string | null; direction?: string | null }>)
          : [];
        if (target) {
          whatsappSync = await syncDeleteConversationToWhatsApp(target.instanceName, target.phone, recentMsgs);
        }
      } catch {}

      // 2. Delete all child records (crm_outbox, crm_quality_events, crm_handoffs, crm_internal_notes, crm_ai_usage_events, crm_messages) + crm_conversations
      const del = await deleteConversationCascade(supaUrl, supaKey, tenantId, conversationId);
      if (!del.ok) {
        return privateJson({
          error: "delete_conversation_failed",
          message: "Não foi possível excluir a conversa no banco de dados.",
          detail: del.detail
        }, del.status);
      }

      return privateJson({
        success: true,
        deleted: "conversation",
        id: conversationId,
        whatsappSynced: whatsappSync.archived || whatsappSync.revokedCount > 0,
        revokedCount: whatsappSync.revokedCount,
        archivedOnWhatsapp: whatsappSync.archived
      });
    }

    return privateJson({ error: "missing_id", message: "Informe messageId ou conversationId para exclusão." }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    return privateJson({ error: "internal_error", message: "Erro interno ao excluir.", detail: message }, 500);
  }
}
