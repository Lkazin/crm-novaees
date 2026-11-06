import Redis from "ioredis";
import type { AgentConfig } from "./config";
import { parseIncoming } from "./parse";
import type { Incoming } from "./parse";
import { generateAnswer, StoreAiContext } from "./ai";
import { sendText } from "./evolution";
import {
  persistOutboundInSupabase,
  fetchConversationContext,
  handoffToHuman
} from "@/lib/crm/supabase-ingest";
import { detectCustomerEscalation } from "./escalation";

export type ProcessResult = {
  status: "ignored" | "duplicate" | "disabled" | "sent" | "buffered";
  reason?: string;
};

function matchesAllowedNumber(incoming: string, allowed: string): boolean {
  if (!allowed || allowed === "*" || allowed === "all") return true;
  if (incoming === allowed) return true;
  const normIncoming = incoming.replace(/^55(\d{2})9?(\d{8})$/, "55$1$2");
  const normAllowed = allowed.replace(/^55(\d{2})9?(\d{8})$/, "55$1$2");
  return normIncoming === normAllowed;
}

function isWithinOperatingHours(hours?: { enabled: boolean; openTime: string; closeTime: string; days?: string[] }): boolean {
  if (!hours || !hours.enabled) return true;
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
    const parts = formatter.formatToParts(now);
    const dayStr = parts.find(p => p.type === "weekday")?.value?.toLowerCase() || "";
    const hourStr = parts.find(p => p.type === "hour")?.value || "00";
    const minuteStr = parts.find(p => p.type === "minute")?.value || "00";

    const dayMap: Record<string, string> = {
      sun: "dom", mon: "seg", tue: "ter", wed: "qua", thu: "qui", fri: "sex", sat: "sab"
    };
    const currentDay = dayMap[dayStr] || "seg";

    if (Array.isArray(hours.days) && hours.days.length > 0 && !hours.days.includes(currentDay)) {
      return false;
    }

    const currentMinutes = parseInt(hourStr, 10) * 60 + parseInt(minuteStr, 10);
    const [openH, openM] = (hours.openTime || "00:00").split(":").map(n => parseInt(n, 10) || 0);
    const [closeH, closeM] = (hours.closeTime || "23:59").split(":").map(n => parseInt(n, 10) || 0);
    const openMinutes = openH * 60 + openM;
    const closeMinutes = closeH * 60 + closeM;

    if (closeMinutes > openMinutes) {
      return currentMinutes >= openMinutes && currentMinutes <= closeMinutes;
    } else {
      return currentMinutes >= openMinutes || currentMinutes <= closeMinutes;
    }
  } catch {
    return true;
  }
}

async function getStoreAiContext(instanceName: string): Promise<{
  context?: StoreAiContext;
  isBlocked?: boolean;
  channelFound?: boolean;
  tenantId?: string;
  quotaLimit?: number;
}> {
  try {
    const url = process.env.CRM_SUPABASE_URL?.trim().replace(/\/$/, "");
    const key = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!url || !key) return {};

    // 1. Find channel by instance_name
    let tenantId: string | undefined;
    const rCh = await fetch(`${url}/rest/v1/crm_channels?instance_name=eq.${encodeURIComponent(instanceName)}&select=tenant_id`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: "no-store"
    });
    const channels = (await rCh.json()) as Array<{ tenant_id: string }>;
    tenantId = channels?.[0]?.tenant_id;
    if (!tenantId) {
      const rTenants = await fetch(`${url}/rest/v1/crm_tenants?select=id,name,status&status=eq.active&order=created_at.desc&limit=1`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        cache: "no-store"
      });
      const activeTenants = (await rTenants.json()) as Array<{ id: string; name: string; status: string }>;
      if (activeTenants?.[0]) tenantId = activeTenants[0].id;
    }
    if (!tenantId) return {};

    // 2. Check tenant status (active vs suspended)
    const rTenant = await fetch(`${url}/rest/v1/crm_tenants?id=eq.${tenantId}&select=name,status`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: "no-store"
    });
    const tenants = (await rTenant.json()) as Array<{ name: string; status: string }>;
    if (tenants?.[0]?.status === "suspended") {
      return { isBlocked: true, channelFound: true, tenantId };
    }

    // 3. Fetch agent instructions and preferred route
    const rAgent = await fetch(`${url}/rest/v1/crm_agents?tenant_id=eq.${tenantId}&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: "no-store"
    });
    const agents = (await rAgent.json()) as Array<{ label: string; instructions: string; enabled: boolean; provider_route: string }>;
    if (agents?.[0] && !agents[0].enabled) {
      return { isBlocked: true, channelFound: true, tenantId };
    }

    // 4. Fetch store knowledge articles
    const rArticles = await fetch(
      `${url}/rest/v1/crm_knowledge_articles?tenant_id=eq.${tenantId}&status=eq.published&order=updated_at.desc&limit=5`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        cache: "no-store"
      }
    );
    const articles = (await rArticles.json()) as Array<{ title: string; body: string }>;
    const storeInfo = Array.isArray(articles)
      ? articles.map(a => `### ${a.title}\n${a.body}`).join("\n\n")
      : "";

    // 5. Fetch operating hours and quota from tenant settings
    let operatingHours = undefined;
    let quotaLimit = 500;
    let primaryModel = agents?.[0]?.provider_route || undefined;
    let fallbackModel = undefined;

    const rSettings = await fetch(`${url}/rest/v1/crm_tenant_settings?tenant_id=eq.${tenantId}&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: "no-store"
    });
    if (rSettings.ok) {
      const settings = (await rSettings.json()) as Array<{ business_description: string }>;
      const rawDesc = settings[0]?.business_description ?? "";
      if (rawDesc.startsWith("{")) {
        try {
          const parsed = JSON.parse(rawDesc);
          if (parsed.plan?.quotaLimit) quotaLimit = Number(parsed.plan.quotaLimit);
          if (parsed.ai_settings?.operatingHours) operatingHours = parsed.ai_settings.operatingHours;
          if (parsed.ai_settings?.primaryModel) primaryModel = parsed.ai_settings.primaryModel;
          if (parsed.ai_settings?.fallbackModel) fallbackModel = parsed.ai_settings.fallbackModel;
        } catch {}
      }
    }

    return {
      channelFound: true,
      tenantId,
      quotaLimit,
      context: {
        storeName: tenants?.[0]?.name,
        instructions: agents?.[0]?.instructions,
        storeInfo,
        primaryModel,
        fallbackModel,
        operatingHours
      }
    };
  } catch {
    return {};
  }
}

export async function processWebhook(
  payload: unknown,
  cfg: AgentConfig,
  deps: { redis?: Redis; generate?: typeof generateAnswer; send?: typeof sendText; maySend?: (incoming: Incoming) => Promise<boolean> } = {},
): Promise<ProcessResult> {
  const incoming = parseIncoming(payload);
  if (!incoming) return { status: "ignored", reason: "unsupported_event" };

  // Check store context & permission
  const { context = {}, isBlocked, tenantId, quotaLimit } = await getStoreAiContext(incoming.instance);
  if (isBlocked) return { status: "disabled", reason: "store_suspended_or_overdue" };

  const isAuthorizedInstance = Boolean(incoming.instance);
  if (!isAuthorizedInstance) return { status: "ignored", reason: "wrong_instance" };

  if (!matchesAllowedNumber(incoming.number, cfg.allowedNumber)) return { status: "ignored", reason: "number_not_allowed" };
  if (!cfg.sendEnabled) return { status: "disabled", reason: "reply_switch_off" };

  const redis = deps.redis ?? new Redis(cfg.redisUrl, { maxRetriesPerRequest: 1, connectTimeout: 3000, lazyConnect: true });
  const ownsClient = !deps.redis;
  const doneKey = `crm:lab:done:${incoming.instance}:${incoming.id}`;
  const bufferKey = `crm:buf:${incoming.instance}:${incoming.number}`;
  const debounceKey = `crm:dblock:${incoming.instance}:${incoming.number}`;

  try {
    if (ownsClient) await redis.connect();

    // 1. Anti-duplication check: if exact message was already processed
    if (await redis.exists(doneKey)) return { status: "duplicate" };

    // 2. Add message to buffer for this contact
    await redis.rpush(bufferKey, JSON.stringify({ id: incoming.id, text: incoming.text }));
    await redis.expire(bufferKey, 30);

    // 3. Try to acquire debounce leader lock (waits to group consecutive messages)
    const isLeader = await redis.set(debounceKey, "1", "EX", 10, "NX");
    if (isLeader !== "OK") {
      return { status: "buffered" };
    }

    // 4. Leader worker: wait 1400ms for user to finish rapid consecutive typing
    await new Promise(resolve => setTimeout(resolve, 1400));

    try {
      // 5. Collect all buffered messages for this user
      const rawList = await redis.lrange(bufferKey, 0, -1);
      await redis.del(bufferKey);

      const items: Array<{ id: string; text: string }> = [];
      for (const item of rawList) {
        try {
          items.push(JSON.parse(item));
        } catch {
          items.push({ id: incoming.id, text: item });
        }
      }

      for (const it of items) {
        if (it.id) {
          await redis.set(`crm:lab:done:${incoming.instance}:${it.id}`, "sent", "EX", 86_400);
        }
      }

      const combinedText = items.map(it => it.text.trim()).filter(Boolean).join("\n") || incoming.text;

      // 6. Check for customer dissatisfaction, complaints, delays, refund demands or human handoff
      const escalation = detectCustomerEscalation(combinedText);
      const isUrgent = escalation.isEscalation && (escalation.sentiment === "urgent" || escalation.sentiment === "frustrated");

      // 7. Check if conversation is already in human mode
      const convContext = await fetchConversationContext(incoming.instance, incoming.number, 10);
      if (convContext.mode === "human") {
        // If customer is complaining while in human mode, ensure conversation is flagged urgent in Supabase & Redis
        if (isUrgent && convContext.conversationId) {
          try {
            await handoffToHuman(incoming.instance, incoming.number, true);
            await redis.set(
              `crm:escalation:${convContext.conversationId}`,
              JSON.stringify({
                category: escalation.category,
                reason: escalation.reason,
                sentiment: escalation.sentiment,
                text: combinedText.slice(0, 300),
                timestamp: new Date().toISOString()
              }),
              "EX",
              86400 * 7
            );
          } catch {}
        }
        return { status: "disabled", reason: "conversation_in_human_mode" };
      }

      // 8. If in AI mode and escalation was detected -> hand off to human immediately
      if (escalation.isEscalation) {
        const convId = await handoffToHuman(incoming.instance, incoming.number, isUrgent);

        if (convId) {
          try {
            await redis.set(
              `crm:escalation:${convId}`,
              JSON.stringify({
                category: escalation.category,
                reason: escalation.reason,
                sentiment: escalation.sentiment,
                text: combinedText.slice(0, 300),
                timestamp: new Date().toISOString()
              }),
              "EX",
              86400 * 7
            );
          } catch {}
        }

        const escalationReply = escalation.customerReply || "Com certeza! Estou transferindo seu atendimento para a nossa equipe humana agora mesmo. Em instantes alguém irá continuar por aqui com você! 😊";
        await (deps.send ?? sendText)(incoming.number, escalationReply, cfg, incoming.instance);
        try {
          await persistOutboundInSupabase(incoming.instance, incoming.number, escalationReply);
        } catch {}

        return { status: "sent", reason: `escalated_${escalation.category || "human"}` };
      }

      // 8. Operating hours check
      if (context.operatingHours && !isWithinOperatingHours(context.operatingHours)) {
        const closedNoticeKey = `crm:closed_notice:${incoming.instance}:${incoming.number}`;
        const shouldSendNotice = await redis.set(closedNoticeKey, "1", "EX", 21600, "NX"); // 6h cooldown
        if (shouldSendNotice === "OK") {
          const closedMsg = context.operatingHours.closedMessage || "Olá! No momento estamos fora do nosso horário de atendimento. Deixe sua mensagem e responderemos assim que retornarmos! 😊";
          await (deps.send ?? sendText)(incoming.number, closedMsg, cfg, incoming.instance);
          try {
            await persistOutboundInSupabase(incoming.instance, incoming.number, closedMsg);
          } catch {}
        }
        return { status: "disabled", reason: "outside_operating_hours" };
      }

      // 9. Session & Quota check (24h conversation window)
      if (tenantId) {
        const sessionKey = `crm:session:${tenantId}:${incoming.number}`;
        const isNewSession = await redis.set(sessionKey, "1", "EX", 86400, "NX");
        const monthKey = new Date().toISOString().slice(0, 7);
        const quotaKey = `crm:quota:${tenantId}:${monthKey}`;

        if (isNewSession === "OK") {
          await redis.incr(quotaKey);
          await redis.expire(quotaKey, 86400 * 60);
        }

        const currentUsageRaw = await redis.get(quotaKey);
        const currentUsage = parseInt(currentUsageRaw || "0", 10);
        const maxLimit = quotaLimit || 500;

        if (currentUsage > maxLimit) {
          console.warn(`[crm-quota-exceeded] Tenant ${tenantId} used ${currentUsage}/${maxLimit}`);
          return { status: "disabled", reason: "quota_exceeded" };
        }
      }

      // 10. Attach conversation history to context
      context.history = convContext.history;

      if (deps.maySend && !(await deps.maySend(incoming))) {
        return { status: "disabled", reason: "tenant_or_conversation_blocked" };
      }

      // 11. Generate answer with fallback support
      const answer = await (deps.generate ?? generateAnswer)(combinedText, cfg, context);

      if (deps.maySend && !(await deps.maySend(incoming))) {
        return { status: "disabled", reason: "tenant_or_conversation_blocked" };
      }

      // 12. Send response
      await (deps.send ?? sendText)(incoming.number, answer, cfg, incoming.instance);
      try {
        await persistOutboundInSupabase(incoming.instance, incoming.number, answer);
      } catch {}

      return { status: "sent" };
    } finally {
      await redis.del(debounceKey);
    }
  } catch (err) {
    console.error("[processor-error]", err);
    throw err;
  } finally {
    if (ownsClient) redis.disconnect();
  }
}
