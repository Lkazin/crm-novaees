import type { CrmPlan, FeatureId } from "./plans";

export const ESSENTIAL_FEATURES: FeatureId[] = [
  "ai_chat", "human_handoff", "simulator", "business_hours_basic",
  "quick_replies", "basic_indicators"
];
export const PROFESSIONAL_FEATURES: FeatureId[] = [
  ...ESSENTIAL_FEATURES, "business_hours", "commercial_tags", "handoff_summary",
  "sound_notifications", "model_fallback", "conversation_priority",
  "satisfaction_survey", "commercial_indicators", "advanced_reports",
  "satisfaction_analytics", "operator_indicators", "advanced_commercial_filters"
];

const base = {
  status: "active" as const, version: 1, catalogSchemaVersion: 4,
  updated_at: "2026-11-16T00:00:00.000Z"
};

// Browser-safe catalog shared by Master, client UI and server provisioning.
// Operators are total accesses, including the account holder.
export const COMMERCIAL_PLANS: CrmPlan[] = [
  {
    ...base, id: "crm-trial", name: "Grátis 7 dias", price: "0,00",
    quotaLimit: 50, maxOperators: 1, maxWhatsappConnections: 1,
    description: "Conheça na prática, sem cartão de crédito.",
    features: [...PROFESSIONAL_FEATURES].filter(f => !["advanced_reports", "satisfaction_analytics", "operator_indicators", "advanced_commercial_filters"].includes(f)),
    featureBullets: ["7 dias de acesso gratuito", "50 respostas da IA durante o teste", "1 WhatsApp conectado", "1 operador", "Base de conhecimento e transferência para humano", "Etiquetas e funil de vendas", "Relatórios básicos", "Sem cartão de crédito"]
  },
  {
    ...base, id: "crm-essential", name: "Essencial", price: "79,80",
    quotaLimit: 300, maxOperators: 2, maxWhatsappConnections: 1,
    description: "Para começar a automatizar.", features: [...ESSENTIAL_FEATURES],
    featureBullets: ["300 respostas da IA por mês", "1 WhatsApp conectado", "2 operadores", "Base de conhecimento", "Transferência para humano", "Relatórios básicos", "Suporte padrão"]
  },
  {
    ...base, id: "crm-professional", name: "Profissional", price: "139,90",
    quotaLimit: 1000, maxOperators: 10, maxWhatsappConnections: 3,
    isPopular: true, description: "Para crescer.", features: [...PROFESSIONAL_FEATURES],
    featureBullets: ["1.000 respostas da IA por mês", "3 WhatsApps conectados", "10 operadores", "Base de conhecimento e transferência para humano", "Relatórios completos", "Etiquetas e funil de vendas", "Suporte prioritário"]
  },
  {
    ...base, id: "crm-enterprise", name: "Empresarial", price: "298,00",
    quotaLimit: 1400, maxOperators: 20, maxWhatsappConnections: 5,
    description: "Para operações maiores.", features: [...PROFESSIONAL_FEATURES],
    featureBullets: ["1.400 respostas da IA por mês", "5 WhatsApps conectados", "20 operadores", "Todos os recursos do Profissional", "Suporte prioritário", "Auxílio na configuração"]
  }
];

export const RECHARGE_DESCRIPTION = "100 respostas adicionais da IA por R$ 20";
export const AI_USAGE_DESCRIPTION = "Cada resposta enviada pela IA consome uma mensagem da franquia. Mensagens recebidas e respostas dos operadores humanos não consomem essa franquia.";
