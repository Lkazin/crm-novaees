import "server-only";
import Redis from "ioredis";

export type FeatureId =
  | "ai_chat"
  | "human_handoff"
  | "business_hours"
  | "commercial_tags"
  | "handoff_summary"
  | "sound_notifications"
  | "simulator"
  | "model_fallback"
  | "advanced_reports";

export type TechnicalFeature = {
  id: FeatureId;
  name: string;
  category: "ia" | "atendimento" | "gestao" | "seguranca";
  description: string;
  isCore?: boolean;
};

export type CrmPlan = {
  id: string; // Stable ID: 'crm-start', 'crm-business', 'crm-premium'
  name: string; // Commercial name: 'CRM Start'
  price: string; // "149,00"
  quotaLimit: number; // monthly conversations
  maxOperators: number; // 1, 3, 10
  maxWhatsappConnections: number; // 1, 1, 3
  description: string;
  features: FeatureId[]; // Technical feature IDs enabled
  featureBullets: string[]; // Commercial bullets for cards
  status: "active" | "inactive";
  isPopular?: boolean;
  version: number;
  updated_at: string;
};

export type PlanAuditEntry = {
  id: string;
  actor: string;
  planId: string;
  planName: string;
  action: "create" | "update" | "duplicate" | "toggle_status" | "apply_bulk";
  vigencia: "immediate" | "new_clients" | "next_cycle";
  previousValues?: Partial<CrmPlan>;
  newValues?: Partial<CrmPlan>;
  affectedTenantsCount: number;
  affectedTenants: string[];
  timestamp: string;
};

export type EffectiveTenantPlan = {
  tenantId: string;
  planId: string;
  planName: string;
  price: string;
  quotaLimit: number;
  maxOperators: number;
  maxWhatsappConnections: number;
  allowedFeatures: FeatureId[];
  dueDate: string;
  status: "paid" | "pending";
  autoBlock: boolean;
  isOverdue: boolean;
  isSuspended: boolean;
  suspensionReason?: string;
  hasCustomOverride: boolean;
  customOverride?: {
    quotaLimit?: number;
    features?: FeatureId[];
    reason?: string;
  };
};

export const TECHNICAL_FEATURES: TechnicalFeature[] = [
  {
    id: "ai_chat",
    name: "Atendimento com IA 24h",
    category: "ia",
    description: "Respostas automáticas inteligentes no WhatsApp com o cardápio e regras da loja.",
    isCore: true
  },
  {
    id: "human_handoff",
    name: "Central ao Vivo & Envio Real Humano",
    category: "atendimento",
    description: "Atendente pode assumir e devolver conversas, e digitar mensagens reais pelo WhatsApp.",
    isCore: true
  },
  {
    id: "simulator",
    name: "Simulador de Testes (Chat de Teste)",
    category: "ia",
    description: "Simulador em tempo real para o lojista testar como a IA responde antes de ir para o ar."
  },
  {
    id: "business_hours",
    name: "Horários de Atendimento & Folgas",
    category: "atendimento",
    description: "Controle de dias e horários de funcionamento com mensagem automática de loja fechada."
  },
  {
    id: "commercial_tags",
    name: "Etiquetas Comerciais (CRM de Vendas)",
    category: "gestao",
    description: "Classificação comercial de leads (Interessado, Orçamento enviado, Venda confirmada, Perdido)."
  },
  {
    id: "handoff_summary",
    name: "Resumo Inteligente em 3 Linhas",
    category: "atendimento",
    description: "Geração de resumo estruturado (Cliente, Solicitação, Pendente) ao transferir para humano."
  },
  {
    id: "sound_notifications",
    name: "Notificações com Alerta Sonoro",
    category: "atendimento",
    description: "Alerta sonoro (bip) quando um cliente solicitar atendimento humano ou fizer reclamação."
  },
  {
    id: "model_fallback",
    name: "Modelo Reserva / Alta Disponibilidade",
    category: "seguranca",
    description: "Fallback automático entre modelos de IA para garantir zero quedas."
  },
  {
    id: "advanced_reports",
    name: "Relatórios & Métricas Avançadas",
    category: "gestao",
    description: "Métricas detalhadas de conversão, tempo de resposta e volume diário de conversas."
  }
];

export const DEFAULT_PLANS: CrmPlan[] = [
  {
    id: "crm-start",
    name: "CRM Start",
    price: "149,00",
    quotaLimit: 500,
    maxOperators: 1,
    maxWhatsappConnections: 1,
    description: "Ideal para pequenos comércios locais, lanchonetes e prestadores de serviço.",
    features: ["ai_chat", "human_handoff", "simulator"],
    featureBullets: [
      "Até 500 atendimentos/mês",
      "NovaesWeb IA ativa 24h",
      "Conexão WhatsApp (1 número)",
      "Cardápio e Regras do Negócio",
      "Central de Atendimento ao Vivo",
      "Envio Real de Mensagens Humanas",
      "Simulador de Testes no Painel"
    ],
    status: "active",
    version: 1,
    updated_at: new Date().toISOString()
  },
  {
    id: "crm-business",
    name: "CRM Business",
    price: "249,00",
    quotaLimit: 2000,
    maxOperators: 3,
    maxWhatsappConnections: 1,
    isPopular: true,
    description: "Para empresas e lojas em crescimento com alto volume de clientes diários.",
    features: [
      "ai_chat",
      "human_handoff",
      "simulator",
      "business_hours",
      "commercial_tags",
      "handoff_summary",
      "sound_notifications",
      "model_fallback"
    ],
    featureBullets: [
      "Até 2.000 atendimentos/mês",
      "Tudo do Plano Start",
      "Controle de Horários de Funcionamento",
      "Funil e Etiquetas Comerciais",
      "Resumo Inteligente em 3 Linhas",
      "Notificações Sonoras no Painel",
      "Fallback Automático (Zero Quedas)",
      "Até 3 atendentes simultâneos"
    ],
    status: "active",
    version: 1,
    updated_at: new Date().toISOString()
  },
  {
    id: "crm-premium",
    name: "CRM Premium",
    price: "449,00",
    quotaLimit: 5000,
    maxOperators: 10,
    maxWhatsappConnections: 3,
    description: "Para operações de grande porte, clínicas, imobiliárias e redes de lojas.",
    features: [
      "ai_chat",
      "human_handoff",
      "simulator",
      "business_hours",
      "commercial_tags",
      "handoff_summary",
      "sound_notifications",
      "model_fallback",
      "advanced_reports"
    ],
    featureBullets: [
      "Até 5.000 atendimentos/mês",
      "Tudo do Plano Business",
      "Múltiplos números WhatsApp (até 3)",
      "Até 10 operadores simultâneos",
      "Relatórios e Métricas Avançadas",
      "Prioridade Máxima no Processamento",
      "Suporte VIP NovaesWeb"
    ],
    status: "active",
    version: 1,
    updated_at: new Date().toISOString()
  }
];

export function getRedis(providedRedis?: Redis): Redis {
  if (providedRedis) return providedRedis;
  const redisUrl = process.env.CRM_REDIS_URL || "redis://127.0.0.1:6379";
  return new Redis(redisUrl, { lazyConnect: true, connectTimeout: 2000, maxRetriesPerRequest: 1 });
}

function getSupabaseConfig() {
  const url = process.env.CRM_SUPABASE_URL?.trim().replace(/\/$/, "") ?? "";
  const serviceKey = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  return { url, serviceKey };
}

/**
 * Retrieve master plans catalog from Redis / Supabase with fallback to DEFAULT_PLANS
 */
export async function getMasterPlans(providedRedis?: Redis): Promise<CrmPlan[]> {
  const redis = getRedis(providedRedis);
  let ownsConnection = false;
  try {
    if (redis.status !== "ready" && redis.status !== "connecting") {
      await redis.connect();
      ownsConnection = true;
    }
    const raw = await redis.get("crm:master:plans");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed as CrmPlan[];
      }
    }
  } catch (err) {
    console.warn("[plans] Failed to read plans from Redis, falling back to defaults", err);
  } finally {
    if (ownsConnection && !providedRedis) redis.disconnect();
  }

  return DEFAULT_PLANS;
}

/**
 * Save master plan (draft or applied)
 */
export async function saveMasterPlan(
  planInput: Partial<CrmPlan> & { id: string; name: string },
  mode: "draft" | "apply",
  vigencia: "immediate" | "new_clients" | "next_cycle" = "immediate",
  actor = "master_admin",
  providedRedis?: Redis
): Promise<{ saved: boolean; applied: boolean; affectedTenants: string[]; plan: CrmPlan }> {
  const currentPlans = await getMasterPlans(providedRedis);
  const index = currentPlans.findIndex(p => p.id === planInput.id);

  const previousPlan = index >= 0 ? { ...currentPlans[index] } : undefined;
  const updatedPlan: CrmPlan = {
    id: planInput.id,
    name: planInput.name || previousPlan?.name || "Novo Plano",
    price: planInput.price || previousPlan?.price || "149,00",
    quotaLimit: typeof planInput.quotaLimit === "number" ? planInput.quotaLimit : (previousPlan?.quotaLimit || 500),
    maxOperators: typeof planInput.maxOperators === "number" ? planInput.maxOperators : (previousPlan?.maxOperators || 1),
    maxWhatsappConnections: typeof planInput.maxWhatsappConnections === "number" ? planInput.maxWhatsappConnections : (previousPlan?.maxWhatsappConnections || 1),
    description: planInput.description ?? (previousPlan?.description || ""),
    features: Array.isArray(planInput.features) ? planInput.features : (previousPlan?.features || ["ai_chat", "human_handoff"]),
    featureBullets: Array.isArray(planInput.featureBullets) ? planInput.featureBullets : (previousPlan?.featureBullets || []),
    status: planInput.status || previousPlan?.status || "active",
    isPopular: planInput.isPopular !== undefined ? planInput.isPopular : previousPlan?.isPopular,
    version: (previousPlan?.version || 0) + 1,
    updated_at: new Date().toISOString()
  };

  // Ensure core features are never removed
  if (!updatedPlan.features.includes("ai_chat")) updatedPlan.features.unshift("ai_chat");
  if (!updatedPlan.features.includes("human_handoff")) updatedPlan.features.push("human_handoff");

  let nextPlans: CrmPlan[];
  if (index >= 0) {
    nextPlans = [...currentPlans];
    nextPlans[index] = updatedPlan;
  } else {
    nextPlans = [...currentPlans, updatedPlan];
  }

  // 1. Save plans catalog to Redis
  const redis = getRedis(providedRedis);
  let ownsConnection = false;
  try {
    if (redis.status !== "ready" && redis.status !== "connecting") {
      await redis.connect();
      ownsConnection = true;
    }
    await redis.set("crm:master:plans", JSON.stringify(nextPlans));
  } finally {
    if (ownsConnection && !providedRedis) redis.disconnect();
  }

  const affectedTenants: string[] = [];

  // 2. If mode is "apply" with "immediate" vigência, dynamically synchronize all eligible stores
  if (mode === "apply") {
    const { url, serviceKey } = getSupabaseConfig();
    if (url && serviceKey) {
      try {
        const rSettings = await fetch(url + "/rest/v1/crm_tenant_settings?select=tenant_id,business_description", {
          headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
          cache: "no-store"
        });
        if (rSettings.ok) {
          const allSettings = (await rSettings.json()) as Array<{ tenant_id: string; business_description: string }>;
          for (const s of allSettings) {
            try {
              if (s.business_description?.startsWith("{")) {
                const parsed = JSON.parse(s.business_description);
                const tenantPlan = parsed.plan;
                const isMatchingPlan = tenantPlan?.planId === updatedPlan.id || tenantPlan?.name === updatedPlan.name;

                if (isMatchingPlan) {
                  // Check if tenant has a contractual exception override
                  const hasCustomQuota = tenantPlan?.customQuotaOverride !== undefined && tenantPlan?.customQuotaOverride !== null;
                  affectedTenants.push(s.tenant_id);

                  if (vigencia === "immediate") {
                    // Update the tenant's cached/stored quota if they don't have an explicit override
                    if (!hasCustomQuota) {
                      tenantPlan.quotaLimit = updatedPlan.quotaLimit;
                    }
                    tenantPlan.planId = updatedPlan.id;
                    tenantPlan.name = updatedPlan.name;
                    parsed.plan = tenantPlan;

                    // Update in Supabase
                    await fetch(url + `/rest/v1/crm_tenant_settings?tenant_id=eq.${s.tenant_id}`, {
                      method: "PATCH",
                      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
                      body: JSON.stringify({ business_description: JSON.stringify(parsed) })
                    });

                    // Sync crm_usage_limits in Supabase
                    const effectiveQuota = hasCustomQuota ? Number(tenantPlan.customQuotaOverride) : updatedPlan.quotaLimit;
                    await syncTenantUsageLimits(s.tenant_id, effectiveQuota, url, serviceKey);

                    // Clear Redis cache for this tenant
                    const rConn = getRedis(providedRedis);
                    try {
                      if (rConn.status !== "ready" && rConn.status !== "connecting") await rConn.connect();
                      await rConn.del(`crm:tenant:effective_plan:${s.tenant_id}`);
                      if (!providedRedis) rConn.disconnect();
                    } catch {}
                  }
                }
              }
            } catch {}
          }
        }
      } catch (err) {
        console.error("[plans] Error synchronizing stores during plan apply", err);
      }
    }
  }

  // 3. Record Audit History
  await recordPlanAudit({
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    actor,
    planId: updatedPlan.id,
    planName: updatedPlan.name,
    action: previousPlan ? (mode === "apply" ? "apply_bulk" : "update") : "create",
    vigencia,
    previousValues: previousPlan ? {
      price: previousPlan.price,
      quotaLimit: previousPlan.quotaLimit,
      features: previousPlan.features,
      status: previousPlan.status
    } : undefined,
    newValues: {
      price: updatedPlan.price,
      quotaLimit: updatedPlan.quotaLimit,
      features: updatedPlan.features,
      status: updatedPlan.status
    },
    affectedTenantsCount: affectedTenants.length,
    affectedTenants,
    timestamp: new Date().toISOString()
  }, providedRedis);

  return { saved: true, applied: mode === "apply", affectedTenants, plan: updatedPlan };
}

/**
 * Sync Supabase crm_usage_limits table for hard stop quota enforcement
 */
export async function syncTenantUsageLimits(tenantId: string, quotaLimit: number, url?: string, serviceKey?: string) {
  const config = url && serviceKey ? { url, serviceKey } : getSupabaseConfig();
  if (!config.url || !config.serviceKey) return;
  try {
    const rCheck = await fetch(config.url + `/rest/v1/crm_usage_limits?tenant_id=eq.${tenantId}&limit=1`, {
      headers: { apikey: config.serviceKey, Authorization: "Bearer " + config.serviceKey },
      cache: "no-store"
    });
    const existing = (await rCheck.json()) as Array<{ tenant_id: string }>;
    if (existing.length > 0) {
      await fetch(config.url + `/rest/v1/crm_usage_limits?tenant_id=eq.${tenantId}`, {
        method: "PATCH",
        headers: { apikey: config.serviceKey, Authorization: "Bearer " + config.serviceKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          monthly_model_requests: quotaLimit,
          hard_stop_on_limit: true,
          updated_at: new Date().toISOString()
        })
      });
    } else {
      await fetch(config.url + "/rest/v1/crm_usage_limits", {
        method: "POST",
        headers: { apikey: config.serviceKey, Authorization: "Bearer " + config.serviceKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: tenantId,
          monthly_model_requests: quotaLimit,
          hard_stop_on_limit: true,
          updated_at: new Date().toISOString()
        })
      });
    }
  } catch {}
}

/**
 * Retrieve effective plan, dynamic quota and allowed features for a tenant
 * Automatically inherits master plan changes unless the tenant has a contractual exception.
 */
export async function getEffectiveTenantPlan(tenantId: string, providedRedis?: Redis): Promise<EffectiveTenantPlan> {
  const redis = getRedis(providedRedis);
  let ownsConnection = false;

  // 1. Check Redis cache first
  try {
    if (redis.status !== "ready" && redis.status !== "connecting") {
      await redis.connect();
      ownsConnection = true;
    }
    const cached = await redis.get(`crm:tenant:effective_plan:${tenantId}`);
    if (cached) {
      return JSON.parse(cached) as EffectiveTenantPlan;
    }
  } catch {} finally {
    if (ownsConnection && !providedRedis) redis.disconnect();
  }

  // 2. Fetch master plans
  const masterPlans = await getMasterPlans(providedRedis);
  const { url, serviceKey } = getSupabaseConfig();

  let rawTenantPlan: Record<string, unknown> = {};
  let isSuspended = false;
  let suspensionReason = "";

  if (url && serviceKey) {
    try {
      const [rSettings, rTenant] = await Promise.all([
        fetch(url + `/rest/v1/crm_tenant_settings?tenant_id=eq.${tenantId}&limit=1`, {
          headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
          cache: "no-store"
        }),
        fetch(url + `/rest/v1/crm_tenants?id=eq.${tenantId}&select=status&limit=1`, {
          headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
          cache: "no-store"
        })
      ]);

      if (rSettings.ok) {
        const settings = (await rSettings.json()) as Array<{ business_description: string }>;
        const rawDesc = settings[0]?.business_description ?? "";
        if (rawDesc.startsWith("{")) {
          const parsed = JSON.parse(rawDesc);
          if (parsed.plan) rawTenantPlan = parsed.plan;
        }
      }

      if (rTenant.ok) {
        const tenants = (await rTenant.json()) as Array<{ status: string }>;
        if (tenants[0]?.status === "suspended") {
          isSuspended = true;
          suspensionReason = "admin_suspended";
        }
      }
    } catch {}
  }

  // 3. Resolve matching master plan
  const planId = (typeof rawTenantPlan.planId === "string" ? rawTenantPlan.planId : "") ||
                 (typeof rawTenantPlan.id === "string" ? rawTenantPlan.id : "");
  const planName = (typeof rawTenantPlan.name === "string" ? rawTenantPlan.name : "");

  let matchedPlan = masterPlans.find(p => p.id === planId);
  if (!matchedPlan && planName) {
    matchedPlan = masterPlans.find(p => p.name.toLowerCase() === planName.toLowerCase());
  }
  if (!matchedPlan) {
    matchedPlan = masterPlans[0] || DEFAULT_PLANS[0];
  }

  // 4. Check for contractual exception overrides
  const customQuotaRaw = rawTenantPlan.customQuotaOverride;
  const hasCustomQuota = customQuotaRaw !== undefined && customQuotaRaw !== null && !Number.isNaN(Number(customQuotaRaw));
  const finalQuota = hasCustomQuota ? Number(customQuotaRaw) : matchedPlan.quotaLimit;

  const customFeaturesRaw = rawTenantPlan.customFeaturesOverride;
  const hasCustomFeatures = Array.isArray(customFeaturesRaw) && customFeaturesRaw.length > 0;
  const finalFeatures: FeatureId[] = hasCustomFeatures
    ? Array.from(new Set([...matchedPlan.features, ...(customFeaturesRaw as FeatureId[])]))
    : [...matchedPlan.features];

  // 5. Check due date and payment status
  const dueDate = typeof rawTenantPlan.dueDate === "string" ? rawTenantPlan.dueDate : new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const paymentStatus = rawTenantPlan.status === "pending" ? "pending" : "paid";
  const autoBlock = rawTenantPlan.autoBlock !== false;
  const isOverdue = autoBlock && paymentStatus !== "paid" && new Date(dueDate) < new Date();

  if (isOverdue) {
    isSuspended = true;
    if (!suspensionReason) suspensionReason = "payment_overdue";
  }

  const effective: EffectiveTenantPlan = {
    tenantId,
    planId: matchedPlan.id,
    planName: matchedPlan.name,
    price: (typeof rawTenantPlan.price === "string" && rawTenantPlan.price) ? rawTenantPlan.price : matchedPlan.price,
    quotaLimit: finalQuota,
    maxOperators: matchedPlan.maxOperators || 1,
    maxWhatsappConnections: matchedPlan.maxWhatsappConnections || 1,
    allowedFeatures: finalFeatures,
    dueDate,
    status: paymentStatus,
    autoBlock,
    isOverdue,
    isSuspended,
    suspensionReason,
    hasCustomOverride: hasCustomQuota || hasCustomFeatures,
    customOverride: (hasCustomQuota || hasCustomFeatures) ? {
      quotaLimit: hasCustomQuota ? Number(customQuotaRaw) : undefined,
      features: hasCustomFeatures ? (customFeaturesRaw as FeatureId[]) : undefined,
      reason: typeof rawTenantPlan.exceptionReason === "string" ? rawTenantPlan.exceptionReason : undefined
    } : undefined
  };

  // 6. Cache effective plan in Redis for 60s
  try {
    const rCache = getRedis(providedRedis);
    let owns = false;
    if (rCache.status !== "ready" && rCache.status !== "connecting") {
      await rCache.connect();
      owns = true;
    }
    await rCache.set(`crm:tenant:effective_plan:${tenantId}`, JSON.stringify(effective), "EX", 60);
    if (owns && !providedRedis) rCache.disconnect();
  } catch {}

  return effective;
}

/**
 * Record an audit log entry for plan modifications
 */
export async function recordPlanAudit(entry: PlanAuditEntry, providedRedis?: Redis): Promise<void> {
  const redis = getRedis(providedRedis);
  let ownsConnection = false;
  try {
    if (redis.status !== "ready" && redis.status !== "connecting") {
      await redis.connect();
      ownsConnection = true;
    }
    await redis.lpush("crm:master:plan_history", JSON.stringify(entry));
    await redis.ltrim("crm:master:plan_history", 0, 99); // Keep latest 100 audit entries
  } catch (err) {
    console.warn("[plans] Failed to record plan audit in Redis", err);
  } finally {
    if (ownsConnection && !providedRedis) redis.disconnect();
  }

  // Also log into Supabase crm_audit_events
  const { url, serviceKey } = getSupabaseConfig();
  if (url && serviceKey) {
    try {
      await fetch(url + "/rest/v1/crm_audit_events", {
        method: "POST",
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: `plan_${entry.action}`,
          entity_type: "crm_plan",
          entity_id: entry.planId
        })
      });
    } catch {}
  }
}

/**
 * Get audit history of all plan modifications
 */
export async function getPlanAuditHistory(providedRedis?: Redis): Promise<PlanAuditEntry[]> {
  const redis = getRedis(providedRedis);
  let ownsConnection = false;
  try {
    if (redis.status !== "ready" && redis.status !== "connecting") {
      await redis.connect();
      ownsConnection = true;
    }
    const rawList = await redis.lrange("crm:master:plan_history", 0, 49);
    return rawList.map(r => JSON.parse(r) as PlanAuditEntry);
  } catch {
    return [];
  } finally {
    if (ownsConnection && !providedRedis) redis.disconnect();
  }
}
