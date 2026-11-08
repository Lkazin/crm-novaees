import type { ContractedSnapshot, PendingPlanUpdate } from "./plans";

/** Persisted commercial fields; unknown extension fields remain preserved on updates. */
export type StoredTenantPlan = Record<string, unknown> & {
  planId?: string;
  name?: string;
  price?: string;
  quotaLimit?: number;
  maxOperators?: number;
  maxWhatsappConnections?: number;
  isSuspended?: boolean;
  dueDate?: string;
  contractedAt?: string;
  contractedPlan?: ContractedSnapshot;
  pendingPlanUpdate?: PendingPlanUpdate;
  monthlyQuotaUsed?: Record<string, number>;
};

export const DEFAULT_AUTOCLOSE_MESSAGE =
  "Como não tivemos mais retorno por aqui, estamos finalizando este atendimento para manter nossa fila organizada. Se precisar de algo ou tiver qualquer dúvida, basta mandar uma nova mensagem a qualquer momento! Tenha um ótimo dia! 😊";

export const DEFAULT_AUTOCLOSE_SURVEY_MESSAGE =
  "Para avaliarmos nosso atendimento, como você classifica a experiência de hoje de 1 a 5 estrelas? Responda com uma nota de 1 a 5! ⭐";

export type AutoCloseSettings = {
  enabled: boolean;
  timeoutMinutes: number;
  message: string;
  includeWaitingClient?: boolean;
  sendSurvey?: boolean;
  surveyMessage?: string;
};

export type StoredTenantConfig = Record<string, unknown> & {
  plan?: StoredTenantPlan;
  suspension?: { isSuspended?: boolean; publicReason?: string; internalNote?: string; updatedAt?: string; actor?: string };
  usageCounters?: { trialUsed?: number; monthly?: Record<string, number> };
  conversationTags?: Record<string, string>;
  conversationPriorities?: Record<string, "low" | "normal" | "high" | "urgent">;
  ai_settings?: Record<string, unknown>;
  autoCloseSettings?: AutoCloseSettings;
  tagHistory?: Array<Record<string, unknown>>;
  teamOperators?: Array<Record<string, unknown>>;
  quickReplies?: Array<Record<string, unknown>>;
  satisfactionSurveys?: Array<Record<string, unknown>>;
  upgradeRequests?: Array<Record<string, unknown>>;
  paymentHistory?: Array<Record<string, unknown>>;
  recharges?: Array<Record<string, unknown>>;
  master_pix_config?: Record<string, unknown>;
};
