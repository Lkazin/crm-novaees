import Redis from "ioredis";
import type { AgentConfig } from "./config";
import { parseIncoming } from "./parse";
import type { Incoming } from "./parse";
import { generateAnswer, StoreAiContext, DaySchedule } from "./ai";
import { sendText } from "./evolution";
import {
  persistOutboundInSupabase,
  fetchConversationContext,
  handoffToHuman,
  resolveChannelForInstance
} from "@/lib/crm/supabase-ingest";
import { detectCustomerEscalation } from "./escalation";
import { getEffectiveTenantPlan, invalidateEffectivePlanCache } from "@/lib/crm/plans";
import { extractSlotFromInstanceName } from "@/lib/crm/whatsapp-slots";

export type ProcessResult = {
  status: "ignored" | "duplicate" | "disabled" | "sent" | "buffered";
  reason?: string;
};

export const MAX_AI_REPLIES_PER_24H_WINDOW = 25;

export function getBrazilMonthKey(nowDate: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit"
    }).formatToParts(nowDate);
    const y = parts.find(p => p.type === "year")?.value || String(nowDate.getUTCFullYear());
    const m = parts.find(p => p.type === "month")?.value || String(nowDate.getUTCMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  } catch {
    return nowDate.toISOString().slice(0, 7);
  }
}

function matchesAllowedNumber(incoming: string, allowed: string): boolean {
  if (!allowed || allowed === "*" || allowed === "all") return true;
  if (incoming === allowed) return true;
  const normIncoming = incoming.replace(/^55(\d{2})9?(\d{8})$/, "55$1$2");
  const normAllowed = allowed.replace(/^55(\d{2})9?(\d{8})$/, "55$1$2");
  return normIncoming === normAllowed;
}

function parseMinutes(hhmm: string | undefined, fallback: number): number {
  if (!hhmm || typeof hhmm !== "string" || !/^\d{1,2}:\d{2}$/.test(hhmm.trim())) return fallback;
  const [h, m] = hhmm.trim().split(":").map(n => parseInt(n, 10) || 0);
  return h * 60 + m;
}

function isMinuteInWindow(currentMinutes: number, startMinutes: number, endMinutes: number): boolean {
  if (endMinutes > startMinutes) {
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  } else if (endMinutes < startMinutes) {
    // Overnight schedule (e.g. 18:00 to 02:00)
    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  }
  return true;
}

export function isWithinOperatingHours(
  hours?: {
    enabled: boolean;
    timezone?: string;
    openTime?: string;
    closeTime?: string;
    days?: string[];
    schedule?: Record<string, DaySchedule & { intervals?: Array<{ start: string; end: string }> }>;
  },
  nowDate?: Date,
  allowIntervals = true
): boolean {
  if (!hours || !hours.enabled) return true;
  try {
    const now = nowDate ?? new Date();
    const tz = hours.timezone && hours.timezone.trim() ? hours.timezone.trim() : "America/Sao_Paulo";
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
    const parts = formatter.formatToParts(now);
    const dayStr = parts.find(p => p.type === "weekday")?.value?.toLowerCase() || "";
    const rawHour = parseInt(parts.find(p => p.type === "hour")?.value || "0", 10);
    const hour = rawHour === 24 ? 0 : rawHour;
    const minute = parseInt(parts.find(p => p.type === "minute")?.value || "0", 10);

    const dayMap: Record<string, string> = {
      sun: "dom", mon: "seg", tue: "ter", wed: "qua", thu: "qui", fri: "sex", sat: "sab"
    };
    const currentDay = dayMap[dayStr] || "seg";
    const currentMinutes = hour * 60 + minute;

    // 1. Check per-day schedule if configured
    if (hours.schedule && typeof hours.schedule === "object" && hours.schedule[currentDay]) {
      const dayConfig = hours.schedule[currentDay];
      if (!dayConfig.enabled) return false;

      const openMin = parseMinutes(dayConfig.openTime || hours.openTime, 0);
      const closeMin = parseMinutes(dayConfig.closeTime || hours.closeTime, 23 * 60 + 59);
      if (!isMinuteInWindow(currentMinutes, openMin, closeMin)) {
        return false;
      }

      // Check interval/break if configured AND allowed by plan (Business/Premium)
      if (allowIntervals) {
        if (dayConfig.hasBreak && dayConfig.breakStart && dayConfig.breakEnd) {
          const breakStartMin = parseMinutes(dayConfig.breakStart, -1);
          const breakEndMin = parseMinutes(dayConfig.breakEnd, -1);
          if (breakStartMin >= 0 && breakEndMin >= 0 && breakEndMin > breakStartMin) {
            if (currentMinutes >= breakStartMin && currentMinutes < breakEndMin) {
              return false;
            }
          }
        }
        if (Array.isArray(dayConfig.intervals) && dayConfig.intervals.length > 0) {
          for (const iv of dayConfig.intervals) {
            const ivStart = parseMinutes(iv.start, -1);
            const ivEnd = parseMinutes(iv.end, -1);
            if (ivStart >= 0 && ivEnd >= 0 && ivEnd > ivStart) {
              if (currentMinutes >= ivStart && currentMinutes < ivEnd) {
                return false;
              }
            }
          }
        }
      }

      return true;
    }

    // 2. Fallback to legacy global days + openTime/closeTime
    if (Array.isArray(hours.days)) {
      if (hours.days.length === 0 || !hours.days.includes(currentDay)) {
        return false;
      }
    }

    const openMinutes = parseMinutes(hours.openTime, 0);
    const closeMinutes = parseMinutes(hours.closeTime, 23 * 60 + 59);
    return isMinuteInWindow(currentMinutes, openMinutes, closeMinutes);
  } catch {
    return true;
  }
}

/**
 * Persist durable quota counter in Supabase crm_tenant_settings and crm_ai_usage_events
 * so monthly/trial usage survives Redis restarts.
 */
async function persistDurableQuotaUsage(
  tenantId: string,
  isTrial: boolean | undefined,
  monthKey: string,
  newCount: number,
  phone: string
): Promise<void> {
  const url = process.env.CRM_SUPABASE_URL?.trim().replace(/\/$/, "");
  const key = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key || !tenantId) return;

  try {
    const rGet = await fetch(`${url}/rest/v1/crm_tenant_settings?tenant_id=eq.${tenantId}&select=business_description&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: "no-store"
    });
    if (rGet.ok) {
      const rows = (await rGet.json()) as Array<{ business_description: string }>;
      let parsed: Record<string, any> = {};
      if (rows[0]?.business_description?.startsWith("{")) {
        try { parsed = JSON.parse(rows[0].business_description); } catch {}
      }
      if (!parsed.usageCounters || typeof parsed.usageCounters !== "object") {
        parsed.usageCounters = { trialUsed: 0, monthly: {} };
      }
      if (isTrial) {
        parsed.usageCounters.trialUsed = Math.max(Number(parsed.usageCounters.trialUsed || 0), newCount);
        if (parsed.plan && typeof parsed.plan === "object") {
          parsed.plan.trialQuotaUsed = parsed.usageCounters.trialUsed;
        }
      } else {
        if (!parsed.usageCounters.monthly || typeof parsed.usageCounters.monthly !== "object") {
          parsed.usageCounters.monthly = {};
        }
        parsed.usageCounters.monthly[monthKey] = Math.max(Number(parsed.usageCounters.monthly[monthKey] || 0), newCount);
      }
      parsed.usageCounters.lastUpdatedAt = new Date().toISOString();

      await fetch(`${url}/rest/v1/crm_tenant_settings?tenant_id=eq.${tenantId}`, {
        method: "PATCH",
        headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ business_description: JSON.stringify(parsed) })
      });
    }

    // Record metering event in crm_ai_usage_events (idempotent by request_key per 24h window)
    const dayBucket = new Date().toISOString().slice(0, 10);
    await fetch(`${url}/rest/v1/crm_ai_usage_events`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_id: tenantId,
        provider: "omniroute",
        model: "ai_attendance_window_24h",
        status: "success",
        prompt_tokens: 1,
        completion_tokens: 1,
        estimated_cost_usd: 0,
        request_key: `window:${tenantId}:${phone}:${dayBucket}:${newCount}`
      })
    }).catch(() => {});

    // If trial reached 100, invalidate effective plan cache immediately so suspension activates
    if (isTrial && newCount >= 100) {
      await invalidateEffectivePlanCache(tenantId);
    }
  } catch (err) {
    console.warn("[quota-durable-sync] Warning:", err);
  }
}

async function getStoreAiContext(instanceName: string): Promise<{
  context?: StoreAiContext;
  isBlocked?: boolean;
  blockedReason?: string;
  channelFound?: boolean;
  tenantId?: string;
  quotaLimit?: number;
  isTrial?: boolean;
  allowAdvancedHours?: boolean;
}> {
  try {
    if (instanceName === "crmtest") return {};
    const url = process.env.CRM_SUPABASE_URL?.trim().replace(/\/$/, "");
    const key = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!url || !key) return {};

    // 1. Resolve channel & tenant by instance_name
    const channel = await resolveChannelForInstance(instanceName).catch(() => null);
    const tenantId = channel?.tenant_id;
    if (!tenantId) return {};

    // Check if channel is paused (e.g. excess channel suspended on downgrade)
    if (channel?.status === "paused") {
      return { isBlocked: true, blockedReason: "channel_paused_by_plan", channelFound: true, tenantId };
    }

    // 2. Check tenant status (active vs suspended)
    const rTenant = await fetch(`${url}/rest/v1/crm_tenants?id=eq.${tenantId}&select=name,status`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: "no-store"
    });
    const tenants = (await rTenant.json()) as Array<{ name: string; status: string }>;
    if (tenants?.[0]?.status === "suspended") {
      return { isBlocked: true, blockedReason: "store_suspended_or_overdue", channelFound: true, tenantId };
    }

    // 3. Fetch agent instructions and preferred route
    const rAgent = await fetch(`${url}/rest/v1/crm_agents?tenant_id=eq.${tenantId}&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: "no-store"
    });
    const agents = (await rAgent.json()) as Array<{ label: string; instructions: string; enabled: boolean; provider_route: string }>;
    if (agents?.[0] && !agents[0].enabled) {
      return { isBlocked: true, blockedReason: "agent_disabled", channelFound: true, tenantId };
    }

    // 4. Fetch store knowledge articles (up to 20 published articles)
    const rArticles = await fetch(
      `${url}/rest/v1/crm_knowledge_articles?tenant_id=eq.${tenantId}&status=eq.published&order=updated_at.desc&limit=20`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        cache: "no-store"
      }
    );
    const articles = (await rArticles.json()) as Array<{ title: string; body: string }>;
    const storeInfo = Array.isArray(articles)
      ? articles.map(a => `### ${a.title}\n${a.body}`).join("\n\n")
      : "";

    // 5. Fetch effective plan & operating hours
    let operatingHours: StoreAiContext["operatingHours"] = undefined;
    let quotaLimit = 200;
    let primaryModel = agents?.[0]?.provider_route || undefined;
    let fallbackModel = undefined;

    const effectivePlan = await getEffectiveTenantPlan(tenantId);
    if (effectivePlan.isSuspended || (effectivePlan.autoBlock && effectivePlan.isOverdue)) {
      return { isBlocked: true, blockedReason: "store_suspended_or_overdue", channelFound: true, tenantId };
    }

    // Verify WhatsApp slot limit on incoming instance
    const slotNumber = extractSlotFromInstanceName(instanceName);
    if (slotNumber > effectivePlan.maxWhatsappConnections) {
      return { isBlocked: true, blockedReason: "channel_paused_by_plan", channelFound: true, tenantId };
    }

    quotaLimit = effectivePlan.quotaLimit;

    if (!effectivePlan.allowedFeatures.includes("ai_chat")) {
      return { isBlocked: true, blockedReason: "feature_locked", channelFound: true, tenantId };
    }

    const allowAdvancedHours = effectivePlan.allowedFeatures.includes("business_hours");
    const allowBasicHours = allowAdvancedHours || effectivePlan.allowedFeatures.includes("business_hours_basic");

    const rSettings = await fetch(`${url}/rest/v1/crm_tenant_settings?tenant_id=eq.${tenantId}&select=timezone,business_description&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: "no-store"
    });
    if (rSettings.ok) {
      const settings = (await rSettings.json()) as Array<{ timezone?: string; business_description: string }>;
      const dbTimezone = settings[0]?.timezone || "America/Sao_Paulo";
      const rawDesc = settings[0]?.business_description ?? "";
      if (rawDesc.startsWith("{")) {
        try {
          const parsed = JSON.parse(rawDesc);
          if (parsed.ai_settings?.operatingHours && allowBasicHours) {
            const rawHours = parsed.ai_settings.operatingHours;
            // If plan only has basic hours (Start), strip advanced intervals/breaks
            let cleanSchedule = rawHours.schedule;
            if (!allowAdvancedHours && cleanSchedule && typeof cleanSchedule === "object") {
              cleanSchedule = { ...cleanSchedule };
              for (const k of Object.keys(cleanSchedule)) {
                cleanSchedule[k] = {
                  ...cleanSchedule[k],
                  hasBreak: false,
                  breakStart: undefined,
                  breakEnd: undefined
                };
              }
            }
            operatingHours = {
              timezone: dbTimezone,
              ...rawHours,
              schedule: cleanSchedule
            };
          }
          if (parsed.ai_settings?.primaryModel) primaryModel = parsed.ai_settings.primaryModel;
          if (parsed.ai_settings?.fallbackModel && effectivePlan.allowedFeatures.includes("model_fallback")) {
            fallbackModel = parsed.ai_settings.fallbackModel;
          }
        } catch {}
      }
    }

    return {
      channelFound: true,
      tenantId,
      quotaLimit,
      isTrial: effectivePlan.isTrial,
      allowAdvancedHours,
      context: {
        storeName: tenants?.[0]?.name,
        agentLabel: agents?.[0]?.label || "Assistente Virtual",
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
  deps: {
    redis?: Redis;
    generate?: typeof generateAnswer;
    send?: typeof sendText;
    maySend?: (incoming: Incoming) => Promise<boolean>;
    getStoreContext?: (instanceName: string) => Promise<Awaited<ReturnType<typeof getStoreAiContext>>>;
    fetchConvContext?: typeof fetchConversationContext;
    handoff?: typeof handoffToHuman;
    nowDate?: Date;
  } = {},
): Promise<ProcessResult> {
  const incoming = parseIncoming(payload);
  if (!incoming) return { status: "ignored", reason: "unsupported_event" };

  // Check store context & permission
  const storeCtx = await (deps.getStoreContext ?? getStoreAiContext)(incoming.instance);
  const { context = {}, isBlocked, blockedReason, tenantId, quotaLimit, isTrial, allowAdvancedHours = true } = storeCtx;
  if (isBlocked) return { status: "disabled", reason: blockedReason || "store_suspended_or_overdue" };

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

    // 1. Anti-duplication check: if exact message was already processed (never consumes quota twice)
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

      const markItemsDone = async () => {
        for (const it of items) {
          if (it.id) {
            await redis.set(`crm:lab:done:${incoming.instance}:${it.id}`, "sent", "EX", 86_400);
          }
        }
      };

      const combinedText = items.map(it => it.text.trim()).filter(Boolean).join("\n") || incoming.text;

      // 6. Check for customer dissatisfaction, complaints, delays, refund demands or human handoff
      const escalation = detectCustomerEscalation(combinedText);
      const isUrgent = escalation.isEscalation && (escalation.sentiment === "urgent" || escalation.sentiment === "frustrated");

      // 7. Check if conversation is already in human mode or channel paused
      const convContext = await (deps.fetchConvContext ?? fetchConversationContext)(incoming.instance, incoming.number, 10);
      if (convContext.channelStatus === "paused") {
        return { status: "disabled", reason: "channel_paused_by_plan" };
      }

      if (convContext.mode === "human") {
        // Exclusively human attendance: NEVER consumes AI quota!
        if (isUrgent && convContext.conversationId) {
          try {
            await redis.set(
              `crm:escalation:${convContext.conversationId}`,
              JSON.stringify({
                category: escalation.category,
                reason: escalation.reason,
                sentiment: escalation.sentiment,
                priority: "urgent",
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

      // 8. If in AI mode and escalation/human request was detected BEFORE AI reply -> hand off to human without charging AI quota
      if (escalation.isEscalation) {
        const convId = await (deps.handoff ?? handoffToHuman)(
          incoming.instance,
          incoming.number,
          isUrgent,
          escalation.reason || "Solicitação de atendimento humano"
        );

        if (convId) {
          try {
            await redis.set(
              `crm:escalation:${convId}`,
              JSON.stringify({
                category: escalation.category,
                reason: escalation.reason || "Solicitação de Atendente Humano",
                sentiment: escalation.sentiment || "neutral",
                priority: isUrgent ? "urgent" : "high",
                text: combinedText.slice(0, 300),
                timestamp: new Date().toISOString()
              }),
              "EX",
              86400 * 7
            );
          } catch {}
        }

        const escalationReply = escalation.customerReply || "Claro! 😊 Vou solicitar atendimento da nossa equipe para continuar sua conversa.";
        await (deps.send ?? sendText)(incoming.number, escalationReply, cfg, incoming.instance);
        await markItemsDone();
        try {
          await persistOutboundInSupabase(incoming.instance, incoming.number, escalationReply);
        } catch {}

        return { status: "sent", reason: `escalated_${escalation.category || "human"}` };
      }

      // 9. Operating hours check (respecting basic vs advanced hours)
      const now = deps.nowDate ?? new Date();
      if (context.operatingHours && !isWithinOperatingHours(context.operatingHours, now, allowAdvancedHours)) {
        const sendAbsence = context.operatingHours.sendClosedMessage !== false;
        const closedMsg = (context.operatingHours.closedMessage ?? "").trim();
        if (sendAbsence && closedMsg) {
          const closedNoticeKey = `crm:closed_notice:${incoming.instance}:${incoming.number}`;
          const shouldSendNotice = await redis.set(closedNoticeKey, "1", "EX", 21600, "NX"); // 6h cooldown
          if (shouldSendNotice === "OK") {
            await (deps.send ?? sendText)(incoming.number, closedMsg, cfg, incoming.instance);
            try {
              await persistOutboundInSupabase(incoming.instance, incoming.number, closedMsg);
            } catch {}
          }
        }
        return { status: "disabled", reason: "outside_operating_hours" };
      }

      // 10. Pre-check Quota & 24h Session Window BEFORE generating AI response
      const sessionKey = tenantId ? `crm:session:${tenantId}:${incoming.number}` : "";
      const sessionMsgsKey = tenantId ? `crm:session_msgs:${tenantId}:${incoming.number}` : "";
      const monthKey = getBrazilMonthKey(now);
      const quotaKey = tenantId
        ? (isTrial ? `crm:quota:trial:${tenantId}` : `crm:quota:${tenantId}:${monthKey}`)
        : "";
      const maxLimit = quotaLimit || (isTrial ? 100 : 200);

      if (tenantId) {
        const hasActiveWindow = Boolean(await redis.exists(sessionKey));
        const currentUsageRaw = await redis.get(quotaKey);
        const currentUsage = parseInt(currentUsageRaw || "0", 10);

        if (!hasActiveWindow && currentUsage >= maxLimit) {
          console.warn(`[crm-quota-exceeded] Tenant ${tenantId} reached limit ${currentUsage}/${maxLimit}`);
          return { status: "disabled", reason: "quota_exceeded" };
        }

        if (hasActiveWindow) {
          const msgCountInWindow = parseInt((await redis.get(sessionMsgsKey)) || "0", 10);
          if (msgCountInWindow >= MAX_AI_REPLIES_PER_24H_WINDOW) {
            await (deps.handoff ?? handoffToHuman)(
              incoming.instance,
              incoming.number,
              false,
              "Limite de segurança de respostas automáticas na janela de 24h atingido"
            );
            return { status: "disabled", reason: "session_message_cap_handoff" };
          }
        }
      }

      // 11. Attach conversation history to context
      context.history = convContext.history;

      if (deps.maySend && !(await deps.maySend(incoming))) {
        return { status: "disabled", reason: "tenant_or_conversation_blocked" };
      }

      // 12. Generate answer with fallback support
      const answer = await (deps.generate ?? generateAnswer)(combinedText, cfg, context);

      if (deps.maySend && !(await deps.maySend(incoming))) {
        return { status: "disabled", reason: "tenant_or_conversation_blocked" };
      }

      // 13. Send response via Evolution API
      await (deps.send ?? sendText)(incoming.number, answer, cfg, incoming.instance);

      // 14. Commit 24h Window & Quota ONLY AFTER successful AI reply delivery!
      // If send() failed above, it threw before reaching here -> 0 quota charged on send failure!
      if (tenantId) {
        const isNewSession = await redis.set(sessionKey, "1", "EX", 86400, "NX");
        if (isNewSession === "OK") {
          const newCount = await redis.incr(quotaKey);
          await redis.expire(quotaKey, 86400 * 60);
          await redis.set(sessionMsgsKey, "1", "EX", 86400);
          await persistDurableQuotaUsage(tenantId, isTrial, monthKey, newCount, incoming.number);
        } else {
          const curMsgs = parseInt((await redis.get(sessionMsgsKey)) || "0", 10);
          await redis.set(sessionMsgsKey, String(curMsgs + 1), "EX", 86400);
        }
      }

      await markItemsDone();
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
