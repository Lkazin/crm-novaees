import { NextRequest } from "next/server";
import Redis from "ioredis";
import { isAllowedOrigin, privateJson, supabaseRows, supabaseSettings, verifyOperator } from "@/lib/crm/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  if (!isAllowedOrigin(request.headers.get("origin"), request.url)) return privateJson({ error: "origin_forbidden" }, 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return privateJson({ error: "json_required" }, 415);
  if (Number(request.headers.get("content-length") ?? 0) > 1024) return privateJson({ error: "payload_too_large" }, 413);

  let body: unknown;
  try { body = await request.json(); } catch { return privateJson({ error: "invalid_json" }, 400); }
  const data = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const tenant = typeof data.tenantId === "string" ? data.tenantId : "";
  const conversation = typeof data.conversationId === "string" ? data.conversationId : "";
  const action = typeof data.action === "string" ? data.action : "";
  const targetMode = data.mode === "ai" ? "ai" : "human";

  if (!UUID.test(tenant) || !UUID.test(conversation)) return privateJson({ error: "invalid_request" }, 400);

  try {
    const operator = await verifyOperator();
    if (!operator) return privateJson({ error: "unauthorized" }, 401);

    const member = await supabaseRows<{ role: string }[]>(
      "crm_tenant_memberships?select=role&tenant_id=eq." + tenant + "&user_id=eq." + operator.id + "&limit=1", operator.token);
    if (member.length !== 1 || !["owner", "admin", "agent"].includes(member[0].role))
      return privateJson({ error: "not_authorized" }, 403);

    const { url } = supabaseSettings();
    const secret = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY ?? "";
    if (secret.length < 30) return privateJson({ error: "service_not_configured" }, 503);

    const redisUrl = process.env.CRM_REDIS_URL;

    // Action: Resolve Urgency
    if (action === "resolve_urgency") {
      await fetch(url + "/rest/v1/crm_conversations?id=eq." + conversation + "&tenant_id=eq." + tenant, {
        method: "PATCH",
        headers: { apikey: secret, Authorization: "Bearer " + secret, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "open" })
      });
      if (redisUrl) {
        try {
          const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
          await redis.connect();
          await redis.del(`crm:escalation:${conversation}`);
          redis.disconnect();
        } catch {}
      }
      return privateJson({ resolved: true, conversationId: conversation, status: "open" });
    }

    if (targetMode === "ai") {
      const r = await fetch(url + "/rest/v1/crm_conversations?id=eq." + conversation + "&tenant_id=eq." + tenant, {
        method: "PATCH",
        headers: { apikey: secret, Authorization: "Bearer " + secret, "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "ai", status: "open", assigned_to: null })
      });
      if (!r.ok) return privateJson({ error: "failed_to_resume_ai" }, 500);

      if (redisUrl) {
        try {
          const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
          await redis.connect();
          await redis.del(`crm:escalation:${conversation}`);
          redis.disconnect();
        } catch {}
      }

      return privateJson({ claimed: false, conversationId: conversation, mode: "ai", status: "open" });
    } else {
      const r = await fetch(url + "/rest/v1/rpc/crm_operator_claim_conversation", {
        method: "POST", cache: "no-store", signal: AbortSignal.timeout(9000),
        headers: { apikey: secret, Authorization: "Bearer " + secret, "Content-Type": "application/json" },
        body: JSON.stringify({ p_tenant: tenant, p_conversation: conversation, p_actor: operator.id })
      });
      if (!r.ok) {
        await fetch(url + "/rest/v1/crm_conversations?id=eq." + conversation + "&tenant_id=eq." + tenant, {
          method: "PATCH",
          headers: { apikey: secret, Authorization: "Bearer " + secret, "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "human", assigned_to: operator.id })
        });
      }

      // Check if there was an active escalation detected
      let escalationHeader = "";
      if (redisUrl) {
        try {
          const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
          await redis.connect();
          const escRaw = await redis.get(`crm:escalation:${conversation}`);
          if (escRaw) {
            const parsed = JSON.parse(escRaw);
            escalationHeader = `🚨 ALERTA DETECTADO: ${parsed.reason || "Reclamação ou Frustração do Cliente"}\n`;
          }
          redis.disconnect();
        } catch {}
      }

      // Generate 3-line structured handoff summary from recent messages
      let summary = "";
      try {
        const rMsgs = await fetch(
          url + `/rest/v1/crm_messages?conversation_id=eq.${conversation}&select=direction,body,sender_type&order=created_at.desc&limit=8`,
          { headers: { apikey: secret, Authorization: "Bearer " + secret }, cache: "no-store" }
        );
        if (rMsgs.ok) {
          const msgs = (await rMsgs.json()) as Array<{ direction: string; body: string; sender_type: string }>;
          const inbound = msgs.filter(m => m.direction === "inbound" || m.sender_type === "customer").map(m => m.body).reverse();
          const lastCustMsg = inbound[inbound.length - 1] || "Cliente iniciou contato";
          const prevCustMsg = inbound.length > 1 ? inbound[inbound.length - 2] : "";

          summary = `${escalationHeader}👤 Atendimento transferido para operador humano.\n📌 Última mensagem do cliente: "${lastCustMsg.slice(0, 120)}"\n${prevCustMsg ? `💬 Contexto anterior: "${prevCustMsg.slice(0, 80)}"\n` : ""}⏳ Status: IA pausada nesta conversa. Atendente no comando.`;
        }
      } catch {}

      return privateJson({
        claimed: true,
        conversationId: conversation,
        mode: "human",
        summary
      });
    }
  } catch {
    return privateJson({ error: "handoff_unavailable" }, 503);
  }
}
