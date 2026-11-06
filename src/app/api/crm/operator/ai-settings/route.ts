import { NextRequest } from "next/server";
import Redis from "ioredis";
import { isAllowedOrigin, privateJson, supabaseRows, verifyOperator } from "@/lib/crm/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getServiceConfig() {
  const url = process.env.CRM_SUPABASE_URL?.trim().replace(/\/$/, "") ?? "";
  const serviceKey = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  const redisUrl = process.env.CRM_REDIS_URL || "redis://127.0.0.1:6379";
  return { url, serviceKey, redisUrl };
}

export type OperatingHours = {
  enabled: boolean;
  openTime: string;
  closeTime: string;
  days: string[]; // ["seg", "ter", "qua", "qui", "sex", "sab", "dom"]
  closedMessage: string;
};

const DEFAULT_OPERATING_HOURS: OperatingHours = {
  enabled: false,
  openTime: "18:00",
  closeTime: "23:30",
  days: ["ter", "qua", "qui", "sex", "sab", "dom"],
  closedMessage: "Olá! Nosso horário de atendimento é de terça a domingo, das 18h às 23h30. Deixe sua mensagem e responderemos assim que abrirmos! 😊"
};

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

    // 2. Fetch main knowledge article (Cardápio / Regras da loja)
    const rArticle = await fetch(
      url + `/rest/v1/crm_knowledge_articles?tenant_id=eq.${tenant}&order=updated_at.desc&limit=1`,
      {
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
        cache: "no-store"
      }
    );
    const articles = (await rArticle.json()) as Array<{ id: string; title: string; body: string; status: string }>;
    const storeInfo = articles[0]?.body ?? "";
    const storeInfoTitle = articles[0]?.title ?? "Informações da Loja e Cardápio";

    // 3. Fetch tenant settings for operating hours & plan
    let operatingHours: OperatingHours = { ...DEFAULT_OPERATING_HOURS };
    let plan = {
      name: "CRM Start",
      price: "149,00",
      dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      status: "paid",
      quotaLimit: 500,
      quotaUsed: 0
    };

    const rSettings = await fetch(url + `/rest/v1/crm_tenant_settings?tenant_id=eq.${tenant}&limit=1`, {
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
      cache: "no-store"
    });
    if (rSettings.ok) {
      const settings = (await rSettings.json()) as Array<{ business_description: string }>;
      const rawDesc = settings[0]?.business_description ?? "";
      if (rawDesc.startsWith("{")) {
        try {
          const parsed = JSON.parse(rawDesc);
          if (parsed.plan) {
            plan = { ...plan, ...parsed.plan };
          }
          if (parsed.ai_settings?.operatingHours) {
            operatingHours = { ...operatingHours, ...parsed.ai_settings.operatingHours };
          }
        } catch {}
      }
    }

    // 4. Read real quota used this month from Redis
    try {
      const monthKey = new Date().toISOString().slice(0, 7); // "YYYY-MM"
      const redis = new Redis(redisUrl, { lazyConnect: true, connectTimeout: 1500, maxRetriesPerRequest: 1 });
      await redis.connect();
      const usedRaw = await redis.get(`crm:quota:${tenant}:${monthKey}`);
      redis.disconnect();
      if (usedRaw) {
        plan.quotaUsed = parseInt(usedRaw, 10) || 0;
      }
    } catch {}

    return privateJson({
      agentId: agent.id,
      agentLabel: agent.label,
      instructions: agent.instructions,
      enabled: agent.enabled,
      storeInfo,
      storeInfoTitle,
      operatingHours,
      plan
    });
  } catch (e) {
    return privateJson({ error: e instanceof Error ? e.message : "ai_settings_unavailable" }, 503);
  }
}

// POST/PATCH: Store owner saves custom AI instructions, store knowledge, and operating hours
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
    const label = typeof body.agentLabel === "string" ? body.agentLabel.trim() : "Assistente Virtual";
    const instructions = typeof body.instructions === "string" ? body.instructions.trim() : "";
    const storeInfo = typeof body.storeInfo === "string" ? body.storeInfo.trim() : "";
    const enabled = body.enabled !== false;
    const incomingOperatingHours = body.operatingHours;

    // 1. Upsert or Update Agent
    const rCheckAgent = await fetch(url + `/rest/v1/crm_agents?tenant_id=eq.${tenantId}&limit=1`, {
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
      cache: "no-store"
    });
    const existingAgents = (await rCheckAgent.json()) as Array<{ id: string }>;

    if (existingAgents.length > 0) {
      await fetch(url + `/rest/v1/crm_agents?id=eq.${existingAgents[0].id}`, {
        method: "PATCH",
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
        body: JSON.stringify({ label, instructions, enabled })
      });
    } else {
      await fetch(url + "/rest/v1/crm_agents", {
        method: "POST",
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_id: tenantId, label, instructions, enabled, provider_route: "auto" })
      });
    }

    // 2. Upsert or Update main knowledge article if storeInfo is provided
    if (storeInfo.length > 0) {
      const rCheckArt = await fetch(
        url + `/rest/v1/crm_knowledge_articles?tenant_id=eq.${tenantId}&limit=1`,
        {
          headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
          cache: "no-store"
        }
      );
      const existingArticles = (await rCheckArt.json()) as Array<{ id: string }>;

      if (existingArticles.length > 0) {
        await fetch(url + `/rest/v1/crm_knowledge_articles?id=eq.${existingArticles[0].id}`, {
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

    // 3. Save operating hours in crm_tenant_settings
    if (incomingOperatingHours && typeof incomingOperatingHours === "object") {
      const rGet = await fetch(url + `/rest/v1/crm_tenant_settings?tenant_id=eq.${tenantId}&limit=1`, {
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
        cache: "no-store"
      });
      const current = (await rGet.json()) as Array<{ business_description: string }>;
      let dataObj: Record<string, unknown> = {};
      try {
        if (current[0]?.business_description?.startsWith("{")) {
          dataObj = JSON.parse(current[0].business_description);
        }
      } catch {}

      dataObj.ai_settings = {
        ...(dataObj.ai_settings as Record<string, unknown> || {}),
        operatingHours: incomingOperatingHours
      };

      await fetch(url + `/rest/v1/crm_tenant_settings?tenant_id=eq.${tenantId}`, {
        method: "PATCH",
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
        body: JSON.stringify({ business_description: JSON.stringify(dataObj) })
      });
    }

    return privateJson({
      saved: true,
      agentLabel: label,
      enabled,
      hasStoreInfo: storeInfo.length > 0
    });
  } catch (e) {
    return privateJson({ error: e instanceof Error ? e.message : "save_failed" }, 503);
  }
}
