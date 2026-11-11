import type { StoredTenantConfig, StoredTenantPlan } from "./settings-types";
import "server-only";
import Redis from "ioredis";
import { isDeepStrictEqual } from "node:util";
import { resolveMasterOwnTenant } from "./master-own-tenant";
import { syncWhatsappChannelsForPlanLimit } from "./whatsapp-slots";

export type FeatureId =
  | "ai_chat"
  | "human_handoff"
  | "simulator"
  | "business_hours_basic"
  | "quick_replies"
  | "basic_indicators"
  | "business_hours"
  | "commercial_tags"
  | "handoff_summary"
  | "sound_notifications"
  | "model_fallback"
  | "conversation_priority"
  | "satisfaction_survey"
  | "commercial_indicators"
  | "advanced_reports"
  | "satisfaction_analytics"
  | "operator_indicators"
  | "advanced_commercial_filters";

export type FeatureAccessState = "allowed" | "locked_by_plan" | "maintenance" | "suspended";

export type FeatureGovernanceStatus = {
  id: FeatureId;
  name: string;
  description: string;
  category: "ia" | "atendimento" | "gestao" | "seguranca";
  state: FeatureAccessState;
  minPlanId: "crm-start" | "crm-business" | "crm-premium";
  minPlanName: string;
  reason?: string;
};

export type TechnicalFeature = {
  id: FeatureId;
  name: string;
  category: "ia" | "atendimento" | "gestao" | "seguranca";
  description: string;
  minPlanId?: "crm-start" | "crm-business" | "crm-premium";
  minPlanName?: string;
  isCore?: boolean;
};

export const CATALOG_SCHEMA_VERSION = 3;

export type CrmPlan = {
  id: string; // Stable ID: 'crm-start', 'crm-business', 'crm-premium'
  name: string; // Commercial name: 'CRM Start'
  price: string; // "59,90"
  quotaLimit: number; // Each successfully sent AI message consumes one unit.
  maxOperators: number; // 1, 3, 5
  maxWhatsappConnections: number; // 1, 3, 5
  description: string;
  features: FeatureId[]; // Technical feature IDs enabled
  featureBullets: string[]; // Commercial bullets for cards
  status: "active" | "inactive";
  isPopular?: boolean;
  version: number;
  catalogSchemaVersion?: number;
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
  action: "create" | "update" | "duplicate" | "toggle_status" | "apply_bulk" | "draft_save" | "draft_discard" | "upgrade_approved" | "upgrade_rejected" | "payment_marked_paid" | "suspension_updated" | "delete" | "extension_granted" | "discount_applied";
  vigencia: "immediate" | "new_clients" | "next_cycle";
  previousValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
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
  maxOperators?: number;
  maxWhatsappConnections?: number;
  version: number;
  contractedAt: string;
};

export type PendingPlanUpdate = {
  planId: string;
  quotaLimit: number;
  features: FeatureId[];
  price: string;
  maxOperators?: number;
  maxWhatsappConnections?: number;
  effectiveAt: string; // ISO date string (YYYY-MM-DD)
  planVersion: number;
};

export type MessageRechargeItem = {
  id: string;
  packagesCount: number;
  messagesAdded: number;
  pricePaid: number;
  purchasedAt: string;
  status: "paid" | "pending" | "rejected";
  paymentMethod?: string;
  txId?: string;
  approvedAt?: string;
  approvedBy?: string;
  rejectionReason?: string;
  clientNotes?: string;
};

export type MasterPixConfig = {
  keyType: "cnpj" | "email" | "phone" | "random";
  pixKey: string;
  beneficiaryName: string;
  bankName: string;
  city?: string;
  instructions?: string;
  updatedAt?: string;
};

export const DEFAULT_PIX_CONFIG: MasterPixConfig = {
  keyType: "cnpj",
  pixKey: "58.742.894/0001-40",
  beneficiaryName: "NovaesWeb Soluções Digitais",
  bankName: "Banco Inter / NuBank",
  city: "São Paulo - SP",
  instructions: "Transfira o valor exato do pacote escolhido para a chave PIX acima. Em seguida, informe seu pagamento para aprovação imediata pelo administrador Master."
};

export const RECHARGE_PACKAGES = [
  { packagesCount: 1, messages: 100, price: "20,00", priceValue: 20, label: "100 mensagens adicionais" },
  { packagesCount: 2, messages: 200, price: "40,00", priceValue: 40, label: "200 mensagens adicionais" },
  { packagesCount: 5, messages: 500, price: "90,00", priceValue: 90, label: "500 mensagens (Combo especial)" }
];

export type EffectiveTenantPlan = {
  tenantId: string;
  planId: string;
  planName: string;
  price: string;
  quotaLimit: number;
  maxOperators: number;
  maxWhatsappConnections: number;
  allowedFeatures: FeatureId[];
  featureStates?: Record<FeatureId, FeatureGovernanceStatus>;
  dueDate: string;
  status: "paid" | "pending" | "trial";
  autoBlock: boolean;
  isOverdue: boolean;
  isSuspended: boolean;
  suspensionReason?: string;
  publicSuspensionReason?: string;
  internalSuspensionNote?: string;
  hasCustomOverride: boolean;
  customOverride?: {
    quotaLimit?: number;
    features?: FeatureId[];
    reason?: string;
  };
  contractedVersion?: number;
  isContractFrozen?: boolean;
  pendingUpdate?: PendingPlanUpdate;
  // Trial (7 Dias)
  isTrial?: boolean;
  trialDaysLeft?: number;
  trialStartedAt?: string;
  trialExpiresAt?: string;
  trialStatus?: "active" | "expiring_soon" | "expired" | "quota_exhausted" | "converted";
  quotaUsed?: number;
  quotaPeriod?: string;
  rechargeCreditsBalance?: number;
  rechargesHistory?: MessageRechargeItem[];
};

export const DEFAULT_QUICK_REPLIES = [
  {
    id: "qr_boas_vindas",
    shortcut: "/oi",
    title: "Boas-vindas e Apresentação",
    body: "Olá! Tudo bem? 😊 Sou do atendimento humano. Como posso ajudar você hoje?",
    category: "Saudação"
  },
  {
    id: "qr_pix",
    shortcut: "/pix",
    title: "Dados para Pagamento via PIX",
    body: "Para pagamento via PIX, assim que realizar a transferência nos envie o comprovante por aqui para confirmarmos seu pedido imediatamente! ✅",
    category: "Financeiro"
  },
  {
    id: "qr_encerramento",
    shortcut: "/obrigado",
    title: "Agradecimento e Encerramento",
    body: "Muito obrigado pelo seu contato! Qualquer outra dúvida, permanecemos à disposição. Tenha um excelente dia! 🙌",
    category: "Atendimento"
  }
];

export const TECHNICAL_FEATURES: TechnicalFeature[] = [
  {
    id: "ai_chat",
    name: "IA Personalizada & Base de Conhecimento",
    category: "ia",
    description: "Respostas automáticas inteligentes no WhatsApp com a base de conhecimento, regras e assistente de configuração.",
    minPlanId: "crm-start",
    minPlanName: "CRM Start",
    isCore: true
  },
  {
    id: "human_handoff",
    name: "Atendimento Humano & Transferência IA → Humano",
    category: "atendimento",
    description: "Central de conversas ao vivo, contatos, histórico e transferência entre IA e operador humano.",
    minPlanId: "crm-start",
    minPlanName: "CRM Start",
    isCore: true
  },
  {
    id: "simulator",
    name: "Simulador da IA",
    category: "ia",
    description: "Simulador em tempo real para testar como a IA responde antes de atender clientes reais.",
    minPlanId: "crm-start",
    minPlanName: "CRM Start"
  },
  {
    id: "business_hours_basic",
    name: "Horários Básicos de Atendimento",
    category: "atendimento",
    description: "Definição de horário de início e término de atendimento por dia da semana e mensagem de ausência.",
    minPlanId: "crm-start",
    minPlanName: "CRM Start"
  },
  {
    id: "quick_replies",
    name: "Respostas Rápidas",
    category: "atendimento",
    description: "Cadastro e atalhos de mensagens prontas para agilizar o atendimento humano.",
    minPlanId: "crm-start",
    minPlanName: "CRM Start"
  },
  {
    id: "basic_indicators",
    name: "Indicadores Básicos",
    category: "gestao",
    description: "Visão essencial do consumo da franquia, atendimentos ativos e volume atendido pela IA e humano.",
    minPlanId: "crm-start",
    minPlanName: "CRM Start"
  },
  {
    id: "business_hours",
    name: "Horários Avançados & Intervalos",
    category: "atendimento",
    description: "Controle avançado de múltiplos turnos, pausas de almoço/intervalos e regras especiais por dia.",
    minPlanId: "crm-business",
    minPlanName: "CRM Business"
  },
  {
    id: "commercial_tags",
    name: "Etiquetas Comerciais",
    category: "gestao",
    description: "Classificação comercial de conversas e contatos com filtros e histórico persistido no banco.",
    minPlanId: "crm-business",
    minPlanName: "CRM Business"
  },
  {
    id: "handoff_summary",
    name: "Resumos Inteligentes de Atendimento",
    category: "atendimento",
    description: "Geração automática de resumo estruturado em 3 linhas ao transferir conversa para o atendente.",
    minPlanId: "crm-business",
    minPlanName: "CRM Business"
  },
  {
    id: "sound_notifications",
    name: "Alertas Sonoros no Painel",
    category: "atendimento",
    description: "Notificação sonora imediata quando um cliente solicita humano ou entra em fila prioritária.",
    minPlanId: "crm-business",
    minPlanName: "CRM Business"
  },
  {
    id: "model_fallback",
    name: "Modelo Reserva de IA",
    category: "seguranca",
    description: "Failover automático entre provedores e modelos de IA para garantir alta disponibilidade.",
    minPlanId: "crm-business",
    minPlanName: "CRM Business"
  },
  {
    id: "conversation_priority",
    name: "Prioridade dos Atendimentos",
    category: "atendimento",
    description: "Classificação manual e automática pela IA (Baixa, Normal, Alta e Urgente) com ordenação inteligente da fila.",
    minPlanId: "crm-business",
    minPlanName: "CRM Business"
  },
  {
    id: "satisfaction_survey",
    name: "Pesquisa de Satisfação (CSAT)",
    category: "gestao",
    description: "Coleta de avaliação de 1 a 5 estrelas e comentário opcional após o encerramento do atendimento.",
    minPlanId: "crm-business",
    minPlanName: "CRM Business"
  },
  {
    id: "commercial_indicators",
    name: "Indicadores Comerciais",
    category: "gestao",
    description: "Métricas de funil por etiquetas comerciais, taxa de transbordo e média de satisfação.",
    minPlanId: "crm-business",
    minPlanName: "CRM Business"
  },
  {
    id: "advanced_reports",
    name: "Relatórios Avançados",
    category: "gestao",
    description: "Relatórios gerenciais completos de volume, conversão, pico de demanda e eficiência operacional.",
    minPlanId: "crm-premium",
    minPlanName: "CRM Premium"
  },
  {
    id: "satisfaction_analytics",
    name: "Análise Avançada de Satisfação",
    category: "gestao",
    description: "Distribuição detalhada de notas 1 a 5, comparativo IA vs. humano e auditoria de avaliações críticas.",
    minPlanId: "crm-premium",
    minPlanName: "CRM Premium"
  },
  {
    id: "operator_indicators",
    name: "Indicadores por Atendente",
    category: "gestao",
    description: "Ranking e métricas individuais de produtividade, atendimentos assumidos e satisfação por operador.",
    minPlanId: "crm-premium",
    minPlanName: "CRM Premium"
  },
  {
    id: "advanced_commercial_filters",
    name: "Filtros e Análises Comerciais Avançadas",
    category: "gestao",
    description: "Filtros combinados por período, canal de WhatsApp, operador, prioridade e etiqueta comercial.",
    minPlanId: "crm-premium",
    minPlanName: "CRM Premium"
  }
];

export const START_FEATURES: FeatureId[] = [
  "ai_chat",
  "human_handoff",
  "simulator",
  "business_hours_basic",
  "quick_replies",
  "basic_indicators"
];

export const BUSINESS_FEATURES: FeatureId[] = [
  ...START_FEATURES,
  "business_hours",
  "commercial_tags",
  "handoff_summary",
  "sound_notifications",
  "model_fallback",
  "conversation_priority",
  "satisfaction_survey",
  "commercial_indicators"
];

export const PREMIUM_FEATURES: FeatureId[] = [
  ...BUSINESS_FEATURES,
  "advanced_reports",
  "satisfaction_analytics",
  "operator_indicators",
  "advanced_commercial_filters"
];

export const DEFAULT_PLANS: CrmPlan[] = [
  {
    id: "crm-premium",
    name: "CRM Premium",
    price: "89,90",
    quotaLimit: 1200, // 1.200 mensagens da IA por mês
    maxOperators: 3, // Até 3 acessos (1 titular + 2 operadores de equipe)
    maxWhatsappConnections: 3, // Até 3 WhatsApps conectados simultâneos
    isPopular: true,
    description: "Plano definitivo com inteligência artificial completa, múltiplos WhatsApps e recarga de mensagens.",
    features: [...PREMIUM_FEATURES],
    featureBullets: [
      "1.200 mensagens da IA por mês",
      "Até 3 WhatsApps conectados simultâneos",
      "Até 2 operadores humanos na equipe (+ 1 titular)",
      "Todas as funcionalidades liberadas",
      "Recargas adicionais: R$ 20,00 = 100 mensagens",
      "Suporte prioritário"
    ],
    status: "active",
    version: 1,
    catalogSchemaVersion: CATALOG_SCHEMA_VERSION,
    updated_at: new Date().toISOString()
  },
  {
    id: "crm-start",
    name: "CRM Start",
    price: "59,90",
    quotaLimit: 200,
    maxOperators: 1,
    maxWhatsappConnections: 1,
    description: "Plano legado para autônomos e pequenos comércios (não disponível para novas contratações).",
    features: [...START_FEATURES],
    featureBullets: [
      "200 mensagens da IA por mês",
      "1 WhatsApp conectado",
      "1 operador humano"
    ],
    status: "inactive",
    version: 1,
    catalogSchemaVersion: CATALOG_SCHEMA_VERSION,
    updated_at: new Date().toISOString()
  },
  {
    id: "crm-business",
    name: "CRM Business",
    price: "99,90",
    quotaLimit: 600,
    maxOperators: 3,
    maxWhatsappConnections: 3,
    description: "Plano legado para empresas em crescimento (não disponível para novas contratações).",
    features: [...BUSINESS_FEATURES],
    featureBullets: [
      "600 mensagens da IA por mês",
      "Até 3 WhatsApps conectados",
      "Até 3 operadores humanos"
    ],
    status: "inactive",
    version: 1,
    catalogSchemaVersion: CATALOG_SCHEMA_VERSION,
    updated_at: new Date().toISOString()
  }
];

export const TRIAL_PLAN: CrmPlan & { durationDays: number } = {
  id: "crm-trial",
  name: "Teste Grátis (7 Dias)",
  price: "0,00",
  quotaLimit: 50, // 50 mensagens da IA no período de teste
  durationDays: 7,
  maxOperators: 3, // Até 3 acessos (1 titular + 2 operadores de equipe)
    maxWhatsappConnections: 2, // Até 2 WhatsApps conectados simultâneos
  description: "Avaliação gratuita de 7 dias com todas as funcionalidades Premium liberadas.",
  features: [...PREMIUM_FEATURES],
  featureBullets: [
    "7 dias corridos de teste grátis",
    "50 mensagens da IA incluídas",
    "Até 2 WhatsApps conectados simultâneos",
    "Até 2 operadores humanos na equipe (+ 1 titular)",
    "Todas as funcionalidades Premium liberadas",
    "Dados 100% preservados ao final do período"
  ],
  status: "active",
  version: 1,
  catalogSchemaVersion: CATALOG_SCHEMA_VERSION,
  updated_at: new Date().toISOString()
};

export const ALL_DEFAULT_PLANS: CrmPlan[] = [
  TRIAL_PLAN,
  ...DEFAULT_PLANS
];

export const MANDATORY_BASE_PLANS: CrmPlan[] = [
  TRIAL_PLAN,
  DEFAULT_PLANS.find(p => p.id === "crm-premium")!
];

/** Resolve an explicit selection without silently assigning another plan. */
export function selectPublishedPlan(plans: CrmPlan[], planId: string, planName = ""): CrmPlan | undefined {
  const id = planId.trim();
  const name = planName.trim().toLocaleLowerCase("pt-BR");
  return plans.find(p => p.status === "active" && (id ? p.id === id : p.name.toLocaleLowerCase("pt-BR") === name));
}

/**
 * Upgrade any legacy plan entry loaded from Redis (schema < 2) to the v2 commercial definition
 * without overwriting explicit v2 edits made by the Master.
 */
const LEGACY_FEATURE_ALIASES: Record<string, FeatureId> = {
  knowledge_base: "ai_chat", setup_wizard: "ai_chat", contacts_history: "human_handoff",
  basic_hours: "business_hours_basic", attendance_priority: "conversation_priority"
};

function normalizeFeatureIds(features: FeatureId[]): FeatureId[] {
  return Array.from(new Set(features.map(feature => LEGACY_FEATURE_ALIASES[feature] || feature)));
}

export function normalizeCatalogPlan(raw: CrmPlan): CrmPlan {
  if (Array.isArray(raw.features)) raw = { ...raw, features: normalizeFeatureIds(raw.features) };
  const defaultMatch = ALL_DEFAULT_PLANS.find(
    d => d.id === raw.id || d.name.toLowerCase() === String(raw.name || "").toLowerCase()
  );
  if (!defaultMatch) {
    return {
      ...raw,
      catalogSchemaVersion: raw.catalogSchemaVersion || CATALOG_SCHEMA_VERSION
    };
  }

  const isLegacySchema = !raw.catalogSchemaVersion || raw.catalogSchemaVersion < CATALOG_SCHEMA_VERSION;
  if (!isLegacySchema) {
    return {
      ...raw,
      name: defaultMatch.name,
      status: defaultMatch.status,
      maxOperators: Math.min(raw.maxOperators, defaultMatch.maxOperators),
      maxWhatsappConnections: Math.min(raw.maxWhatsappConnections, defaultMatch.maxWhatsappConnections),
      ...(defaultMatch.id === "crm-trial" ? { price: "0,00", quotaLimit: defaultMatch.quotaLimit } : {}),
      ...(defaultMatch.id === "crm-premium" ? { price: "89,90", quotaLimit: 1200 } : {})
    };
  }

  // Schema upgrade to v3: Definitive Novaes CRM plans (Teste 7d R$ 0 e Premium R$ 89,90)
  return {
    ...defaultMatch,
    id: defaultMatch.id,
    name: defaultMatch.name,
    price: defaultMatch.price,
    quotaLimit: defaultMatch.quotaLimit,
    maxOperators: defaultMatch.maxOperators,
    maxWhatsappConnections: defaultMatch.maxWhatsappConnections,
    status: defaultMatch.status, // "active" for trial and premium; "inactive" for start and business
    features: defaultMatch.features,
    featureBullets: defaultMatch.featureBullets,
    description: defaultMatch.description,
    isPopular: defaultMatch.isPopular,
    version: raw.version || 1,
    catalogSchemaVersion: CATALOG_SCHEMA_VERSION,
    updated_at: new Date().toISOString()
  };
}

export function buildFeatureGovernanceMap(
  allowedFeatures: FeatureId[],
  isSuspended: boolean,
  suspensionReason?: string,
  maintenanceFeatures: FeatureId[] = [],
  publishedPlans?: CrmPlan[]
): Record<FeatureId, FeatureGovernanceStatus> {
  const map = {} as Record<FeatureId, FeatureGovernanceStatus>;
  for (const feat of TECHNICAL_FEATURES) {
    const availablePlan = publishedPlans?.filter(p => p.status === "active" && p.id !== "crm-trial" && p.features.includes(feat.id))
      .sort((a, b) => ALL_DEFAULT_PLANS.findIndex(p => p.id === a.id) - ALL_DEFAULT_PLANS.findIndex(p => p.id === b.id))[0];
    const minPlanName = availablePlan?.name || feat.minPlanName || "CRM Business";
    const minPlanId = (availablePlan?.id || feat.minPlanId || "crm-business") as FeatureGovernanceStatus["minPlanId"];
    let state: FeatureAccessState = "locked_by_plan";
    let reason: string | undefined;

    if (isSuspended) {
      state = "suspended";
      reason = suspensionReason || "Conta suspensa administrativamente ou período/franquia encerrado.";
    } else if (maintenanceFeatures.includes(feat.id)) {
      state = "maintenance";
      reason = "Recurso temporariamente indisponível por pendência técnica ou manutenção.";
    } else if (allowedFeatures.includes(feat.id)) {
      state = "allowed";
    } else {
      state = "locked_by_plan";
      reason = publishedPlans && !availablePlan ? "Recurso não disponível nos planos publicados. Consulte a central Master." : `Disponível a partir do plano ${minPlanName}.`;
    }

    map[feat.id] = {
      id: feat.id,
      name: feat.name,
      description: feat.description,
      category: feat.category,
      state,
      minPlanId,
      minPlanName,
      reason
    };
  }
  return map;
}

let sharedRedis: Redis | null = null;

export function getRedis(providedRedis?: Redis): Redis {
  if (providedRedis) return providedRedis;
  if (!sharedRedis || sharedRedis.status === "end") {
    const redisUrl = process.env.CRM_REDIS_URL || "redis://127.0.0.1:6379";
    sharedRedis = new Redis(redisUrl, {
      lazyConnect: true,
      connectTimeout: 1500,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });
    sharedRedis.on("error", () => {});
  }
  return sharedRedis;
}

export async function disconnectRedis(): Promise<void> {
  if (sharedRedis) {
    try {
      sharedRedis.disconnect();
    } catch {}
    sharedRedis = null;
  }
}

export function getSupabaseConfig() {
  const url = (process.env.CRM_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)?.trim().replace(/\/$/, "") ?? "";
  const serviceKey = (process.env.CRM_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY)?.trim() ?? "";
  return { url, serviceKey };
}

function parsePlanEffectiveDate(value: string): Date {
  if (typeof value !== "string" || !value.trim()) throw new Error("invalid_plan_effective_date");
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00-03:00` : value);
  if (!Number.isFinite(date.getTime())) throw new Error("invalid_plan_effective_date");
  return date;
}

export function normalizePlanVigencia(value: unknown): "immediate" | "new_clients" | "next_cycle" {
  if (value === "next_renewal") return "next_cycle";
  if (value === "immediate" || value === "new_clients" || value === "next_cycle") return value;
  throw new Error("invalid_plan_vigencia");
}

function validateCommercialPlan(plan: Pick<CrmPlan, "id" | "name" | "quotaLimit" | "maxOperators" | "maxWhatsappConnections" | "features">): void {
  if (!/^[a-z0-9_-]{2,100}$/.test(plan.id) || typeof plan.name !== "string" || !plan.name.trim()) throw new Error("invalid_plan_identity");
  if (!Number.isInteger(plan.quotaLimit) || plan.quotaLimit < 0 || plan.quotaLimit > 1000000) throw new Error("invalid_plan_quota");
  if (!Number.isInteger(plan.maxOperators) || plan.maxOperators < 1 || plan.maxOperators > 5 || !Number.isInteger(plan.maxWhatsappConnections) || plan.maxWhatsappConnections < 1 || plan.maxWhatsappConnections > 5) throw new Error("invalid_plan_limits");
  if (!Array.isArray(plan.features) || plan.features.some(f => !TECHNICAL_FEATURES.some(known => known.id === f))) throw new Error("invalid_plan_features");
}

/** Only replace the commercial sub-document under a database row lock. */
export async function replaceTenantPlan(tenantId: string, plan: Record<string, unknown>, url?: string, serviceKey?: string): Promise<void> {
  const config = url && serviceKey ? { url, serviceKey } : getSupabaseConfig();
  if (!config.url || !config.serviceKey) throw new Error("plan_service_not_configured");
  const result = await fetch(config.url + "/rest/v1/rpc/crm_replace_plan", {
    method: "POST", cache: "no-store", signal: AbortSignal.timeout(8000),
    headers: { apikey: config.serviceKey, Authorization: `Bearer ${config.serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_tenant: tenantId, p_plan: plan })
  });
  if (!result.ok) throw new Error(`tenant_plan_write_failed:${result.status}`);
  const saved = await result.json() as Record<string, unknown>;
  if (!saved || typeof saved !== "object" || !saved.plan) throw new Error("tenant_plan_write_unconfirmed");
}

export async function enforceTenantOperatorLimit(tenantId: string, limit: number, url?: string, serviceKey?: string): Promise<void> {
  const config = url && serviceKey ? { url, serviceKey } : getSupabaseConfig();
  if (!config.url || !config.serviceKey) throw new Error("plan_service_not_configured");
  const result = await fetch(config.url + "/rest/v1/rpc/crm_enforce_operator_limit", {
    method: "POST", cache: "no-store", signal: AbortSignal.timeout(8000),
    headers: { apikey: config.serviceKey, Authorization: `Bearer ${config.serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_tenant: tenantId, p_limit: limit })
  });
  if (!result.ok) throw new Error(`operator_limit_sync_failed:${result.status}`);
  const synced = await result.json() as { activeCount?: number };
  if (!Number.isInteger(synced.activeCount) || synced.activeCount! > limit) throw new Error("operator_limit_sync_unconfirmed");
}

/**
 * Retrieve master published plans catalog from Redis with fallback to DEFAULT_PLANS.
 * Automatically upgrades legacy catalog schemas (schema < 2) so old limits/features never stick.
 * NEVER returns draft versions. Runtime and customer execution must use this exclusively.
 */

export async function catalogOwnerId(): Promise<string> {
  const config = getSupabaseConfig();
  if (!config.url || !config.serviceKey) throw new Error("plan_service_not_configured");
  const tenant = await resolveMasterOwnTenant<{id:string}>(async query => {
    const response = await fetch(config.url + "/rest/v1/" + query, {
      headers: { apikey: config.serviceKey, Authorization: "Bearer " + config.serviceKey },
      cache: "no-store", signal: AbortSignal.timeout(6000)
    });
    if (!response.ok) throw new Error("plan_catalog_owner_lookup_failed");
    return await response.json();
  });
  return tenant.id;
}
let inMemoryPlansCatalog: CrmPlan[] | null = null;
let inMemoryPlanDrafts: Record<string, CrmPlan> = {};

async function getMasterPlansFromSupabase(): Promise<CrmPlan[]> {
  const config = getSupabaseConfig();
  if (!config.url || !config.serviceKey) throw new Error("plan_service_not_configured");
  const response = await fetch(config.url + `/rest/v1/crm_tenant_settings?tenant_id=eq.${await catalogOwnerId()}&select=business_description`, {
    headers: { apikey: config.serviceKey, Authorization: "Bearer " + config.serviceKey },
    cache: "no-store", signal: AbortSignal.timeout(6000)
  });
  if (!response.ok) throw new Error("plan_catalog_unavailable");
  const rows = await response.json() as Array<{business_description?:string}>;
  if (!Array.isArray(rows) || rows.length > 1) throw new Error("invalid_plan_catalog");
  const root = rows[0]?.business_description ? JSON.parse(rows[0].business_description) : {};
  if (!root || typeof root !== "object" || Array.isArray(root)) throw new Error("invalid_plan_catalog");
  // An existing agency with no published catalog is an explicit bootstrap case.
  // A failed lookup or malformed stored catalog must never broaden access.
  const stored = root.master_plans_catalog;
  if (stored !== undefined && (!Array.isArray(stored) || stored.length === 0)) throw new Error("invalid_plan_catalog");
  const loadedPlans: CrmPlan[] = stored ? stored.map(normalizeCatalogPlan) : [];
  loadedPlans.forEach(validateCommercialPlan);
  if (new Set(loadedPlans.map(p => p.id)).size !== loadedPlans.length) throw new Error("duplicate_catalog_plan");
  const hadLegacy = stored && stored.some((p: CrmPlan) => !p.catalogSchemaVersion || p.catalogSchemaVersion < CATALOG_SCHEMA_VERSION);
  if (hadLegacy) {
    await saveMasterPlansToSupabase(loadedPlans).catch(() => {});
  }
    if (loadedPlans.length === 0) {
    return ALL_DEFAULT_PLANS;
  }
  const map = new Map(MANDATORY_BASE_PLANS.map(p => [p.id, p]));
  for (const plan of loadedPlans) map.set(plan.id, plan);
  return Array.from(map.values());
}

async function getMasterPlanDraftsFromSupabase(): Promise<Record<string, CrmPlan>> {
  if (Object.keys(inMemoryPlanDrafts).length > 0) {
    return inMemoryPlanDrafts;
  }
  const config = getSupabaseConfig();
  if (config.url && config.serviceKey) {
    try {
      const res = await fetch(
        config.url + `/rest/v1/crm_tenant_settings?tenant_id=eq.${await catalogOwnerId()}&select=business_description`,
        {
          headers: { apikey: config.serviceKey, Authorization: "Bearer " + config.serviceKey },
          cache: "no-store",
          signal: AbortSignal.timeout(6000)
        }
      );
      if (res.ok) {
        const rows = (await res.json()) as Array<{ business_description?: string }>;
        if (rows[0]?.business_description) {
          const parsed = JSON.parse(rows[0].business_description);
          if (parsed?.master_plans_drafts && typeof parsed.master_plans_drafts === "object") {
            inMemoryPlanDrafts = parsed.master_plans_drafts as Record<string, CrmPlan>;
            return inMemoryPlanDrafts;
          }
        }
      }
    } catch {}
  }
  return inMemoryPlanDrafts;
}

async function saveMasterPlansToSupabase(
  plansToSave?: CrmPlan[],
  draftToSave?: { id: string; plan: CrmPlan },
  draftToDeleteId?: string
): Promise<void> {
  const config = getSupabaseConfig();
  if (!config.url || !config.serviceKey) throw new Error("plan_service_not_configured");
  const ownerId = await catalogOwnerId();
  const patch: Record<string, unknown> = {};
  if (plansToSave) patch.master_plans_catalog = plansToSave;
  let nextDrafts: Record<string, CrmPlan> | undefined;
  if (draftToSave || draftToDeleteId) {
    const response = await fetch(config.url + `/rest/v1/crm_tenant_settings?tenant_id=eq.${ownerId}&select=business_description`, {
      headers: { apikey: config.serviceKey, Authorization: "Bearer " + config.serviceKey },
      cache: "no-store", signal: AbortSignal.timeout(6000)
    });
    if (!response.ok) throw new Error("plan_catalog_draft_lookup_failed");
    const rows = await response.json() as Array<{business_description?:string}>;
    if (!Array.isArray(rows) || rows.length !== 1) throw new Error("plan_catalog_settings_unavailable");
    const root = rows[0].business_description ? JSON.parse(rows[0].business_description) : {};
    if (!root || typeof root !== "object" || Array.isArray(root)) throw new Error("invalid_plan_catalog");
    nextDrafts = { ...(root.master_plans_drafts || {}) };
    if (draftToSave) nextDrafts![draftToSave.id] = draftToSave.plan;
    if (draftToDeleteId) delete nextDrafts![draftToDeleteId];
    patch.master_plans_drafts = nextDrafts;
  }
  const saved = await fetch(config.url + "/rest/v1/rpc/crm_patch_tenant_config", {
    method: "POST", cache: "no-store", signal: AbortSignal.timeout(8000),
    headers: { apikey: config.serviceKey, Authorization: "Bearer " + config.serviceKey, "Content-Type": "application/json" },
    body: JSON.stringify({ p_tenant: ownerId, p_patch: patch })
  });
  if (!saved.ok) throw new Error("plan_catalog_write_failed");
  const confirmed = await saved.json() as Record<string,unknown>;
  for (const [key,value] of Object.entries(patch)) {
    if (!isDeepStrictEqual(JSON.parse(JSON.stringify(confirmed?.[key] ?? null)), JSON.parse(JSON.stringify(value)))) throw new Error("plan_catalog_write_unconfirmed");
  }
  if (plansToSave) inMemoryPlansCatalog = plansToSave;
  if (nextDrafts) inMemoryPlanDrafts = nextDrafts;
}

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
        const normalized = (parsed as CrmPlan[]).map(normalizeCatalogPlan);
        normalized.forEach(validateCommercialPlan);
        if (new Set(normalized.map(p => p.id)).size !== normalized.length) throw new Error("duplicate_catalog_plan");
        // If any plan was upgraded from legacy schema, persist the normalized v2 catalog back to Redis
        const hadLegacy = (parsed as CrmPlan[]).some(p => !p.catalogSchemaVersion || p.catalogSchemaVersion < CATALOG_SCHEMA_VERSION);
        if (hadLegacy) {
          await redis.set("crm:master:plans", JSON.stringify(normalized)).catch(() => {});
        }
                const map = new Map<string, CrmPlan>();
        for (const base of MANDATORY_BASE_PLANS) {
          map.set(base.id, base);
        }
        for (const p of normalized) {
          map.set(p.id, p);
        }
        return Array.from(map.values());
      }
      throw new Error("invalid_plan_catalog");
    }
  } catch (err) {
    if (providedRedis) {
      throw new Error("plan_catalog_unavailable", { cause: err });
    }
  } finally {
    if (ownsConnection && !providedRedis) redis.disconnect();
  }

  return await getMasterPlansFromSupabase();
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
  if (Object.keys(result).length > 0) return result;
  return await getMasterPlanDraftsFromSupabase();
}

/**
 * Discard a draft for a specific plan
 */
export async function discardPlanDraft(planId: string, actor = "master_admin", providedRedis?: Redis): Promise<boolean> {
  const redis = getRedis(providedRedis);
  let ownsConnection = false;
  let redisAvailable = false;
  try {
    if (redis.status !== "ready" && redis.status !== "connecting") {
      await redis.connect();
      ownsConnection = true;
    }
    redisAvailable = redis.status === "ready" || redis.status === "connecting";
  } catch (connErr) {
    if (providedRedis) throw connErr;
    redisAvailable = false;
  }

  try {
    if (!providedRedis) await saveMasterPlansToSupabase(undefined, undefined, planId);
    if (redisAvailable) {
      try {
        await redis.hdel("crm:master:plans:drafts", planId);
      } catch (err) {
        if (providedRedis) throw err;
      }
    }
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
 * Permanently delete a plan from the published catalog and remove any associated drafts.
 * Protects official base plans (crm-trial and crm-premium).
 */
export async function deleteMasterPlan(
  planId: string,
  actor = "master_admin",
  providedRedis?: Redis
): Promise<{ success: boolean; deletedPlanId: string; plans: CrmPlan[] }> {
  if (!planId || typeof planId !== "string") {
    throw new Error("ID do plano inválido.");
  }

  if (planId === "crm-trial" || planId === "crm-premium") {
    throw new Error("Os planos oficiais base (Teste Grátis e CRM Premium) são obrigatórios do sistema e não podem ser excluídos.");
  }

  const redis = getRedis(providedRedis);
  let ownsConnection = false;
  let redisAvailable = false;
  try {
    if (redis.status !== "ready" && redis.status !== "connecting") {
      await redis.connect();
      ownsConnection = true;
    }
    redisAvailable = redis.status === "ready" || redis.status === "connecting";
  } catch (connErr) {
    if (providedRedis) throw connErr;
    redisAvailable = false;
  }

  try {
    const currentPlans = await getMasterPlans(providedRedis);
    const targetPlan = currentPlans.find(p => p.id === planId);

    if (!targetPlan) {
      const discarded = await discardPlanDraft(planId, actor, providedRedis);
      if (discarded) {
        return { success: true, deletedPlanId: planId, plans: currentPlans };
      }
      throw new Error("Plano não encontrado no catálogo.");
    }

    const nextPublishedPlans = currentPlans.filter(p => p.id !== planId);

    if (!providedRedis) {
      await saveMasterPlansToSupabase(nextPublishedPlans, undefined, planId);
    }

    if (redisAvailable) {
      try {
        await redis.set("crm:master:plans", JSON.stringify(nextPublishedPlans));
        await redis.hdel("crm:master:plans:drafts", planId);
      } catch (err) {
        if (providedRedis) throw err;
      }
    }

    inMemoryPlansCatalog = nextPublishedPlans;
    if (inMemoryPlanDrafts && inMemoryPlanDrafts[planId]) {
      delete inMemoryPlanDrafts[planId];
    }

    await recordPlanAudit({
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      actor,
      planId,
      planName: targetPlan.name,
      action: "delete",
      vigencia: "immediate",
      newValues: { status: "inactive" },
      affectedTenantsCount: 0,
      affectedTenants: [],
      timestamp: new Date().toISOString()
    }, providedRedis);

    return {
      success: true,
      deletedPlanId: planId,
      plans: nextPublishedPlans
    };
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
  vigenciaInput: "immediate" | "new_clients" | "next_cycle" | "next_renewal" = "immediate",
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
  const vigencia = normalizePlanVigencia(vigenciaInput);
  const currentPublishedPlans = await getMasterPlans(providedRedis);
  const index = currentPublishedPlans.findIndex(p => p.id === planInput.id);
  const previousPlan = index >= 0 ? { ...currentPublishedPlans[index] } : undefined;
  const fallbackDefault = ALL_DEFAULT_PLANS.find(p => p.id === planInput.id) || DEFAULT_PLANS[0];

  const targetPlan: CrmPlan = {
    id: planInput.id,
    name: ALL_DEFAULT_PLANS.find(p => p.id === planInput.id)?.name || planInput.name || previousPlan?.name || fallbackDefault.name,
    price: planInput.price || previousPlan?.price || fallbackDefault.price,
    quotaLimit: typeof planInput.quotaLimit === "number" ? planInput.quotaLimit : (previousPlan?.quotaLimit || fallbackDefault.quotaLimit),
    maxOperators: typeof planInput.maxOperators === "number" ? planInput.maxOperators : (previousPlan?.maxOperators || fallbackDefault.maxOperators),
    maxWhatsappConnections: typeof planInput.maxWhatsappConnections === "number" ? planInput.maxWhatsappConnections : (previousPlan?.maxWhatsappConnections || fallbackDefault.maxWhatsappConnections),
    description: planInput.description ?? (previousPlan?.description || fallbackDefault.description),
    features: normalizeFeatureIds(Array.isArray(planInput.features) ? planInput.features : (previousPlan?.features || [...START_FEATURES])),
    featureBullets: Array.isArray(planInput.featureBullets) ? planInput.featureBullets : (previousPlan?.featureBullets || fallbackDefault.featureBullets),
    status: planInput.status || previousPlan?.status || "active",
    isPopular: planInput.isPopular !== undefined ? planInput.isPopular : previousPlan?.isPopular,
    version: mode === "apply" ? (previousPlan?.version || 0) + 1 : (previousPlan?.version || 1),
    catalogSchemaVersion: CATALOG_SCHEMA_VERSION,
    updated_at: new Date().toISOString()
  };

  validateCommercialPlan(targetPlan);
  const officialTier = ALL_DEFAULT_PLANS.find(p => p.id === targetPlan.id);
  if (officialTier && (targetPlan.maxOperators > officialTier.maxOperators || targetPlan.maxWhatsappConnections > officialTier.maxWhatsappConnections)) throw new Error("plan_tier_limit_exceeded");
  if (targetPlan.id === "crm-trial") {
    targetPlan.price = "0,00";
    targetPlan.quotaLimit = 100;
  }
  if (mode !== "draft" && mode !== "apply") throw new Error("invalid_plan_mode");
  if (mode === "apply") {
    const config = getSupabaseConfig();
    if (!config.url || !config.serviceKey) throw new Error("plan_service_not_configured");
  }

  // Ensure mandatory core features are always included
  if (!targetPlan.features.includes("ai_chat")) targetPlan.features.unshift("ai_chat");
  if (!targetPlan.features.includes("human_handoff")) targetPlan.features.push("human_handoff");

  const redis = getRedis(providedRedis);
  let ownsConnection = false;
  let redisAvailable = false;
  try {
    if (redis.status !== "ready" && redis.status !== "connecting") {
      await redis.connect();
      ownsConnection = true;
    }
    redisAvailable = redis.status === "ready" || redis.status === "connecting";
  } catch (connErr) {
    if (providedRedis) throw connErr;
    redisAvailable = false;
  }

  try {
    // 1. DRAFT MODE: Save strictly to drafts hash. NEVER touch published catalog.
    if (mode === "draft") {
      const draftToSave: CrmPlan = {
        ...targetPlan,
        isDraft: true
      };
      if (!providedRedis) await saveMasterPlansToSupabase(undefined, { id: targetPlan.id, plan: draftToSave });
      if (redisAvailable) {
        try {
          await redis.hset("crm:master:plans:drafts", targetPlan.id, JSON.stringify(draftToSave));
        } catch (err) {
          if (providedRedis) throw err;
        }
      }

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

    if (!providedRedis) await saveMasterPlansToSupabase(nextPublishedPlans, undefined, targetPlan.id);
    if (redisAvailable) {
      try {
        await redis.set("crm:master:plans", JSON.stringify(nextPublishedPlans));
        await redis.hdel("crm:master:plans:drafts", targetPlan.id);
      } catch (err) {
        if (providedRedis) throw err;
      }
    }
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
        // Skip Matriz or any record without valid JSON settings
        if (!s.business_description?.trim().startsWith("{")) {
          continue;
        }

        let parsed: StoredTenantConfig;
        try {
          parsed = JSON.parse(s.business_description);
        } catch {
          continue;
        }

        const tenantPlan = parsed.plan;
        if (!tenantPlan || (!tenantPlan.planId && !tenantPlan.name)) {
          continue;
        }

        const isMatchingPlan = tenantPlan?.planId === targetPlan.id || (!tenantPlan?.planId && String(tenantPlan?.name || "").toLowerCase() === String(previousPlan?.name || targetPlan.name).toLowerCase());
        if (!isMatchingPlan) continue;

        affectedTenants.push(s.tenant_id);

        try {
          const hasCustomQuota = tenantPlan?.customQuotaOverride !== undefined && tenantPlan?.customQuotaOverride !== null && !Number.isNaN(Number(tenantPlan?.customQuotaOverride));

          if (vigencia === "immediate") {
            if (!hasCustomQuota) {
              tenantPlan.quotaLimit = targetPlan.quotaLimit;
            }
            tenantPlan.planId = targetPlan.id;
            tenantPlan.name = targetPlan.name;
            tenantPlan.price = targetPlan.price;
            tenantPlan.contractedPlan = {
              quotaLimit: targetPlan.quotaLimit,
              features: targetPlan.features,
              price: targetPlan.price,
              maxOperators: targetPlan.maxOperators,
              maxWhatsappConnections: targetPlan.maxWhatsappConnections,
              version: targetPlan.version,
              contractedAt: new Date().toISOString()
            };
            delete tenantPlan.pendingPlanUpdate;
            parsed.plan = tenantPlan;

            await replaceTenantPlan(s.tenant_id, tenantPlan, url, serviceKey);

            const effectiveQuota = hasCustomQuota ? Number(tenantPlan.customQuotaOverride) : targetPlan.quotaLimit;
            await syncTenantUsageLimits(s.tenant_id, effectiveQuota, url, serviceKey);
            await syncWhatsappChannelsForPlanLimit(s.tenant_id, targetPlan.maxWhatsappConnections, url, serviceKey);
            await enforceTenantOperatorLimit(s.tenant_id, targetPlan.maxOperators, url, serviceKey);
            await invalidateEffectivePlanCache(s.tenant_id, providedRedis);

            succeededTenants.push(s.tenant_id);
          } else if (vigencia === "new_clients") {
            // NEW CLIENTS ONLY: Freeze existing client's contractedPlan so they never inherit new master limits automatically
            if (!tenantPlan.contractedPlan) {
              tenantPlan.contractedPlan = {
                quotaLimit: hasCustomQuota ? Number(tenantPlan.customQuotaOverride) : (previousPlan?.quotaLimit || tenantPlan.quotaLimit || fallbackDefault.quotaLimit),
                features: previousPlan?.features || [...START_FEATURES],
                price: previousPlan?.price || tenantPlan.price || fallbackDefault.price,
                maxOperators: previousPlan?.maxOperators || fallbackDefault.maxOperators,
                maxWhatsappConnections: previousPlan?.maxWhatsappConnections || fallbackDefault.maxWhatsappConnections,
                version: previousPlan?.version || 1,
                contractedAt: tenantPlan.contractedAt || new Date().toISOString()
              };
              parsed.plan = tenantPlan;

              await replaceTenantPlan(s.tenant_id, tenantPlan, url, serviceKey);
            }

            await invalidateEffectivePlanCache(s.tenant_id, providedRedis);
            succeededTenants.push(s.tenant_id);
          } else if (vigencia === "next_cycle") {
            const dueDate = typeof tenantPlan.dueDate === "string" && tenantPlan.dueDate
              ? tenantPlan.dueDate
              : new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

            if (!tenantPlan.contractedPlan) {
              const old = previousPlan || fallbackDefault;
              tenantPlan.contractedPlan = { quotaLimit: hasCustomQuota ? Number(tenantPlan.customQuotaOverride) : old.quotaLimit, features: [...old.features], price: old.price, maxOperators: old.maxOperators, maxWhatsappConnections: old.maxWhatsappConnections, version: old.version, contractedAt: new Date().toISOString() };
            }
            parsePlanEffectiveDate(dueDate);
            tenantPlan.pendingPlanUpdate = {
              planId: targetPlan.id,
              quotaLimit: targetPlan.quotaLimit,
              features: targetPlan.features,
              price: targetPlan.price,
              maxOperators: targetPlan.maxOperators,
              maxWhatsappConnections: targetPlan.maxWhatsappConnections,
              planVersion: targetPlan.version,
              effectiveAt: dueDate
            };
            parsed.plan = tenantPlan;

            await replaceTenantPlan(s.tenant_id, tenantPlan, url, serviceKey);

            await invalidateEffectivePlanCache(s.tenant_id, providedRedis);
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

  if (hasFailures) {
    const alertWebhookUrl = process.env.CRM_ALERT_WEBHOOK_URL?.trim();
    if (alertWebhookUrl) {
      try {
        await fetch(alertWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "plan_sync_partial_failure",
            planId: targetPlan.id,
            planName: targetPlan.name,
            vigencia,
            failedTenants,
            succeededTenantsCount: succeededTenants.length,
            timestamp: new Date().toISOString()
          })
        });
      } catch (alertErr) {
        console.warn("[plans] Failed to dispatch operational webhook alert:", alertErr);
      }
    }
  }

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
 * Invalidate the cached EffectiveTenantPlan in Redis so changes take effect immediately.
 */
export async function invalidateEffectivePlanCache(tenantId: string, providedRedis?: Redis): Promise<void> {
  if (!tenantId) return;
  const rConn = getRedis(providedRedis);
  let owns = false;
  try {
    if (rConn.status !== "ready" && rConn.status !== "connecting") {
      await rConn.connect();
      owns = true;
    }
    await rConn.del(`crm:tenant:effective_plan:${tenantId}`);
  } catch {} finally {
    if (owns && !providedRedis) rConn.disconnect();
  }
}

/**
 * Sync Supabase crm_usage_limits table for hard stop quota enforcement.
 * Validates HTTP status and throws on failures (fail-closed).
 */
export async function syncTenantUsageLimits(tenantId: string, quotaLimit: number, url?: string, serviceKey?: string): Promise<void> {
  const config = url && serviceKey ? { url, serviceKey } : getSupabaseConfig();
  if (!config.url || !config.serviceKey) throw new Error("plan_service_not_configured");

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
export async function getEffectiveTenantPlan(
  tenantId: string,
  arg2?: Redis | string,
  arg3?: Redis | string
): Promise<EffectiveTenantPlan> {
  let providedRedis: Redis | undefined;
  let mockSettingsJson: string | undefined;

  if (typeof arg2 === "string") {
    mockSettingsJson = arg2;
    providedRedis = arg3 && typeof arg3 === "object" ? (arg3 as Redis) : undefined;
  } else if (typeof arg2 === "object") {
    providedRedis = arg2 as Redis;
    mockSettingsJson = typeof arg3 === "string" ? arg3 : undefined;
  }

  // Authorization always reads current settings and the published catalog.
  // Cached projections must never keep a suspension or downgrade from taking effect.
  // 2. Fetch published master plans (never drafts!)
  const masterPlans = await getMasterPlans(providedRedis);
  const { url, serviceKey } = getSupabaseConfig();

  let rawTenantPlan: StoredTenantPlan = {};
  let parsedRoot: StoredTenantConfig = {};
  let durableAttendanceUsed = 0;
  let isSuspended = false;
  let suspensionReason = "";
  let publicSuspensionReason: string | undefined;
  let internalSuspensionNote: string | undefined;

  if (mockSettingsJson) {
    const parsed = JSON.parse(mockSettingsJson);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid_tenant_plan");
    parsedRoot = parsed;
    rawTenantPlan = parsed.plan || parsed;
  } else {
    if (!url || !serviceKey) throw new Error("plan_service_not_configured");
    const due = await fetch(url + "/rest/v1/rpc/crm_apply_due_plan", {
      method: "POST", headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
      body: JSON.stringify({ p_tenant: tenantId }), cache: "no-store", signal: AbortSignal.timeout(7000)
    });
    if (!due.ok) throw new Error("due_plan_lookup_failed");
    const [rSettings, rTenant] = await Promise.all([
      fetch(url + `/rest/v1/crm_tenant_settings?tenant_id=eq.${tenantId}&limit=1`, {
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey }, cache: "no-store", signal: AbortSignal.timeout(7000)
      }),
      fetch(url + `/rest/v1/crm_tenants?id=eq.${tenantId}&select=status,name&limit=1`, {
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey }, cache: "no-store", signal: AbortSignal.timeout(7000)
      })
    ]);
    if (!rSettings.ok || !rTenant.ok) throw new Error("tenant_plan_lookup_failed");
    const settings = await rSettings.json() as Array<{ business_description: string }>;
    const tenants = await rTenant.json() as Array<{ status: string; name?: string }>;
    if (settings.length !== 1 || tenants.length !== 1) throw new Error("tenant_plan_not_found");
    const rawDesc = settings[0]?.business_description;
    if (typeof rawDesc !== "string" || !rawDesc.trim().startsWith("{")) throw new Error("invalid_tenant_settings");
    parsedRoot = JSON.parse(rawDesc);
    if (!parsedRoot || typeof parsedRoot !== "object" || Array.isArray(parsedRoot)) throw new Error("invalid_tenant_settings");
    rawTenantPlan = parsedRoot.plan || {};
    if (tenants[0].status !== "active") {
      isSuspended = true;
      suspensionReason = tenants[0].status === "suspended" ? "admin_suspended" : "tenant_inactive";
    }
    const ownId = process.env.CRM_MASTER_OWN_TENANT_ID?.trim();
    const isOwnTenant = ownId ? tenantId === ownId : tenants[0].name?.trim().toLowerCase() === "novaesweb";
    if (!rawTenantPlan.planId && !rawTenantPlan.name && isOwnTenant) {
      rawTenantPlan = { planId: "crm-premium", name: "CRM Premium", status: "paid", autoBlock: false };
    }
  }

  if (parsedRoot.suspension && typeof parsedRoot.suspension === "object") {
    if (typeof parsedRoot.suspension.publicReason === "string" && parsedRoot.suspension.publicReason.trim()) {
      publicSuspensionReason = parsedRoot.suspension.publicReason.trim();
    }
    if (typeof parsedRoot.suspension.internalNote === "string" && parsedRoot.suspension.internalNote.trim()) {
      internalSuspensionNote = parsedRoot.suspension.internalNote.trim();
    }
    if (parsedRoot.suspension.isSuspended === true) {
      isSuspended = true;
      if (!suspensionReason) suspensionReason = "admin_suspended";
    }
  }
  if (typeof rawTenantPlan.publicSuspensionReason === "string" && rawTenantPlan.publicSuspensionReason.trim()) {
    publicSuspensionReason = rawTenantPlan.publicSuspensionReason.trim();
  }
  if (typeof rawTenantPlan.internalSuspensionNote === "string" && rawTenantPlan.internalSuspensionNote.trim()) {
    internalSuspensionNote = rawTenantPlan.internalSuspensionNote.trim();
  }

  const now = new Date();
  const monthParts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).formatToParts(now);
  const monthKey = `${monthParts.find(p => p.type === "year")!.value}-${monthParts.find(p => p.type === "month")!.value}`;

  // 3. Check for Trial vs Paid Plan
  const isTrial = Boolean(rawTenantPlan.isTrial || rawTenantPlan.planId === "crm-trial" || rawTenantPlan.status === "trial");
  let trialStartedAt: string | undefined;
  let trialExpiresAt: string | undefined;
  let trialDaysLeft = 0;
  let trialStatus: "active" | "expiring_soon" | "expired" | "quota_exhausted" | "converted" | undefined;
  let quotaUsed = 0;
  if (!mockSettingsJson) {
    const usagePeriod = isTrial ? "trial" : monthKey;
    const usage = await fetch(url + "/rest/v1/crm_attendance_usage?select=used&tenant_id=eq." + tenantId + "&period_key=eq." + usagePeriod, {
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey }, cache: "no-store", signal: AbortSignal.timeout(7000)
    });
    if (!usage.ok) throw new Error("quota_usage_lookup_failed");
    const rows = await usage.json() as Array<{used:number}>;
    if (rows.length > 1 || rows.some(r => !Number.isInteger(r.used) || r.used < 0)) throw new Error("quota_usage_invalid");
    durableAttendanceUsed = rows[0]?.used || 0;
  }

  // Read quotaUsed from Redis + durable fallback in parsedRoot.usageCounters
  const durableTrialUsed = Number(parsedRoot?.usageCounters?.trialUsed ?? rawTenantPlan?.trialQuotaUsed ?? 0) || 0;
  const durableMonthUsed = Number(parsedRoot?.usageCounters?.monthly?.[monthKey] ?? rawTenantPlan?.monthlyQuotaUsed?.[monthKey] ?? 0) || 0;

  let redisRechargesConsumed = 0;
  try {
    const rConn = getRedis(providedRedis);
    let owns = false;
    if (rConn.status !== "ready" && rConn.status !== "connecting") {
      await rConn.connect();
      owns = true;
    }
    if (isTrial) {
      const u = await rConn.get(`crm:quota:trial:${tenantId}`);
      quotaUsed = Math.max(parseInt(u || "0", 10), durableTrialUsed, durableAttendanceUsed);
    } else {
      const u = await rConn.get(`crm:quota:${tenantId}:${monthKey}`);
      quotaUsed = Math.max(parseInt(u || "0", 10), durableMonthUsed, durableAttendanceUsed);
    }
    const rConsumed = await rConn.get(`crm:recharges:consumed:${tenantId}`);
    if (rConsumed) {
      redisRechargesConsumed = Math.max(0, parseInt(rConsumed, 10) || 0);
    }
    if (owns && !providedRedis) rConn.disconnect();
  } catch {
    quotaUsed = Math.max(durableAttendanceUsed, isTrial ? durableTrialUsed : durableMonthUsed);
  }

  let matchedPlan: CrmPlan;

  if (isTrial) {
    matchedPlan = masterPlans.find(p => p.id === "crm-trial") || TRIAL_PLAN;
    trialStartedAt = typeof rawTenantPlan.trialStartedAt === "string" ? rawTenantPlan.trialStartedAt : undefined;
    if (!trialStartedAt || !Number.isFinite(Date.parse(trialStartedAt))) throw new Error("invalid_trial_start");
    trialExpiresAt = typeof rawTenantPlan.trialExpiresAt === "string"
      ? rawTenantPlan.trialExpiresAt
      : new Date(new Date(trialStartedAt).getTime() + 7 * 86400000).toISOString();

    if (!Number.isFinite(Date.parse(trialExpiresAt)) || Date.parse(trialExpiresAt) > Date.parse(trialStartedAt) + 7 * 86400000) throw new Error("invalid_trial_expiry");
    const diffMs = new Date(trialExpiresAt).getTime() - now.getTime();
    trialDaysLeft = Math.max(0, Math.ceil(diffMs / 86400000));

    if (now >= new Date(trialExpiresAt)) {
      trialStatus = "expired";
      isSuspended = true;
      if (!suspensionReason) suspensionReason = "trial_expired";
      if (!publicSuspensionReason) {
        publicSuspensionReason = "Seu período de Teste Grátis (7 dias) terminou. Seus dados estão preservados — escolha um plano para continuar.";
      }
    } else if (quotaUsed >= (matchedPlan.quotaLimit || 50)) {
      trialStatus = "quota_exhausted";
      isSuspended = true;
      if (!suspensionReason) suspensionReason = "trial_quota_exhausted";
      if (!publicSuspensionReason) {
        publicSuspensionReason = "Você atingiu o limite de mensagens da IA do Teste Grátis. Seus dados estão preservados — faça upgrade para continuar.";
      }
    } else if (trialDaysLeft <= 3) {
      trialStatus = "expiring_soon";
    } else {
      trialStatus = "active";
    }
  } else {
    const planId = typeof rawTenantPlan.planId === "string" ? rawTenantPlan.planId : "";
    const planName = typeof rawTenantPlan.name === "string" ? rawTenantPlan.name : "";
    matchedPlan = (planId ? masterPlans.find(p => p.id === planId) : masterPlans.find(p => p.name.toLowerCase() === planName.toLowerCase())) as CrmPlan;
    if (!matchedPlan) throw new Error("tenant_plan_unknown");
  }

  // 4. Check for lifecycle states: pendingPlanUpdate vs contractedPlan vs master catalog
  let baseQuota = matchedPlan.quotaLimit;
  let baseFeatures: FeatureId[] = [...matchedPlan.features];
  let basePrice = matchedPlan.price;
  let baseMaxOperators = matchedPlan.maxOperators || 1;
  let baseMaxWhatsapp = matchedPlan.maxWhatsappConnections || 1;
  let isContractFrozen = false;
  let contractedVersion: number | undefined;

  const pendingUpdate = rawTenantPlan.pendingPlanUpdate as PendingPlanUpdate | undefined;
  const contractedSnapshot = rawTenantPlan.contractedPlan as ContractedSnapshot | undefined;

  if (!isTrial) {
    if (pendingUpdate) {
      const effectiveDate = parsePlanEffectiveDate(pendingUpdate.effectiveAt);
      if (now < effectiveDate && !contractedSnapshot) throw new Error("missing_frozen_plan_snapshot");
      if (now >= effectiveDate) {
        baseQuota = pendingUpdate.quotaLimit;
        baseFeatures = [...pendingUpdate.features];
        basePrice = pendingUpdate.price;
        if (pendingUpdate.maxOperators) baseMaxOperators = pendingUpdate.maxOperators;
        if (pendingUpdate.maxWhatsappConnections) baseMaxWhatsapp = pendingUpdate.maxWhatsappConnections;
        contractedVersion = pendingUpdate.planVersion;
      } else if (contractedSnapshot) {
        baseQuota = contractedSnapshot.quotaLimit;
        baseFeatures = [...contractedSnapshot.features];
        baseMaxOperators = contractedSnapshot.maxOperators ?? baseMaxOperators;
        baseMaxWhatsapp = contractedSnapshot.maxWhatsappConnections ?? baseMaxWhatsapp;
        basePrice = contractedSnapshot.price;
        contractedVersion = contractedSnapshot.version;
        isContractFrozen = true;
      }
    } else if (contractedSnapshot) {
      baseQuota = contractedSnapshot.quotaLimit;
      baseFeatures = [...contractedSnapshot.features];
      baseMaxOperators = contractedSnapshot.maxOperators ?? baseMaxOperators;
      baseMaxWhatsapp = contractedSnapshot.maxWhatsappConnections ?? baseMaxWhatsapp;
      basePrice = contractedSnapshot.price;
      contractedVersion = contractedSnapshot.version;
      isContractFrozen = true;
    }
  }

  // A stored contract may preserve a smaller allowance, but never grant a
  // resource or connection that is absent from the currently published plan.
  // This also removes legacy Premium permissions left on a Business snapshot.
  const tierCeiling = ALL_DEFAULT_PLANS.find(p => p.id === matchedPlan.id) || matchedPlan;
  const allowance = pendingUpdate && now < parsePlanEffectiveDate(pendingUpdate.effectiveAt) ? tierCeiling : matchedPlan;
  baseFeatures = normalizeFeatureIds(baseFeatures).filter(feature => allowance.features.includes(feature));
  baseMaxOperators = Math.min(baseMaxOperators, allowance.maxOperators, tierCeiling.maxOperators);
  if (matchedPlan.id === "crm-premium" || isTrial) {
    baseMaxOperators = Math.max(baseMaxOperators, matchedPlan.maxOperators || 3);
  }
  baseMaxWhatsapp = Math.min(baseMaxWhatsapp, allowance.maxWhatsappConnections, tierCeiling.maxWhatsappConnections);
  validateCommercialPlan({ id: matchedPlan.id, name: matchedPlan.name, quotaLimit: baseQuota, maxOperators: baseMaxOperators, maxWhatsappConnections: baseMaxWhatsapp, features: baseFeatures });

  // 5. Contractual exception overrides (highest priority for quota)
  const customQuotaRaw = rawTenantPlan.customQuotaOverride;
  const hasCustomQuota = customQuotaRaw !== undefined && customQuotaRaw !== null && !Number.isNaN(Number(customQuotaRaw));
  const finalQuota = (!isTrial && hasCustomQuota) ? Number(customQuotaRaw) : baseQuota;
  if (!Number.isInteger(finalQuota) || finalQuota < 0 || finalQuota > 1000000) throw new Error("invalid_plan_quota");

  const customFeaturesRaw = rawTenantPlan.customFeaturesOverride;
  const hasCustomFeatures = Array.isArray(customFeaturesRaw) && customFeaturesRaw.length > 0;
  const permittedCustomFeatures = hasCustomFeatures
    ? (customFeaturesRaw as FeatureId[]).filter(feature => allowance.features.includes(feature))
    : [];
  const finalFeatures: FeatureId[] = (!isTrial && hasCustomFeatures)
    ? Array.from(new Set([...baseFeatures, ...permittedCustomFeatures]))
    : baseFeatures;

  if (finalFeatures.some(f => !TECHNICAL_FEATURES.some(known => known.id === f))) throw new Error("invalid_plan_features");

  // 6. Check due date and payment status
  const dueDate = isTrial
    ? (trialExpiresAt || new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10))
    : (typeof rawTenantPlan.dueDate === "string" ? rawTenantPlan.dueDate : new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
  parsePlanEffectiveDate(dueDate);
  const paymentStatus = isTrial ? "trial" : (rawTenantPlan.status === "pending" ? "pending" : "paid");
  const autoBlock = rawTenantPlan.autoBlock !== false;
  const graceDaysRaw = Number((rawTenantPlan as { graceDays?: unknown }).graceDays);
  const graceDays = Number.isFinite(graceDaysRaw) && graceDaysRaw > 0 ? Math.min(60, Math.floor(graceDaysRaw)) : 0;
  const isOverdue = !isTrial && autoBlock && paymentStatus !== "paid" && new Date(dueDate).getTime() + graceDays * 86400000 < now.getTime();

  if (isOverdue) {
    isSuspended = true;
    if (!suspensionReason) suspensionReason = "payment_overdue";
    if (!publicSuspensionReason) {
      publicSuspensionReason = "Sua fatura está vencida. Regularize o pagamento para reativar os disparos automáticos da IA.";
    }
  }

  const maintenanceFeatures: FeatureId[] = Array.isArray(parsedRoot.maintenanceFeatures)
    ? parsedRoot.maintenanceFeatures
    : [];

  const featureStates = buildFeatureGovernanceMap(
    finalFeatures,
    isSuspended,
    publicSuspensionReason || suspensionReason,
    maintenanceFeatures,
    masterPlans
  );

  // Consumo do mes alem do que o plano cobre = recarga em uso.
  const monthUsedForRecharge = isTrial ? 0 : Math.max(
    Number((parsedRoot.usageCounters as Record<string, Record<string, number>> | undefined)?.monthly?.[monthKey] ?? 0) || 0,
    durableAttendanceUsed,
    quotaUsed
  );
  const rechargesUsedFromUsage = isTrial ? 0 : Math.max(0, monthUsedForRecharge - finalQuota);

  const rawRecharges: MessageRechargeItem[] = Array.isArray(parsedRoot.recharges) ? (parsedRoot.recharges as unknown as MessageRechargeItem[]) : [];
  const paidRecharges = rawRecharges.filter(r => r.status === "paid");
  const totalRechargeCreditsAdded = paidRecharges.reduce((sum, r) => sum + (Number(r.messagesAdded) || 0), 0);
  // A recarga so e consumida DEPOIS que a franquia do plano acaba
  // (migration 20261111170000). Antes, o saldo nunca diminuia porque ninguem
  // gravava o consumo em crm:recharges:consumed.
  const durableRechargesConsumed = Number((parsedRoot.usageCounters as Record<string, unknown> | undefined)?.rechargesConsumed) || 0;
  const rechargesConsumed = Math.max(durableRechargesConsumed, redisRechargesConsumed, rechargesUsedFromUsage);
  const rechargeCreditsBalance = Math.max(0, totalRechargeCreditsAdded - rechargesConsumed);

  const effective: EffectiveTenantPlan = {
    tenantId,
    planId: matchedPlan.id,
    planName: matchedPlan.name,
    price: isTrial ? "0,00" : basePrice,
    quotaLimit: isTrial ? (matchedPlan.quotaLimit || 100) : finalQuota,
    maxOperators: isTrial ? (matchedPlan.maxOperators || 2) : baseMaxOperators,
    maxWhatsappConnections: isTrial ? (matchedPlan.maxWhatsappConnections || 2) : baseMaxWhatsapp,
    rechargeCreditsBalance,
    rechargesHistory: rawRecharges as unknown as MessageRechargeItem[],
    allowedFeatures: finalFeatures.filter(feature => featureStates[feature]?.state === "allowed"),
    featureStates,
    dueDate,
    status: isTrial ? "trial" : paymentStatus,
    autoBlock,
    isOverdue,
    isSuspended,
    suspensionReason,
    publicSuspensionReason,
    internalSuspensionNote,
    hasCustomOverride: !isTrial && (hasCustomQuota || hasCustomFeatures),
    customOverride: (!isTrial && (hasCustomQuota || hasCustomFeatures)) ? {
      quotaLimit: hasCustomQuota ? Number(customQuotaRaw) : undefined,
      features: hasCustomFeatures ? (customFeaturesRaw as FeatureId[]) : undefined,
      reason: typeof rawTenantPlan.exceptionReason === "string" ? rawTenantPlan.exceptionReason : undefined
    } : undefined,
    contractedVersion,
    isContractFrozen,
    pendingUpdate: !isTrial && pendingUpdate && now < parsePlanEffectiveDate(pendingUpdate.effectiveAt) ? pendingUpdate : undefined,
    isTrial,
    trialDaysLeft: isTrial ? trialDaysLeft : undefined,
    trialStartedAt: isTrial ? trialStartedAt : undefined,
    trialExpiresAt: isTrial ? trialExpiresAt : undefined,
    trialStatus: isTrial ? trialStatus : undefined,
    quotaUsed,
    quotaPeriod: isTrial ? "trial" : monthKey
  };

  // 7. Cache in Redis for 60s
  if (!mockSettingsJson) {
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
  }

  return effective;
}

/**
 * Centralized backend guard to enforce plan permissions and suspension state on any API route.
 */
export async function requireTenantFeature(
  tenantId: string,
  featureId: FeatureId,
  providedRedis?: Redis
): Promise<{
  allowed: boolean;
  state: FeatureAccessState;
  statusHttp: number;
  errorCode?: string;
  message?: string;
  effectivePlan: EffectiveTenantPlan;
}> {
  const effectivePlan = await getEffectiveTenantPlan(tenantId, providedRedis);
  const gov = effectivePlan.featureStates?.[featureId];

  if (effectivePlan.isSuspended) {
    return {
      allowed: false,
      state: "suspended",
      statusHttp: 403,
      errorCode: "ACCOUNT_SUSPENDED",
      message: effectivePlan.publicSuspensionReason || "Conta suspensa administrativamente ou período de avaliação encerrado.",
      effectivePlan
    };
  }

  if (gov?.state === "maintenance") {
    return {
      allowed: false,
      state: "maintenance",
      statusHttp: 503,
      errorCode: "FEATURE_MAINTENANCE",
      message: gov.reason || "Este recurso está temporariamente em manutenção técnica.",
      effectivePlan
    };
  }

  // Note: If a tenant has "business_hours" (advanced), they also automatically have "business_hours_basic"
  const isAllowed =
    effectivePlan.allowedFeatures.includes(featureId) ||
    (featureId === "business_hours_basic" && effectivePlan.allowedFeatures.includes("business_hours"));

  if (!isAllowed) {
    const featMeta = TECHNICAL_FEATURES.find(f => f.id === featureId);
    return {
      allowed: false,
      state: "locked_by_plan",
      statusHttp: 403,
      errorCode: "PLAN_FEATURE_LOCKED",
      message: `O recurso "${featMeta?.name || featureId}" não está incluído no seu plano atual (${effectivePlan.planName}). Solicite upgrade para o plano ${gov?.minPlanName || featMeta?.minPlanName || "CRM Business"}.`,
      effectivePlan
    };
  }

  return {
    allowed: true,
    state: "allowed",
    statusHttp: 200,
    effectivePlan
  };
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
    await redis.ltrim("crm:master:plan_history", 0, 99);
  } catch (err) {
    console.warn("[plans] Failed to record plan audit in Redis", err);
  } finally {
    if (ownsConnection && !providedRedis) redis.disconnect();
  }

  // Persistencia duravel da auditoria. Antes o insert omitia tenant_id (NOT NULL)
  // e o catch vazio escondia a falha: crm_audit_events ficou com 0 linhas desde
  // o inicio. Agora usa o tenant dono do catalogo e registra o erro se falhar.
  const { url, serviceKey } = getSupabaseConfig();
  if (url && serviceKey) {
    try {
      const auditTenant = await catalogOwnerId();
      const res = await fetch(url + "/rest/v1/crm_audit_events", {
        method: "POST",
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: auditTenant,
          action: `plan_${entry.action}`,
          entity_type: "crm_plan",
          entity_id: entry.planId,
          entity_label: entry.planName
        }),
        signal: AbortSignal.timeout(4000)
      });
      if (!res.ok) {
        console.warn(`[plans] Audit persist failed HTTP ${res.status} for ${entry.action}/${entry.planId}`);
      }
    } catch (err) {
      console.warn("[plans] Audit persist error", err instanceof Error ? err.message : err);
    }
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

/**
 * Check if a company / store or email is eligible for a 7-day free trial.
 * Prevents repeat trials for the same company or email.
 */
export async function checkTrialEligibility(
  storeName: string,
  email: string,
  providedRedis?: Redis
): Promise<{ eligible: boolean; reason?: string; message?: string }> {
  const normName = storeName.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const normEmail = email.trim().toLowerCase();

  const redis = getRedis(providedRedis);
  let ownsConnection = false;
  try {
    if (redis.status !== "ready" && redis.status !== "connecting") {
      await redis.connect();
      ownsConnection = true;
    }
    const [nameUsed, emailUsed] = await Promise.all([
      redis.get(`crm:trial:registered:store:${normName}`),
      redis.get(`crm:trial:registered:email:${normEmail}`)
    ]);

    if (nameUsed) {
      return { eligible: false, reason: "duplicate_store", message: "Esta empresa já utilizou a avaliação gratuita anteriormente." };
    }
    if (emailUsed) {
      return { eligible: false, reason: "duplicate_email", message: "Este e-mail já foi cadastrado para uma avaliação gratuita." };
    }
    return { eligible: true };
  } catch {
    return { eligible: true };
  } finally {
    if (ownsConnection && !providedRedis) redis.disconnect();
  }
}

/**
 * Record a free trial registration in Redis to prevent multiple trials.
 */
export async function recordTrialRegistration(
  arg1: string,
  arg2: string,
  arg3: string,
  providedRedis?: Redis
): Promise<void> {
  let tenantId = arg1;
  let storeName = arg2;
  let email = arg3;
  if (arg2 && arg2.includes("@")) {
    storeName = arg1;
    email = arg2;
    tenantId = arg3;
  } else if (arg1 && arg1.includes("@")) {
    email = arg1;
    storeName = arg2;
    tenantId = arg3;
  }
  const normName = storeName.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const normEmail = email.trim().toLowerCase();

  const redis = getRedis(providedRedis);
  let ownsConnection = false;
  try {
    if (redis.status !== "ready" && redis.status !== "connecting") {
      await redis.connect();
      ownsConnection = true;
    }
    await Promise.all([
      redis.set(`crm:trial:registered:store:${normName}`, tenantId, "EX", 365 * 86400),
      redis.set(`crm:trial:registered:email:${normEmail}`, tenantId, "EX", 365 * 86400),
      redis.set(`crm:trial:active:${tenantId}`, "1", "EX", 30 * 86400)
    ]);
  } catch {} finally {
    if (ownsConnection && !providedRedis) redis.disconnect();
  }
}

/**
 * Convert a trial tenant to a paid commercial plan without losing data, settings, or connections.
 */
export async function convertTrialToPaidPlan(
  tenantId: string,
  newPlanId: string,
  actor = "master_admin",
  dueDate?: string,
  providedRedis?: Redis
): Promise<{ success: boolean; plan: CrmPlan; error?: string }> {
  const masterPlans = await getMasterPlans(providedRedis);
  const targetPlan = masterPlans.find(p => p.id === newPlanId);
  if (!targetPlan || targetPlan.status !== "active" || targetPlan.id === "crm-trial") throw new Error("tenant_plan_unknown");

  const { url, serviceKey } = getSupabaseConfig();
  if (!url || !serviceKey) {
    return { success: false, plan: targetPlan, error: "Supabase não configurado" };
  }

  try {
    const rSettings = await fetch(url + `/rest/v1/crm_tenant_settings?tenant_id=eq.${tenantId}&limit=1`, {
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
      cache: "no-store"
    });
    if (!rSettings.ok) throw new Error("Falha ao consultar configurações da empresa no Supabase");

    const settingsList = (await rSettings.json()) as Array<{ business_description: string }>;
    let dataObj: StoredTenantConfig = {};
    if (settingsList[0]?.business_description?.startsWith("{")) {
      dataObj = JSON.parse(settingsList[0].business_description);
    }

    const calculatedDueDate = dueDate || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

    dataObj.plan = {
      planId: targetPlan.id,
      name: targetPlan.name,
      price: targetPlan.price,
      quotaLimit: targetPlan.quotaLimit,
      dueDate: calculatedDueDate,
      status: "paid",
      autoBlock: true,
      isTrial: false,
      trialConvertedAt: new Date().toISOString(),
      contractedPlan: {
        quotaLimit: targetPlan.quotaLimit,
        features: targetPlan.features,
        price: targetPlan.price,
        maxOperators: targetPlan.maxOperators,
        maxWhatsappConnections: targetPlan.maxWhatsappConnections,
        version: targetPlan.version,
        contractedAt: new Date().toISOString()
      }
    };

    await replaceTenantPlan(tenantId, dataObj.plan!, url, serviceKey);

    await syncTenantUsageLimits(tenantId, targetPlan.quotaLimit, url, serviceKey);
    await syncWhatsappChannelsForPlanLimit(tenantId, targetPlan.maxWhatsappConnections, url, serviceKey);
    await enforceTenantOperatorLimit(tenantId, targetPlan.maxOperators, url, serviceKey);

    const redis = getRedis(providedRedis);
    let ownsConnection = false;
    try {
      if (redis.status !== "ready" && redis.status !== "connecting") {
        await redis.connect();
        ownsConnection = true;
      }
      await redis.del(`crm:tenant:effective_plan:${tenantId}`);
      await redis.del(`crm:trial:active:${tenantId}`);
    } catch {} finally {
      if (ownsConnection && !providedRedis) redis.disconnect();
    }

    await recordPlanAudit({
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      actor,
      planId: targetPlan.id,
      planName: targetPlan.name,
      action: "apply_bulk",
      vigencia: "immediate",
      newValues: {
        price: targetPlan.price,
        quotaLimit: targetPlan.quotaLimit,
        features: targetPlan.features
      },
      affectedTenantsCount: 1,
      affectedTenants: [tenantId],
      timestamp: new Date().toISOString()
    }, providedRedis);

    return { success: true, plan: targetPlan };
  } catch (err) {
    return { success: false, plan: targetPlan, error: err instanceof Error ? err.message : String(err) };
  }
}

let inMemoryPixConfig: MasterPixConfig | null = null;

export async function getMasterPixConfig(providedRedis?: Redis): Promise<MasterPixConfig> {
  const rConn = getRedis(providedRedis);
  let owns = false;
  try {
    if (rConn.status !== "ready" && rConn.status !== "connecting") {
      await rConn.connect();
      owns = true;
    }
    const cached = await rConn.get("crm:master:pix_config");
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && typeof parsed === "object" && parsed.pixKey) {
        return parsed as MasterPixConfig;
      }
    }
  } catch {} finally {
    if (owns && !providedRedis) rConn.disconnect();
  }

  const config = getSupabaseConfig();
  if (config.url && config.serviceKey) {
    try {
      const ownerId = await catalogOwnerId();
      const response = await fetch(config.url + `/rest/v1/crm_tenant_settings?tenant_id=eq.` + ownerId + `&select=business_description`, {
        headers: { apikey: config.serviceKey, Authorization: "Bearer " + config.serviceKey },
        cache: "no-store", signal: AbortSignal.timeout(6000)
      });
      if (response.ok) {
        const rows = (await response.json()) as Array<{ business_description?: string }>;
        if (rows[0]?.business_description) {
          const root = JSON.parse(rows[0].business_description);
          if (root?.master_pix_config && typeof root.master_pix_config === "object" && root.master_pix_config.pixKey) {
            inMemoryPixConfig = { ...DEFAULT_PIX_CONFIG, ...root.master_pix_config };
            try {
              const r = getRedis(providedRedis);
              let o = false;
              if (r.status !== "ready" && r.status !== "connecting") {
                await r.connect();
                o = true;
              }
              await r.set("crm:master:pix_config", JSON.stringify(inMemoryPixConfig), "EX", 86400);
              if (o && !providedRedis) r.disconnect();
            } catch {}
            return inMemoryPixConfig!;
          }
        }
      }
    } catch {}
  }

  return (inMemoryPixConfig ?? DEFAULT_PIX_CONFIG) as MasterPixConfig;
}

export async function saveMasterPixConfig(update: Partial<MasterPixConfig>, providedRedis?: Redis): Promise<MasterPixConfig> {
  const current = await getMasterPixConfig(providedRedis);
  const nextConfig: MasterPixConfig = {
    keyType: update.keyType || current.keyType || "cnpj",
    pixKey: (update.pixKey || current.pixKey || "").trim(),
    beneficiaryName: (update.beneficiaryName || current.beneficiaryName || "").trim(),
    bankName: (update.bankName || current.bankName || "").trim(),
    city: (update.city || current.city || "São Paulo - SP").trim(),
    instructions: (update.instructions || current.instructions || "").trim(),
    updatedAt: new Date().toISOString()
  };

  if (!nextConfig.pixKey) {
    throw new Error("A chave PIX não pode ser vazia.");
  }
  if (!nextConfig.beneficiaryName) {
    throw new Error("O nome do beneficiário não pode ser vazio.");
  }

  const config = getSupabaseConfig();
  if (!config.url || !config.serviceKey) throw new Error("plan_service_not_configured");
  const ownerId = await catalogOwnerId();

  const patch = { master_pix_config: nextConfig };
  const saved = await fetch(config.url + "/rest/v1/rpc/crm_patch_tenant_config", {
    method: "POST", cache: "no-store", signal: AbortSignal.timeout(8000),
    headers: { apikey: config.serviceKey, Authorization: "Bearer " + config.serviceKey, "Content-Type": "application/json" },
    body: JSON.stringify({ p_tenant: ownerId, p_patch: patch })
  });
  if (!saved.ok) throw new Error("pix_config_save_failed");

  inMemoryPixConfig = nextConfig;

  const rConn = getRedis(providedRedis);
  let owns = false;
  try {
    if (rConn.status !== "ready" && rConn.status !== "connecting") {
      await rConn.connect();
      owns = true;
    }
    await rConn.set("crm:master:pix_config", JSON.stringify(nextConfig), "EX", 86400);
  } catch {} finally {
    if (owns && !providedRedis) rConn.disconnect();
  }

  return nextConfig;
}
