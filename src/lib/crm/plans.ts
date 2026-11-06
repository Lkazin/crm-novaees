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
  quotaLimit: number; // monthly conversations (1 atendimento = 1 conversa ativa com IA ou transbordo no ciclo mensal)
  maxOperators: number; // 1, 3, 10
  maxWhatsappConnections: number; // 1, 1, 3 (Plano Premium suporta até 3 conexões)
  description: string;
  features: FeatureId[]; // Technical feature IDs enabled
  featureBullets: string[]; // Commercial bullets for cards
  status: "active" | "inactive";
  isPopular?: boolean;
  version: number;
  updated_at: string;
  isDraft?: boolean;
  hasDraft?: boolean;
  draftPlan?: CrmPlan;
};

export type PlanAuditEntry = {
  id: string;
  actor: string;
  planId: string;
  planName: string;
  action: "create" | "update" | "duplicate" | "toggle_status" | "apply_bulk" | "draft_save" | "draft_discard";
  vigencia: "immediate" | "new_clients" | "next_cycle";
  previousValues?: Partial<CrmPlan>;
  newValues?: Partial<CrmPlan>;
  affectedTenantsCount: number;
  affectedTenants: string[];
  failedTenantsCount?: number;
  failedTenants?: Array<{ tenantId: string; error: string }>;
  timestamp: string;
};

export type ContractedSnapshot = {
  quotaLimit: number;
  features: FeatureId[];
  price: string;
  version: number;
  contractedAt: string;
};

export type PendingPlanUpdate = {
  planId: string;
  quotaLimit: number;
  features: FeatureId[];
  price: string;
  effectiveAt: string; // ISO date string (YYYY-MM-DD)
  planVersion: number;
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
  contractedVersion?: number;
  isContractFrozen?: boolean;
  pendingUpdate?: PendingPlanUpdate;
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
    quotaLimit: 500, // 500 atendimentos mensais
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
    quotaLimit: 2000, // 2.000 atendimentos mensais
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
    quotaLimit: 5000, // 5.000 atendimentos mensais
    maxOperators: 10,
    maxWhatsappConnections: 3, // Até 3 números WhatsApp homologados
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
 * Retrieve master published plans catalog from Redis with fallback to DEFAULT_PLANS.
 * NEVER returns draft versions. Runtime and customer execution must use this exclusively.
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
 * Retrieve drafts map from Redis key crm:master:plans:drafts
 */
export async function getMasterPlanDrafts(providedRedis?: Redis): Promise<Record<string, CrmPlan>> {
  const redis = getRedis(providedRedis);
  let ownsConnection = false;
  const result: Record<string, CrmPlan> = {};
  try {
    if (redis.status !== "ready" && redis.status !== "connecting") {
      await redis.connect();
      ownsConnection = true;
    }
    const rawHash = await redis.hgetall("crm:master:plans:drafts");
    if (rawHash) {
      for (const [key, val] of Object.entries(rawHash)) {
        try {
          result[key] = JSON.parse(val) as CrmPlan;
        } catch {}
      }
    }
  } catch (err) {
    console.warn("[plans] Failed to read plan drafts from Redis", err);
  } finally {
    if (ownsConnection && !providedRedis) redis.disconnect();
  }
  return result;
}

/**
 * Discard a draft for a specific plan
 */
export async function discardPlanDraft(planId: string, actor = "master_admin", providedRedis?: Redis): Promise<boolean> {
  const redis = getRedis(providedRedis);
  let ownsConnection = false;
  try {
    if (redis.status !== "ready" && redis.status !== "connecting") {
      await redis.connect();
      ownsConnection = true;
    }
    await redis.hdel("crm:master:plans:drafts", planId);
    await recordPlanAudit({
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      actor,
      planId,
      planName: planId,
      action: "draft_discard",
      vigencia: "immediate",
      affectedTenantsCount: 0,
      affectedTenants: [],
      timestamp: new Date().toISOString()
    }, providedRedis);
    return true;
  } catch (err) {
    console.error("[plans] Failed to discard plan draft", err);
    return false;
  } finally {
    if (ownsConnection && !providedRedis) redis.disconnect();
  }
}

/**
 * Retrieve master plans enriched with draft status for the Master Admin UI.
 */
export async function getMasterPlansWithDrafts(providedRedis?: Redis): Promise<CrmPlan[]> {
  const [published, drafts] = await Promise.all([
    getMasterPlans(providedRedis),
    getMasterPlanDrafts(providedRedis)
  ]);

  const seenIds = new Set<string>();
  const combined: CrmPlan[] = published.map(plan => {
    seenIds.add(plan.id);
    const draft = drafts[plan.id];
    if (draft) {
      return {
        ...plan,
        hasDraft: true,
        draftPlan: draft
      };
    }
    return plan;
  });

  // Include any drafts that were created as brand new plans (not yet published)
  for (const [draftId, draftPlan] of Object.entries(drafts)) {
    if (!seenIds.has(draftId)) {
      combined.push({
        ...draftPlan,
        isDraft: true,
        hasDraft: true,
        draftPlan
      });
    }
  }

  return combined;
}

/**
 * Save master plan with strict separation between Draft and Published modes.
 * - Mode 'draft': Saves exclusively to 'crm:master:plans:drafts'. Never modifies published catalog or client limits.
 * - Mode 'apply': Publishes to 'crm:master:plans', deletes draft, increments version, and applies lifecycle/vigência.
 */
export async function saveMasterPlan(
  planInput: Partial<CrmPlan> & { id: string; name: string },
  mode: "draft" | "apply",
  vigencia: "immediate" | "new_clients" | "next_cycle" = "immediate",
  actor = "master_admin",
  providedRedis?: Redis
): Promise<{
  saved: boolean;
  applied: boolean;
  partiallyApplied?: boolean;
  isDraft?: boolean;
  affectedTenants: string[];
  succeededTenants: string[];
  failedTenants: Array<{ tenantId: string; error: string }>;
  plan: CrmPlan;
}> {
  const currentPublishedPlans = await getMasterPlans(providedRedis);
  const index = currentPublishedPlans.findIndex(p => p.id === planInput.id);
  const previousPlan = index >= 0 ? { ...currentPublishedPlans[index] } : undefined;

  const targetPlan: CrmPlan = {
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
    version: mode === "apply" ? (previousPlan?.version || 0) + 1 : (previousPlan?.version || 1),
    updated_at: new Date().toISOString()
  };

  // Ensure mandatory core features are always included
  if (!targetPlan.features.includes("ai_chat")) targetPlan.features.unshift("ai_chat");
  if (!targetPlan.features.includes("human_handoff")) targetPlan.features.push("human_handoff");

  const redis = getRedis(providedRedis);
  let ownsConnection = false;
  try {
    if (redis.status !== "ready" && redis.status !== "connecting") {
      await redis.connect();
      ownsConnection = true;
    }

    // 1. DRAFT MODE: Save strictly to drafts hash. NEVER touch published catalog.
    if (mode === "draft") {
      const draftToSave: CrmPlan = {
        ...targetPlan,
        isDraft: true
      };
      await redis.hset("crm:master:plans:drafts", targetPlan.id, JSON.stringify(draftToSave));

      await recordPlanAudit({
        id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        actor,
        planId: targetPlan.id,
        planName: targetPlan.name,
        action: "draft_save",
        vigencia,
        newValues: {
          price: targetPlan.price,
          quotaLimit: targetPlan.quotaLimit,
          features: targetPlan.features,
          status: targetPlan.status
        },
        affectedTenantsCount: 0,
        affectedTenants: [],
        timestamp: new Date().toISOString()
      }, providedRedis);

      return {
        saved: true,
        applied: false,
        isDraft: true,
        affectedTenants: [],
        succeededTenants: [],
        failedTenants: [],
        plan: draftToSave
      };
    }

    // 2. APPLY MODE: Publish to active catalog and remove draft
    let nextPublishedPlans: CrmPlan[];
    if (index >= 0) {
      nextPublishedPlans = [...currentPublishedPlans];
      nextPublishedPlans[index] = targetPlan;
    } else {
      nextPublishedPlans = [...currentPublishedPlans, targetPlan];
    }

    await redis.set("crm:master:plans", JSON.stringify(nextPublishedPlans));
    await redis.hdel("crm:master:plans:drafts", targetPlan.id);
  } finally {
    if (ownsConnection && !providedRedis) redis.disconnect();
  }

  // 3. APPLY TO ELIGIBLE CLIENTS ACCORDING TO VIGÊNCIA
  const affectedTenants: string[] = [];
  const succeededTenants: string[] = [];
  const failedTenants: Array<{ tenantId: string; error: string }> = [];

  const { url, serviceKey } = getSupabaseConfig();
  if (url && serviceKey) {
    try {
      const rSettings = await fetch(url + "/rest/v1/crm_tenant_settings?select=tenant_id,business_description", {
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
        cache: "no-store"
      });

      if (!rSettings.ok) {
        throw new Error(`Failed to read crm_tenant_settings from Supabase (HTTP ${rSettings.status}): ${await rSettings.text()}`);
      }

      const allSettings = (await rSettings.json()) as Array<{ tenant_id: string; business_description: string }>;

      for (const s of allSettings) {
        if (!s.business_description?.startsWith("{")) continue;

        let parsed: Record<string, any>;
        try {
          parsed = JSON.parse(s.business_description);
        } catch {
          continue;
        }

        const tenantPlan = parsed.plan;
        const isMatchingPlan = tenantPlan?.planId === targetPlan.id || tenantPlan?.name === targetPlan.name;
        if (!isMatchingPlan) continue;

        affectedTenants.push(s.tenant_id);

        try {
          const hasCustomQuota = tenantPlan?.customQuotaOverride !== undefined && tenantPlan?.customQuotaOverride !== null && !Number.isNaN(Number(tenantPlan?.customQuotaOverride));

          if (vigencia === "immediate") {
            // IMMEDIATE APPLICATION: Update active quota, update contracted snapshot, clear pending updates
            if (!hasCustomQuota) {
              tenantPlan.quotaLimit = targetPlan.quotaLimit;
            }
            tenantPlan.planId = targetPlan.id;
            tenantPlan.name = targetPlan.name;
            tenantPlan.contractedPlan = {
              quotaLimit: targetPlan.quotaLimit,
              features: targetPlan.features,
              price: targetPlan.price,
              version: targetPlan.version,
              contractedAt: new Date().toISOString()
            };
            delete tenantPlan.pendingPlanUpdate;
            parsed.plan = tenantPlan;

            // Update in Supabase
            const rUpdate = await fetch(url + `/rest/v1/crm_tenant_settings?tenant_id=eq.${s.tenant_id}`, {
              method: "PATCH",
              headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
              body: JSON.stringify({ business_description: JSON.stringify(parsed) })
            });

            if (!rUpdate.ok) {
              throw new Error(`Supabase PATCH crm_tenant_settings failed (HTTP ${rUpdate.status}): ${await rUpdate.text()}`);
            }

            // Sync crm_usage_limits in Supabase
            const effectiveQuota = hasCustomQuota ? Number(tenantPlan.customQuotaOverride) : targetPlan.quotaLimit;
            await syncTenantUsageLimits(s.tenant_id, effectiveQuota, url, serviceKey);

            // Invalidate Redis cache for this tenant
            const rConn = getRedis(providedRedis);
            try {
              if (rConn.status !== "ready" && rConn.status !== "connecting") await rConn.connect();
              await rConn.del(`crm:tenant:effective_plan:${s.tenant_id}`);
              if (!providedRedis) rConn.disconnect();
            } catch {}

            succeededTenants.push(s.tenant_id);
          } else if (vigencia === "new_clients") {
            // NEW CLIENTS ONLY: Freeze existing client's contractedPlan so they never inherit new master limits
            if (!tenantPlan.contractedPlan) {
              tenantPlan.contractedPlan = {
                quotaLimit: hasCustomQuota ? Number(tenantPlan.customQuotaOverride) : (previousPlan?.quotaLimit || tenantPlan.quotaLimit || 500),
                features: previousPlan?.features || ["ai_chat", "human_handoff"],
                price: previousPlan?.price || tenantPlan.price || "149,00",
                version: previousPlan?.version || 1,
                contractedAt: tenantPlan.contractedAt || new Date().toISOString()
              };
              parsed.plan = tenantPlan;

              const rUpdate = await fetch(url + `/rest/v1/crm_tenant_settings?tenant_id=eq.${s.tenant_id}`, {
                method: "PATCH",
                headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
                body: JSON.stringify({ business_description: JSON.stringify(parsed) })
              });

              if (!rUpdate.ok) {
                throw new Error(`Supabase PATCH crm_tenant_settings freeze contract failed (HTTP ${rUpdate.status}): ${await rUpdate.text()}`);
              }
            }

            // Invalidate Redis cache so getEffectiveTenantPlan reads frozen contract
            const rConn = getRedis(providedRedis);
            try {
              if (rConn.status !== "ready" && rConn.status !== "connecting") await rConn.connect();
              await rConn.del(`crm:tenant:effective_plan:${s.tenant_id}`);
              if (!providedRedis) rConn.disconnect();
            } catch {}

            succeededTenants.push(s.tenant_id);
          } else if (vigencia === "next_cycle") {
            // NEXT RENEWAL: Schedule pendingPlanUpdate effective at dueDate
            const dueDate = typeof tenantPlan.dueDate === "string" && tenantPlan.dueDate
              ? tenantPlan.dueDate
              : new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

            tenantPlan.pendingPlanUpdate = {
              planId: targetPlan.id,
              quotaLimit: targetPlan.quotaLimit,
              features: targetPlan.features,
              price: targetPlan.price,
              planVersion: targetPlan.version,
              effectiveAt: dueDate
            };
            parsed.plan = tenantPlan;

            const rUpdate = await fetch(url + `/rest/v1/crm_tenant_settings?tenant_id=eq.${s.tenant_id}`, {
              method: "PATCH",
              headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
              body: JSON.stringify({ business_description: JSON.stringify(parsed) })
            });

            if (!rUpdate.ok) {
              throw new Error(`Supabase PATCH crm_tenant_settings schedule update failed (HTTP ${rUpdate.status}): ${await rUpdate.text()}`);
            }

            // Invalidate Redis cache
            const rConn = getRedis(providedRedis);
            try {
              if (rConn.status !== "ready" && rConn.status !== "connecting") await rConn.connect();
              await rConn.del(`crm:tenant:effective_plan:${s.tenant_id}`);
              if (!providedRedis) rConn.disconnect();
            } catch {}

            succeededTenants.push(s.tenant_id);
          }
        } catch (tenantErr) {
          console.error(`[plans] Error updating tenant ${s.tenant_id}:`, tenantErr);
          failedTenants.push({
            tenantId: s.tenant_id,
            error: tenantErr instanceof Error ? tenantErr.message : String(tenantErr)
          });
        }
      }
    } catch (err) {
      console.error("[plans] Global error during store synchronization:", err);
      // If we failed to even query tenant settings, mark all as failed
      if (affectedTenants.length === 0) {
        failedTenants.push({
          tenantId: "global_sync_error",
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }
  }

  // 4. Record Audit History
  const hasFailures = failedTenants.length > 0;
  const partiallyApplied = succeededTenants.length > 0 && hasFailures;
  const applied = !hasFailures;

  await recordPlanAudit({
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    actor,
    planId: targetPlan.id,
    planName: targetPlan.name,
    action: previousPlan ? "apply_bulk" : "create",
    vigencia,
    previousValues: previousPlan ? {
      price: previousPlan.price,
      quotaLimit: previousPlan.quotaLimit,
      features: previousPlan.features,
      status: previousPlan.status
    } : undefined,
    newValues: {
      price: targetPlan.price,
      quotaLimit: targetPlan.quotaLimit,
      features: targetPlan.features,
      status: targetPlan.status
    },
    affectedTenantsCount: affectedTenants.length,
    affectedTenants: succeededTenants,
    failedTenantsCount: failedTenants.length,
    failedTenants,
    timestamp: new Date().toISOString()
  }, providedRedis);

  return {
    saved: true,
    applied,
    partiallyApplied,
    affectedTenants: succeededTenants,
    succeededTenants,
    failedTenants,
    plan: targetPlan
  };
}

/**
 * Sync Supabase crm_usage_limits table for hard stop quota enforcement.
 * Validates HTTP status and throws on failures (fail-closed).
 */
export async function syncTenantUsageLimits(tenantId: string, quotaLimit: number, url?: string, serviceKey?: string): Promise<void> {
  const config = url && serviceKey ? { url, serviceKey } : getSupabaseConfig();
  if (!config.url || !config.serviceKey) return;

  const rCheck = await fetch(config.url + `/rest/v1/crm_usage_limits?tenant_id=eq.${tenantId}&limit=1`, {
    headers: { apikey: config.serviceKey, Authorization: "Bearer " + config.serviceKey },
    cache: "no-store"
  });

  if (!rCheck.ok) {
    const errBody = await rCheck.text();
    throw new Error(`Supabase read crm_usage_limits failed (HTTP ${rCheck.status}): ${errBody}`);
  }

  const existing = (await rCheck.json()) as Array<{ tenant_id: string }>;
  if (existing.length > 0) {
    const rUpdate = await fetch(config.url + `/rest/v1/crm_usage_limits?tenant_id=eq.${tenantId}`, {
      method: "PATCH",
      headers: { apikey: config.serviceKey, Authorization: "Bearer " + config.serviceKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        monthly_model_requests: quotaLimit,
        hard_stop_on_limit: true,
        updated_at: new Date().toISOString()
      })
    });
    if (!rUpdate.ok) {
      const errBody = await rUpdate.text();
      throw new Error(`Supabase PATCH crm_usage_limits failed (HTTP ${rUpdate.status}): ${errBody}`);
    }
  } else {
    const rPost = await fetch(config.url + "/rest/v1/crm_usage_limits", {
      method: "POST",
      headers: { apikey: config.serviceKey, Authorization: "Bearer " + config.serviceKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_id: tenantId,
        monthly_model_requests: quotaLimit,
        hard_stop_on_limit: true,
        updated_at: new Date().toISOString()
      })
    });
    if (!rPost.ok) {
      const errBody = await rPost.text();
      throw new Error(`Supabase POST crm_usage_limits failed (HTTP ${rPost.status}): ${errBody}`);
    }
  }
}

/**
 * Retrieve effective plan, dynamic quota and allowed features for a tenant.
 * - Handles contractual snapshots (contractedPlan) when updates were for new clients only.
 * - Handles pending plan updates scheduled for next renewal (pendingPlanUpdate).
 * - Honors contractual custom overrides (customQuotaOverride).
 * - Never returns or uses unapproved drafts.
 */
export async function getEffectiveTenantPlan(tenantId: string, providedRedis?: Redis): Promise<EffectiveTenantPlan> {
  const redis = getRedis(providedRedis);
  let ownsConnection = false;

  // 1. Check Redis cache first (60s TTL)
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

  // 2. Fetch published master plans (never drafts!)
  const masterPlans = await getMasterPlans(providedRedis);
  const { url, serviceKey } = getSupabaseConfig();

  let rawTenantPlan: Record<string, any> = {};
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

  // 4. Check for lifecycle states: pendingPlanUpdate vs contractedPlan vs master catalog
  let baseQuota = matchedPlan.quotaLimit;
  let baseFeatures: FeatureId[] = [...matchedPlan.features];
  let basePrice = matchedPlan.price;
  let isContractFrozen = false;
  let contractedVersion: number | undefined;

  const pendingUpdate = rawTenantPlan.pendingPlanUpdate as PendingPlanUpdate | undefined;
  const contractedSnapshot = rawTenantPlan.contractedPlan as ContractedSnapshot | undefined;

  const now = new Date();

  if (pendingUpdate && pendingUpdate.effectiveAt) {
    const effectiveDate = new Date(pendingUpdate.effectiveAt);
    if (now >= effectiveDate) {
      // Pending update has matured and becomes active!
      baseQuota = pendingUpdate.quotaLimit;
      baseFeatures = [...pendingUpdate.features];
      basePrice = pendingUpdate.price;
      contractedVersion = pendingUpdate.planVersion;
    } else {
      // Still before renewal date: maintain contracted snapshot if available
      if (contractedSnapshot) {
        baseQuota = contractedSnapshot.quotaLimit;
        baseFeatures = [...contractedSnapshot.features];
        basePrice = contractedSnapshot.price;
        contractedVersion = contractedSnapshot.version;
        isContractFrozen = true;
      }
    }
  } else if (contractedSnapshot) {
    // Contract is frozen (e.g. from new_clients only update)
    baseQuota = contractedSnapshot.quotaLimit;
    baseFeatures = [...contractedSnapshot.features];
    basePrice = contractedSnapshot.price;
    contractedVersion = contractedSnapshot.version;
    isContractFrozen = true;
  }

  // 5. Contractual exception overrides (highest priority for quota)
  const customQuotaRaw = rawTenantPlan.customQuotaOverride;
  const hasCustomQuota = customQuotaRaw !== undefined && customQuotaRaw !== null && !Number.isNaN(Number(customQuotaRaw));
  const finalQuota = hasCustomQuota ? Number(customQuotaRaw) : baseQuota;

  const customFeaturesRaw = rawTenantPlan.customFeaturesOverride;
  const hasCustomFeatures = Array.isArray(customFeaturesRaw) && customFeaturesRaw.length > 0;
  const finalFeatures: FeatureId[] = hasCustomFeatures
    ? Array.from(new Set([...baseFeatures, ...(customFeaturesRaw as FeatureId[])]))
    : baseFeatures;

  // 6. Check due date and payment status
  const dueDate = typeof rawTenantPlan.dueDate === "string" ? rawTenantPlan.dueDate : new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const paymentStatus = rawTenantPlan.status === "pending" ? "pending" : "paid";
  const autoBlock = rawTenantPlan.autoBlock !== false;
  const isOverdue = autoBlock && paymentStatus !== "paid" && new Date(dueDate) < now;

  if (isOverdue) {
    isSuspended = true;
    if (!suspensionReason) suspensionReason = "payment_overdue";
  }

  const effective: EffectiveTenantPlan = {
    tenantId,
    planId: matchedPlan.id,
    planName: matchedPlan.name,
    price: (typeof rawTenantPlan.price === "string" && rawTenantPlan.price) ? rawTenantPlan.price : basePrice,
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
    } : undefined,
    contractedVersion,
    isContractFrozen,
    pendingUpdate: pendingUpdate && now < new Date(pendingUpdate.effectiveAt) ? pendingUpdate : undefined
  };

  // 7. Cache in Redis for 60s
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
