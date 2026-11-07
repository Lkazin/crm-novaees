import { NextRequest } from "next/server";
import Redis from "ioredis";
import { isAllowedOrigin, privateJson, supabaseRows, verifyOperator } from "@/lib/crm/supabase-server";
import { getEffectiveTenantPlan } from "@/lib/crm/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALL_DAYS = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"] as const;

function getServiceConfig() {
  const url = process.env.CRM_SUPABASE_URL?.trim().replace(/\/$/, "") ?? "";
  const serviceKey = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  const redisUrl = process.env.CRM_REDIS_URL || "redis://127.0.0.1:6379";
  return { url, serviceKey, redisUrl };
}

export type DaySchedule = {
  enabled: boolean;
  openTime: string;
  closeTime: string;
  hasBreak?: boolean;
  breakStart?: string;
  breakEnd?: string;
};

export type OperatingHours = {
  enabled: boolean;
  timezone: string;
  openTime: string;
  closeTime: string;
  days: string[];
  sendClosedMessage: boolean;
  closedMessage: string;
  schedule: Record<string, DaySchedule>;
};

const DEFAULT_DAYS = ["seg", "ter", "qua", "qui", "sex", "sab"];

function buildDefaultSchedule(openTime = "08:00", closeTime = "18:00", activeDays: string[] = DEFAULT_DAYS): Record<string, DaySchedule> {
  const schedule: Record<string, DaySchedule> = {};
  for (const d of ALL_DAYS) {
    schedule[d] = {
      enabled: activeDays.includes(d),
      openTime,
      closeTime,
      hasBreak: false,
      breakStart: "12:00",
      breakEnd: "13:00"
    };
  }
  return schedule;
}

function normalizeOperatingHours(raw?: Partial<OperatingHours> | null, fallbackTimezone = "America/Sao_Paulo"): OperatingHours {
  const openTime = typeof raw?.openTime === "string" && /^\d{2}:\d{2}$/.test(raw.openTime) ? raw.openTime : "08:00";
  const closeTime = typeof raw?.closeTime === "string" && /^\d{2}:\d{2}$/.test(raw.closeTime) ? raw.closeTime : "18:00";
  const rawDays = Array.isArray(raw?.days) ? raw!.days.filter(d => ALL_DAYS.includes(d as any)) : DEFAULT_DAYS;

  const schedule: Record<string, DaySchedule> = buildDefaultSchedule(openTime, closeTime, rawDays);
  if (raw?.schedule && typeof raw.schedule === "object") {
    for (const d of ALL_DAYS) {
      const item = raw.schedule[d];
      if (item && typeof item === "object") {
        schedule[d] = {
          enabled: Boolean(item.enabled),
          openTime: typeof item.openTime === "string" && /^\d{2}:\d{2}$/.test(item.openTime) ? item.openTime : openTime,
          closeTime: typeof item.closeTime === "string" && /^\d{2}:\d{2}$/.test(item.closeTime) ? item.closeTime : closeTime,
          hasBreak: Boolean(item.hasBreak),
          breakStart: typeof item.breakStart === "string" && /^\d{2}:\d{2}$/.test(item.breakStart) ? item.breakStart : "12:00",
          breakEnd: typeof item.breakEnd === "string" && /^\d{2}:\d{2}$/.test(item.breakEnd) ? item.breakEnd : "13:00"
        };
      }
    }
  }

  const syncedDays = ALL_DAYS.filter(d => schedule[d]?.enabled);

  return {
    enabled: Boolean(raw?.enabled),
    timezone: typeof raw?.timezone === "string" && raw.timezone.trim() ? raw.timezone.trim() : fallbackTimezone,
    openTime,
    closeTime,
    days: syncedDays,
    sendClosedMessage: raw?.sendClosedMessage !== false,
    closedMessage:
      typeof raw?.closedMessage === "string"
        ? raw.closedMessage
        : "Olá! No momento estamos fora do nosso horário de atendimento. Deixe sua mensagem e responderemos assim que abrirmos! 😊",
    schedule
  };
}

// GET: Retrieve the client store's AI settings, knowledge, operating hours, and quota
export async function GET(request: NextRequest) {
  const tenant = request.nextUrl.searchParams.get("tenant") ?? "";
  if (!UUID.test(tenant)) return privateJson({ error: "invalid_tenant" }, 400);

  try {
    const operator = await verifyOperator();
    if (!operator) return privateJson({ error: "unauthorized" }, 401);

    const members = await supabaseRows<Array<{ tenant_id: string }>>(
      "crm_tenant_memberships?select=tenant_id&tenant_id=eq." + tenant + "&user_id=eq." + operator.id + "&limit=1",
      operator.token
    );
    if (!members.length) return privateJson({ error: "tenant_forbidden" }, 403);

    const { url, serviceKey, redisUrl } = getServiceConfig();

    // 1. Fetch agent
    const rAgent = await fetch(url + `/rest/v1/crm_agents?tenant_id=eq.${tenant}&limit=1`, {
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
      cache: "no-store"
    });
    const agents = (await rAgent.json()) as Array<{ id: string; label: string; instructions: string; enabled: boolean }>;
    const agent = agents[0] ?? {
      id: "",
      label: "Assistente Virtual",
      instructions: "Responda os clientes de forma educada, informando nossos produtos e horários.",
      enabled: true
    };

    // 2. Fetch knowledge articles (prefer main "Informações da Loja e Cardápio")
    const rArticle = await fetch(
      url + `/rest/v1/crm_knowledge_articles?tenant_id=eq.${tenant}&order=updated_at.desc&limit=20`,
      {
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
        cache: "no-store"
      }
    );
    const articles = (await rArticle.json()) as Array<{ id: string; title: string; body: string; status: string }>;
    const mainArticle =
      (Array.isArray(articles) && articles.find(a => a.title === "Informações da Loja e Cardápio")) ||
      (Array.isArray(articles) && articles.find(a => a.status === "published")) ||
      articles?.[0];
    const storeInfo = mainArticle?.body ?? "";
    const storeInfoTitle = mainArticle?.title ?? "Informações da Loja e Cardápio";

    // 3. Fetch effective plan & operating hours
    const effectivePlan = await getEffectiveTenantPlan(tenant);
    let rawOperatingHours: Partial<OperatingHours> | undefined;
    let dbTimezone = "America/Sao_Paulo";

    const rSettings = await fetch(url + `/rest/v1/crm_tenant_settings?tenant_id=eq.${tenant}&select=timezone,business_description&limit=1`, {
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
      cache: "no-store"
    });
    if (rSettings.ok) {
      const settings = (await rSettings.json()) as Array<{ timezone?: string; business_description: string }>;
      if (settings[0]?.timezone) dbTimezone = settings[0].timezone;
      const rawDesc = settings[0]?.business_description ?? "";
      if (rawDesc.startsWith("{")) {
        try {
          const parsed = JSON.parse(rawDesc);
          if (parsed.ai_settings?.operatingHours) {
            rawOperatingHours = parsed.ai_settings.operatingHours;
          }
        } catch {}
      }
    }

    const operatingHours = normalizeOperatingHours(rawOperatingHours, dbTimezone);

    // 4. Read real quota used this month from Redis
    let quotaUsed = 0;
    try {
      const monthKey = new Date().toISOString().slice(0, 7); // "YYYY-MM"
      const redis = new Redis(redisUrl, { lazyConnect: true, connectTimeout: 1500, maxRetriesPerRequest: 1 });
      await redis.connect();
      const quotaKey = effectivePlan.isTrial ? `crm:quota:trial:${tenant}` : `crm:quota:${tenant}:${monthKey}`;
      const usedRaw = await redis.get(quotaKey);
      redis.disconnect();
      if (usedRaw) {
        quotaUsed = parseInt(usedRaw, 10) || 0;
      }
    } catch {}

    const planData = {
      ...effectivePlan,
      quotaUsed
    };

    return privateJson({
      agentId: agent.id,
      agentLabel: agent.label || "Assistente Virtual",
      instructions: agent.instructions,
      enabled: agent.enabled,
      storeInfo,
      storeInfoTitle,
      operatingHours,
      plan: planData,
      allowedFeatures: effectivePlan.allowedFeatures
    });
  } catch (e) {
    return privateJson({ error: e instanceof Error ? e.message : "ai_settings_unavailable" }, 503);
  }
}

// POST: Store owner saves custom AI instructions, store knowledge, and/or operating hours
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin, request.url)) return privateJson({ error: "origin_forbidden" }, 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return privateJson({ error: "json_required" }, 415);

  try {
    const operator = await verifyOperator();
    if (!operator) return privateJson({ error: "unauthorized" }, 401);

    const body = await request.json();
    const tenantId = typeof body.tenantId === "string" ? body.tenantId : "";
    if (!UUID.test(tenantId)) return privateJson({ error: "invalid_tenant" }, 400);

    const members = await supabaseRows<Array<{ tenant_id: string }>>(
      "crm_tenant_memberships?select=tenant_id&tenant_id=eq." + tenantId + "&user_id=eq." + operator.id + "&limit=1",
      operator.token
    );
    if (!members.length) return privateJson({ error: "tenant_forbidden" }, 403);

    const { url, serviceKey } = getServiceConfig();
    const hasAgentFields = body.agentLabel !== undefined || body.instructions !== undefined || body.enabled !== undefined;
    const incomingOperatingHours = body.operatingHours;

    let savedLabel = "Assistente Virtual";
    let savedEnabled = true;

    // 1. Upsert or Update Agent ONLY when agent fields were submitted
    if (hasAgentFields) {
      const rawLabel = typeof body.agentLabel === "string" ? body.agentLabel.trim() : "";
      const label = rawLabel.length >= 2 ? rawLabel.slice(0, 100) : "Assistente Virtual";
      const instructions = typeof body.instructions === "string" ? body.instructions.trim() : "";
      const enabled = body.enabled !== false;
      savedLabel = label;
      savedEnabled = enabled;

      const rCheckAgent = await fetch(url + `/rest/v1/crm_agents?tenant_id=eq.${tenantId}&limit=1`, {
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
        cache: "no-store"
      });
      const existingAgents = (await rCheckAgent.json()) as Array<{ id: string }>;

      if (existingAgents.length > 0) {
        const rPatch = await fetch(url + `/rest/v1/crm_agents?id=eq.${existingAgents[0].id}`, {
          method: "PATCH",
          headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
          body: JSON.stringify({ label, instructions, enabled })
        });
        if (!rPatch.ok) {
          const errText = await rPatch.text();
          throw new Error(`Falha ao atualizar agente: ${errText}`);
        }
      } else {
        const rPost = await fetch(url + "/rest/v1/crm_agents", {
          method: "POST",
          headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
          body: JSON.stringify({ tenant_id: tenantId, label, instructions, enabled, provider_route: "auto" })
        });
        if (!rPost.ok) {
          const errText = await rPost.text();
          throw new Error(`Falha ao criar agente: ${errText}`);
        }
      }
    }

    // 2. Upsert or Update main knowledge article ("Informações da Loja e Cardápio") if storeInfo is provided
    const storeInfo = typeof body.storeInfo === "string" ? body.storeInfo.trim() : "";
    if (storeInfo.length > 0) {
      const rCheckArt = await fetch(
        url + `/rest/v1/crm_knowledge_articles?tenant_id=eq.${tenantId}&order=updated_at.desc&limit=20`,
        {
          headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
          cache: "no-store"
        }
      );
      const existingArticles = (await rCheckArt.json()) as Array<{ id: string; title: string }>;
      const targetArticle =
        (Array.isArray(existingArticles) && existingArticles.find(a => a.title === "Informações da Loja e Cardápio")) ||
        (Array.isArray(existingArticles) && existingArticles.length === 1 ? existingArticles[0] : undefined);

      if (targetArticle) {
        await fetch(url + `/rest/v1/crm_knowledge_articles?id=eq.${targetArticle.id}`, {
          method: "PATCH",
          headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "Informações da Loja e Cardápio",
            body: storeInfo,
            status: "published",
            updated_at: new Date().toISOString()
          })
        });
      } else {
        await fetch(url + "/rest/v1/crm_knowledge_articles", {
          method: "POST",
          headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            tenant_id: tenantId,
            title: "Informações da Loja e Cardápio",
            body: storeInfo,
            status: "published",
            created_by: operator.id
          })
        });
      }
    }

    // 3. Save operating hours in crm_tenant_settings (UPSERT: PATCH if exists, POST if missing)
    let savedOperatingHours: OperatingHours | undefined;
    if (incomingOperatingHours && typeof incomingOperatingHours === "object") {
      const normalizedHours = normalizeOperatingHours(incomingOperatingHours);
      savedOperatingHours = normalizedHours;

      const rGet = await fetch(url + `/rest/v1/crm_tenant_settings?tenant_id=eq.${tenantId}&select=tenant_id,business_description&limit=1`, {
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
        cache: "no-store"
      });
      const current = rGet.ok ? ((await rGet.json()) as Array<{ tenant_id: string; business_description: string }>) : [];
      let dataObj: Record<string, unknown> = {};
      try {
        if (current[0]?.business_description?.startsWith("{")) {
          dataObj = JSON.parse(current[0].business_description);
        } else if (current[0]?.business_description) {
          dataObj = { legacy_description: current[0].business_description };
        }
      } catch {}

      dataObj.ai_settings = {
        ...((dataObj.ai_settings as Record<string, unknown>) || {}),
        operatingHours: normalizedHours
      };

      const serialized = JSON.stringify(dataObj);

      if (current.length > 0) {
        const rPatchSettings = await fetch(url + `/rest/v1/crm_tenant_settings?tenant_id=eq.${tenantId}`, {
          method: "PATCH",
          headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            timezone: normalizedHours.timezone,
            business_description: serialized,
            updated_at: new Date().toISOString()
          })
        });
        if (!rPatchSettings.ok) {
          const errText = await rPatchSettings.text();
          throw new Error(`Falha ao salvar horários: ${errText}`);
        }
      } else {
        const rPostSettings = await fetch(url + "/rest/v1/crm_tenant_settings", {
          method: "POST",
          headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            tenant_id: tenantId,
            timezone: normalizedHours.timezone,
            business_description: serialized,
            human_handoff_enabled: true,
            ai_sending_enabled: false,
            campaigns_enabled: false,
            automation_execution_enabled: false,
            retention_days: 7
          })
        });
        if (!rPostSettings.ok) {
          const errText = await rPostSettings.text();
          throw new Error(`Falha ao criar configuração de horários: ${errText}`);
        }
      }
    }

    return privateJson({
      saved: true,
      agentLabel: savedLabel,
      enabled: savedEnabled,
      hasStoreInfo: storeInfo.length > 0,
      operatingHours: savedOperatingHours
    });
  } catch (e) {
    return privateJson({
      error: e instanceof Error ? e.message : "save_failed",
      message: e instanceof Error ? e.message : "Falha ao salvar configurações."
    }, 503);
  }
}
