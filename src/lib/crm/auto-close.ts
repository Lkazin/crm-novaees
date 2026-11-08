import "server-only";
import { sendText, type EvolutionSendConfig } from "@/lib/agent/evolution";
import {
  DEFAULT_AUTOCLOSE_MESSAGE,
  DEFAULT_AUTOCLOSE_SURVEY_MESSAGE,
  type AutoCloseSettings
} from "./settings-types";

export { DEFAULT_AUTOCLOSE_MESSAGE, DEFAULT_AUTOCLOSE_SURVEY_MESSAGE };

export type AutoCloseItemResult = {
  conversationId: string;
  phone: string;
  lastMessageAt: string;
  messageSent: boolean;
  error?: string;
};

export type AutoCloseTenantResult = {
  tenantId: string;
  enabled: boolean;
  timeoutMinutes: number;
  closedCount: number;
  items: AutoCloseItemResult[];
  reason?: string;
};

export type AutoCloseDeps = {
  fetchTenantSettings?: (tenantId: string) => Promise<AutoCloseSettings | null>;
  fetchActiveChannels?: (tenantId: string) => Promise<Array<{ id: string; instance_name: string }>>;
  fetchExpiredConversations?: (tenantId: string, cutoffIso: string, includeWaitingClient: boolean) => Promise<
    Array<{ id: string; contact_id: string; channel_id: string; mode: string; status: string; last_message_at: string }>
  >;
  fetchContactPhone?: (contactId: string) => Promise<string | null>;
  sendWhatsappMessage?: (phone: string, text: string, instanceName: string) => Promise<{ ok: boolean; error?: string }>;
  saveOutboundMessage?: (tenantId: string, conversationId: string, text: string) => Promise<void>;
  updateConversationStatus?: (conversationId: string, status: string, mode: string) => Promise<void>;
  closeHandoffs?: (conversationId: string) => Promise<void>;
  checkSurveySent?: (conversationId: string) => Promise<boolean>;
  markSurveySent?: (conversationId: string) => Promise<void>;
  fetchAllActiveTenants?: () => Promise<Array<{ id: string; name: string }>>;
  now?: () => Date;
};

function getSupabaseConfig() {
  const url = (process.env.CRM_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const secret = (process.env.CRM_SUPABASE_SERVICE_ROLE_KEY || "").trim();
  return { url, secret };
}

function getEvolutionConfig() {
  const evolutionUrl = (process.env.EVOLUTION_API_URL || "http://127.0.0.1:8080").trim().replace(/\/+$/, "");
  const evolutionKey = (process.env.EVOLUTION_API_KEY || "").trim();
  return { evolutionUrl, evolutionKey };
}

/** Real Supabase Database helper */
async function supabaseFetch<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const { url, secret } = getSupabaseConfig();
  if (!url || !secret) throw new Error("supabase_not_configured");

  const res = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: secret,
      Authorization: `Bearer ${secret}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
      Prefer: "return=representation"
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(8000)
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`supabase_error_${res.status}: ${txt}`);
  }
  return res.json() as Promise<T>;
}

export const defaultAutoCloseDeps: AutoCloseDeps = {
  now: () => new Date(),

  fetchTenantSettings: async (tenantId: string) => {
    try {
      const rows = await supabaseFetch<Array<{ business_description?: string }>>(
        `crm_tenant_settings?tenant_id=eq.${tenantId}&select=business_description&limit=1`
      );
      if (!rows.length || !rows[0].business_description) return null;
      const parsed = JSON.parse(rows[0].business_description);
      const ac = parsed.autoCloseSettings;
      if (!ac || typeof ac !== "object") return null;
      return {
        enabled: Boolean(ac.enabled),
        timeoutMinutes: typeof ac.timeoutMinutes === "number" && ac.timeoutMinutes >= 5 ? Math.floor(ac.timeoutMinutes) : 30,
        message: typeof ac.message === "string" && ac.message.trim() ? ac.message : DEFAULT_AUTOCLOSE_MESSAGE,
        includeWaitingClient: ac.includeWaitingClient !== false,
        sendSurvey: Boolean(ac.sendSurvey),
        surveyMessage: typeof ac.surveyMessage === "string" && ac.surveyMessage.trim() ? ac.surveyMessage : DEFAULT_AUTOCLOSE_SURVEY_MESSAGE
      };
    } catch {
      return null;
    }
  },

  fetchActiveChannels: async (tenantId: string) => {
    try {
      return await supabaseFetch<Array<{ id: string; instance_name: string }>>(
        `crm_channels?tenant_id=eq.${tenantId}&status=eq.connected&select=id,instance_name`
      );
    } catch {
      return [];
    }
  },

  fetchExpiredConversations: async (tenantId: string, cutoffIso: string, includeWaitingClient: boolean) => {
    const modeFilter = includeWaitingClient ? "mode=in.(ai,human)" : "mode=eq.ai";
    return await supabaseFetch<
      Array<{ id: string; contact_id: string; channel_id: string; mode: string; status: string; last_message_at: string }>
    >(
      `crm_conversations?tenant_id=eq.${tenantId}&status=in.(open,pending)&${modeFilter}&last_message_at=lt.${encodeURIComponent(
        cutoffIso
      )}&select=id,contact_id,channel_id,mode,status,last_message_at&limit=50`
    );
  },

  fetchContactPhone: async (contactId: string) => {
    try {
      const rows = await supabaseFetch<Array<{ phone: string }>>(`crm_contacts?id=eq.${contactId}&select=phone&limit=1`);
      return rows[0]?.phone ?? null;
    } catch {
      return null;
    }
  },

  sendWhatsappMessage: async (phone: string, text: string, instanceName: string) => {
    try {
      const { evolutionUrl, evolutionKey } = getEvolutionConfig();
      if (!evolutionUrl || !evolutionKey) return { ok: false, error: "evolution_unconfigured" };
      const cfg: EvolutionSendConfig = { evolutionUrl, evolutionKey, instance: instanceName, sendFormat: "v2" };
      await sendText(phone, text, cfg, instanceName);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "send_failed" };
    }
  },

  saveOutboundMessage: async (tenantId: string, conversationId: string, text: string) => {
    try {
      await supabaseFetch("crm_messages", "POST", {
        tenant_id: tenantId,
        conversation_id: conversationId,
        direction: "outbound",
        sender_type: "agent",
        body: text,
        delivery_status: "sent"
      });
    } catch (e) {
      console.warn("[auto-close] Failed to insert farewell message record:", e);
    }
  },

  updateConversationStatus: async (conversationId: string, status: string, mode: string) => {
    const nowIso = new Date().toISOString();
    await supabaseFetch(`crm_conversations?id=eq.${conversationId}`, "PATCH", {
      status,
      mode,
      last_message_at: nowIso,
      updated_at: nowIso
    });
  },

  closeHandoffs: async (conversationId: string) => {
    try {
      await supabaseFetch(`crm_handoffs?conversation_id=eq.${conversationId}&status=in.(pending,accepted)`, "PATCH", {
        status: "closed",
        resolved_at: new Date().toISOString()
      });
    } catch {}
  },

  checkSurveySent: async (conversationId: string) => {
    try {
      const redisUrl = process.env.CRM_REDIS_URL;
      if (!redisUrl) return false;
      const { default: Redis } = await import("ioredis");
      const r = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 800 });
      await r.connect();
      const exists = await r.exists(`crm:survey_sent:${conversationId}`);
      r.disconnect();
      return exists === 1;
    } catch {
      return false;
    }
  },

  markSurveySent: async (conversationId: string) => {
    try {
      const redisUrl = process.env.CRM_REDIS_URL;
      if (!redisUrl) return;
      const { default: Redis } = await import("ioredis");
      const r = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 800 });
      await r.connect();
      await r.set(`crm:survey_sent:${conversationId}`, "1", "EX", 86400 * 3);
      r.disconnect();
    } catch {}
  },

  fetchAllActiveTenants: async () => {
    try {
      return await supabaseFetch<Array<{ id: string; name: string }>>("crm_tenants?status=eq.active&select=id,name");
    } catch {
      return [];
    }
  }
};

/**
 * Runs inactivity auto-close evaluation for a specific tenant.
 */
export async function runAutoCloseForTenant(
  tenantId: string,
  deps: AutoCloseDeps = defaultAutoCloseDeps
): Promise<AutoCloseTenantResult> {
  const getSettings = deps.fetchTenantSettings ?? defaultAutoCloseDeps.fetchTenantSettings!;
  const getChannels = deps.fetchActiveChannels ?? defaultAutoCloseDeps.fetchActiveChannels!;
  const getExpired = deps.fetchExpiredConversations ?? defaultAutoCloseDeps.fetchExpiredConversations!;
  const getPhone = deps.fetchContactPhone ?? defaultAutoCloseDeps.fetchContactPhone!;
  const sendWhatsapp = deps.sendWhatsappMessage ?? defaultAutoCloseDeps.sendWhatsappMessage!;
  const saveMsg = deps.saveOutboundMessage ?? defaultAutoCloseDeps.saveOutboundMessage!;
  const updateStatus = deps.updateConversationStatus ?? defaultAutoCloseDeps.updateConversationStatus!;
  const closeHandoffs = deps.closeHandoffs ?? defaultAutoCloseDeps.closeHandoffs!;
  const checkSurvey = deps.checkSurveySent ?? defaultAutoCloseDeps.checkSurveySent!;
  const markSurvey = deps.markSurveySent ?? defaultAutoCloseDeps.markSurveySent!;
  const getNow = deps.now ?? defaultAutoCloseDeps.now!;

  const settings = await getSettings(tenantId);
  if (!settings || !settings.enabled) {
    return {
      tenantId,
      enabled: false,
      timeoutMinutes: settings?.timeoutMinutes ?? 30,
      closedCount: 0,
      items: [],
      reason: "auto_close_disabled"
    };
  }

  const nowMs = getNow().getTime();
  const cutoffMs = nowMs - settings.timeoutMinutes * 60 * 1000;
  const cutoffIso = new Date(cutoffMs).toISOString();

  const [channels, expiredConversations] = await Promise.all([
    getChannels(tenantId),
    getExpired(tenantId, cutoffIso, settings.includeWaitingClient !== false)
  ]);

  if (!expiredConversations || expiredConversations.length === 0) {
    return {
      tenantId,
      enabled: true,
      timeoutMinutes: settings.timeoutMinutes,
      closedCount: 0,
      items: []
    };
  }

  const channelMap = new Map<string, string>();
  for (const ch of channels) {
    if (ch.instance_name) channelMap.set(ch.id, ch.instance_name);
  }
  const fallbackInstance = channels[0]?.instance_name || "";

  const items: AutoCloseItemResult[] = [];

  for (const conv of expiredConversations) {
    const phone = await getPhone(conv.contact_id);
    let messageSent = false;
    let sendError: string | undefined;

    const instance = channelMap.get(conv.channel_id) || fallbackInstance;

    if (phone && instance && settings.message) {
      const sendRes = await sendWhatsapp(phone, settings.message, instance);
      if (sendRes.ok) {
        messageSent = true;
        await saveMsg(tenantId, conv.id, settings.message);

        // Send CSAT survey only if enabled, avoiding duplicates
        if (settings.sendSurvey) {
          try {
            const alreadySent = await checkSurvey(conv.id);
            if (!alreadySent) {
              const surveyText = settings.surveyMessage || DEFAULT_AUTOCLOSE_SURVEY_MESSAGE;
              const surveyRes = await sendWhatsapp(phone, surveyText, instance);
              if (surveyRes.ok) {
                await saveMsg(tenantId, conv.id, surveyText);
                await markSurvey(conv.id);
              }
            }
          } catch {}
        }
      } else {
        sendError = sendRes.error;
      }
    }

    // Always update status to resolved / closed so the inactive ticket clears from the active queue
    try {
      await updateStatus(conv.id, "resolved", "paused");
      await closeHandoffs(conv.id);
      items.push({
        conversationId: conv.id,
        phone: phone || "unknown",
        lastMessageAt: conv.last_message_at,
        messageSent,
        error: sendError
      });
    } catch (e) {
      items.push({
        conversationId: conv.id,
        phone: phone || "unknown",
        lastMessageAt: conv.last_message_at,
        messageSent,
        error: e instanceof Error ? e.message : "update_failed"
      });
    }
  }

  return {
    tenantId,
    enabled: true,
    timeoutMinutes: settings.timeoutMinutes,
    closedCount: items.filter(it => it.error !== "update_failed").length,
    items
  };
}

/**
 * Runs inactivity auto-close evaluation across all active tenants.
 */
export async function runAutoCloseAllTenants(
  deps: AutoCloseDeps = defaultAutoCloseDeps
): Promise<{ processedTenants: number; totalClosed: number; results: AutoCloseTenantResult[] }> {
  const getTenants = deps.fetchAllActiveTenants ?? defaultAutoCloseDeps.fetchAllActiveTenants!;
  const tenants = await getTenants();
  const results: AutoCloseTenantResult[] = [];
  let totalClosed = 0;

  for (const t of tenants) {
    try {
      const res = await runAutoCloseForTenant(t.id, deps);
      results.push(res);
      totalClosed += res.closedCount;
    } catch (e) {
      results.push({
        tenantId: t.id,
        enabled: false,
        timeoutMinutes: 30,
        closedCount: 0,
        items: [],
        reason: e instanceof Error ? e.message : "tenant_auto_close_error"
      });
    }
  }

  return {
    processedTenants: tenants.length,
    totalClosed,
    results
  };
}
