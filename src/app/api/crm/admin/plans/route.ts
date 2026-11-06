import { NextRequest } from "next/server";
import Redis from "ioredis";
import { isAllowedOrigin, privateJson } from "@/lib/crm/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type CrmPlan = {
  id: string;
  name: string;
  price: string;
  quotaLimit: number; // monthly conversations
  description: string;
  features: string[];
  isPopular?: boolean;
};

const DEFAULT_PLANS: CrmPlan[] = [
  {
    id: "crm-start",
    name: "CRM Start",
    price: "149,00",
    quotaLimit: 500,
    description: "Ideal para pequenos comércios locais, lanchonetes e pizzarias.",
    features: [
      "Até 500 atendimentos/mês",
      "NovaesWeb IA ativa 24h",
      "Conexão WhatsApp (1 número)",
      "Base de Conhecimento e Cardápio",
      "Simulador de Teste no Painel",
      "Atendimento Humano (Handoff)"
    ]
  },
  {
    id: "crm-business",
    name: "CRM Business",
    price: "249,00",
    quotaLimit: 2000,
    isPopular: true,
    description: "Para empresas e lojas em crescimento com alto volume de clientes diários.",
    features: [
      "Até 2.000 atendimentos/mês",
      "NovaesWeb IA com modelo de alta velocidade",
      "Controle de Horários de Funcionamento",
      "Resumo Inteligente para Atendentes",
      "Fallback Automático (Zero Quedas)",
      "Suporte Prioritário NovaesWeb"
    ]
  },
  {
    id: "crm-premium",
    name: "CRM Premium",
    price: "449,00",
    quotaLimit: 5000,
    description: "Para operações de grande porte, clínicas, imobiliárias e redes de lojas.",
    features: [
      "Até 5.000 atendimentos/mês",
      "Multi-operadores ilimitados",
      "IA dedicada com máxima prioridade",
      "Regras personalizadas avançadas",
      "Relatórios de métricas e conversão",
      "Gerente de conta exclusivo"
    ]
  }
];

function getAdminConfig() {
  const url = process.env.CRM_SUPABASE_URL?.trim().replace(/\/$/, "") ?? "";
  const serviceKey = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  const redisUrl = process.env.CRM_REDIS_URL || "redis://127.0.0.1:6379";
  return { url, serviceKey, redisUrl };
}

async function checkMasterAccess(request: NextRequest): Promise<boolean> {
  const masterPassword = "NovaesWeb@2026Admin";
  const labToken = process.env.CRM_LAB_ADMIN_TOKEN?.trim() || "1d175f822fc53f2707af52d58ef814ddb6872e873d04b4ba73898e66b4451aaf";

  const authHeader = request.headers.get("x-admin-password") || request.headers.get("authorization") || "";
  const cleanHeader = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (cleanHeader === masterPassword || cleanHeader === labToken) return true;

  const cookie = request.cookies.get("crm_admin_token")?.value || "";
  if (cookie === masterPassword || cookie === labToken) return true;

  return false;
}

// GET: List all plans + client distribution count
export async function GET(request: NextRequest) {
  try {
    if (!(await checkMasterAccess(request))) {
      return privateJson({ error: "unauthorized" }, 401);
    }

    const { url, serviceKey, redisUrl } = getAdminConfig();
    let plans = [...DEFAULT_PLANS];

    // Read custom plans from Redis if present
    try {
      const redis = new Redis(redisUrl, { lazyConnect: true, connectTimeout: 2000, maxRetriesPerRequest: 1 });
      await redis.connect();
      const customPlansRaw = await redis.get("crm:master:plans");
      redis.disconnect();
      if (customPlansRaw) {
        const custom = JSON.parse(customPlansRaw);
        if (Array.isArray(custom) && custom.length > 0) {
          plans = custom;
        }
      }
    } catch {}

    // Calculate how many clients are in each plan
    const counts: Record<string, number> = {};
    for (const p of plans) counts[p.name] = 0;

    if (serviceKey && url) {
      try {
        const rSettings = await fetch(url + "/rest/v1/crm_tenant_settings?select=tenant_id,business_description", {
          headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
          cache: "no-store"
        });
        if (rSettings.ok) {
          const settings = (await rSettings.json()) as Array<{ tenant_id: string; business_description: string }>;
          for (const s of settings) {
            try {
              if (s.business_description?.startsWith("{")) {
                const parsed = JSON.parse(s.business_description);
                const pName = parsed?.plan?.name || "Plano IA Mensal";
                counts[pName] = (counts[pName] || 0) + 1;
              }
            } catch {}
          }
        }
      } catch {}
    }

    return privateJson({ plans, clientCounts: counts });
  } catch (e) {
    return privateJson({ error: e instanceof Error ? e.message : "plans_failed" }, 503);
  }
}

// POST: Save or update custom plans
export async function POST(request: NextRequest) {
  if (!isAllowedOrigin(request.headers.get("origin"), request.url)) return privateJson({ error: "origin_forbidden" }, 403);
  try {
    if (!(await checkMasterAccess(request))) {
      return privateJson({ error: "unauthorized" }, 401);
    }

    const body = await request.json();
    const plans = body.plans;
    if (!Array.isArray(plans) || plans.length === 0) {
      return privateJson({ error: "invalid_plans_array" }, 400);
    }

    const { redisUrl } = getAdminConfig();
    const redis = new Redis(redisUrl, { lazyConnect: true, connectTimeout: 2000, maxRetriesPerRequest: 1 });
    await redis.connect();
    await redis.set("crm:master:plans", JSON.stringify(plans));
    redis.disconnect();

    return privateJson({ saved: true, plans });
  } catch (e) {
    return privateJson({ error: e instanceof Error ? e.message : "save_plans_failed" }, 503);
  }
}

// PATCH: Assign a plan to a specific store tenant
export async function PATCH(request: NextRequest) {
  if (!isAllowedOrigin(request.headers.get("origin"), request.url)) return privateJson({ error: "origin_forbidden" }, 403);
  try {
    if (!(await checkMasterAccess(request))) {
      return privateJson({ error: "unauthorized" }, 401);
    }

    const body = await request.json();
    const tenantId = typeof body.tenantId === "string" ? body.tenantId : "";
    const planName = typeof body.planName === "string" ? body.planName : "";
    const planPrice = typeof body.planPrice === "string" ? body.planPrice : "";
    const quotaLimit = typeof body.quotaLimit === "number" ? body.quotaLimit : 500;

    if (!tenantId || !planName) return privateJson({ error: "missing_required_fields" }, 400);

    const { url, serviceKey } = getAdminConfig();
    const rGet = await fetch(url + `/rest/v1/crm_tenant_settings?tenant_id=eq.${tenantId}`, {
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
      cache: "no-store"
    });
    const current = (await rGet.json()) as Array<{ business_description: string }>;
    let dataObj: Record<string, unknown> = { plan: {} };
    try {
      if (current[0]?.business_description?.startsWith("{")) {
        dataObj = JSON.parse(current[0].business_description);
      }
    } catch {}

    const planObj = (dataObj.plan as Record<string, unknown>) ?? {};
    planObj.name = planName;
    if (planPrice) planObj.price = planPrice;
    planObj.quotaLimit = quotaLimit;

    dataObj.plan = planObj;

    await fetch(url + `/rest/v1/crm_tenant_settings?tenant_id=eq.${tenantId}`, {
      method: "PATCH",
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
      body: JSON.stringify({ business_description: JSON.stringify(dataObj) })
    });

    return privateJson({ updated: true, tenantId, plan: planObj });
  } catch (e) {
    return privateJson({ error: e instanceof Error ? e.message : "assign_plan_failed" }, 503);
  }
}

