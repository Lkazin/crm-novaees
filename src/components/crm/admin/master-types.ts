// Tipos do Painel Master compartilhados entre src/app/admin/page.tsx e as
// secoes extraidas para src/components/crm/admin/.
//
// Origem: estes tipos eram declarados no topo de src/app/admin/page.tsx.
// Foram movidos para ca (sem alteracao de formato) para que cada secao possa
// ser um componente proprio em vez de um bloco de 400+ linhas dentro do arquivo
// de 7 mil linhas.

export type CrmTab =
  | "whatsapp"
  | "conhecimento"
  | "artigos"
  | "simulador"
  | "horarios"
  | "atendimentos"
  | "equipe"
  | "relatorios"
  | "contatos"
  | "plano"
  | "seguranca";

export type MasterSection =
  | "clients"
  | "plans"
  | "kpis"
  | "providers"
  | "crm"
  | "recharges"
  | "radar"
  | "broadcast"
  | "security"
  | "users";

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

export type PlanItem = {
  id: string;
  name: string;
  price: string;
  quotaLimit: number;
  description: string;
  features: string[];
  allowedFeatures?: FeatureId[];
  maxOperators?: number;
  maxWhatsAppConnections?: number;
  isPopular?: boolean;
  isActive?: boolean;
  isDraft?: boolean;
  hasDraft?: boolean;
  draftPlan?: Partial<Omit<PlanItem, "draftPlan">>;
  enrolledStores?: Array<{
    id: string;
    name: string;
    customQuotaOverride?: number;
    exceptionReason?: string;
  }>;
};

export type MasterClient = {
  id: string;
  name: string;
  slug?: string;
  status: string;
  email: string;
  userId: string | null;
  ownerName?: string;
  businessDetails?: {
    ownerName?: string;
    niche?: string;
    businessWhatsapp?: string;
    document?: string;
    agentName?: string;
  };
  created_at: string;
  instanceName?: string | null;
  whatsappStatus?: string;
  connectedWhatsappCount?: number;
  maxWhatsappConnections?: number;
  whatsappSlots?: Array<{
    slot: number;
    instanceName: string;
    status: string;
    phone?: string;
    unlocked: boolean;
    pausedByDowngrade?: boolean;
  }>;
  operatorsCount?: number;
  maxOperators?: number;
  isMasterOwnTenant?: boolean;
  plan: {
    planId?: string;
    name: string;
    price: string;
    dueDate: string;
    status: "paid" | "pending";
    autoBlock: boolean;
    isOverdue: boolean;
    quotaLimit?: number;
    quotaUsed?: number;
    maxOperators?: number;
    maxWhatsappConnections?: number;
    customQuotaOverride?: number | null;
    exceptionReason?: string | null;
    adminSuspensionReason?: string | null;
    adminInternalNote?: string | null;
    isTrial?: boolean;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};
