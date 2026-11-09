"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";

const ProvidersWorkspace = dynamic(() => import("@/components/crm/ProvidersWorkspace"), {
  loading: () => <p role="status">Carregando provedores de IA...</p>,
});
import { MasterAdminSkeleton, ClientWorkspaceSkeleton } from "@/components/crm/CrmSkeleton";
import { WhatsAppRadarSection } from "@/components/crm/WhatsAppRadarSection";
import {
  computeFinanceMetrics, resolvePeriod,
  type PeriodPreset, type FinanceSubscriptionStatus, type FinanceExpense
} from "@/lib/crm/finance-metrics";
import { type OperationalExpense } from "@/app/api/crm/admin/finance/route";
import { BroadcastManagerSection } from "@/components/crm/BroadcastManagerSection";

const ClientWorkspace = dynamic(() => import("@/components/crm/ClientWorkspace"), {
  loading: () => <ClientWorkspaceSkeleton embedded />,
});

type CrmTab = "whatsapp" | "conhecimento" | "artigos" | "simulador" | "horarios" | "atendimentos" | "equipe" | "relatorios" | "contatos" | "plano" | "seguranca";
type MasterSection = "clients" | "plans" | "kpis" | "providers" | "crm" | "recharges" | "radar" | "broadcast" | "security" | "users";
const MASTER_SECTIONS: Record<MasterSection, { title: string; description: string }> = {
  users: { title: "Central de Logins & Clientes", description: "Cadastre os usuários e responsáveis pelos acessos antes de vincular às suas empresas." },
  clients: { title: "Empresas & Lojas", description: "Gerencie as empresas cadastradas, vincule clientes, planos comerciais e status de pagamento." },
  radar: { title: "Radar de WhatsApp (Tempo Real)", description: "Monitore a integridade e o status de conexão de todas as instâncias de WhatsApp de todos os clientes." },
  broadcast: { title: "Comunicados & Avisos Globais", description: "Transmita alertas e comunicados oficiais no topo do painel de todos os lojistas em tempo real." },
  plans: { title: "Planos Comerciais & Franquias de IA", description: "Gestão de planos, limites técnicos, sincronização e franquias de mensagens da IA." },
  kpis: { title: "Faturamento & Métricas", description: "Acompanhe receitas, mensalidades e indicadores das empresas." },
  providers: { title: "Provedores de IA", description: "Defina os modelos principal e reserva e teste o atendimento das lojas." },
  recharges: { title: "Central de Recargas & Chave PIX", description: "Aprove manualmente as recargas de mensagens após conferir o comprovante PIX e configure a chave de pagamento." },
  security: { title: "Segurança & Recuperação de Senha", description: "Cadastre e gerencie o número de WhatsApp verificado para recuperação de senha do administrador Master." },
  crm: { title: "CRM NovaesWeb", description: "Atendimento, WhatsApp e inteligência artificial da própria NovaesWeb." },
};
import {
  Building2, Settings, Coins, RefreshCw, ShieldCheck,
  BrainCircuit, AlertCircle, PlusCircle, CheckCircle2, Ban, RotateCcw,
  Calendar, CreditCard, KeyRound, UserCheck, UserPlus, Trash2, Smartphone,
  Search, DollarSign, Users, AlertTriangle, ShieldAlert, LogOut, ChevronRight,
  Zap, Sparkles, Check, Copy, Edit3, Eye, History, Layers, Sliders, Info,
  CheckSquare, Square, Crown, Bot, BarChart3, MessageCircle, BookOpen, Mail, Lock, EyeOff, LogIn, X,
  PanelLeftClose, PanelLeftOpen, Radio, Megaphone, Download, Activity
} from "lucide-react";

const brl = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function FinCard({ label, value, hint, color = "#fff", unavailable }: {
  label: string; value: string | number; hint?: string; color?: string; unavailable?: boolean;
}) {
  return (
    <div className="op-card" style={{ padding: "16px 18px", borderRadius: "14px", opacity: unavailable ? 0.65 : 1 }}>
      <span style={{ fontSize: "11px", color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>{label}</span>
      <strong style={{ display: "block", fontSize: "24px", color: unavailable ? "#9ca3af" : color, marginTop: "4px", fontWeight: 800 }}>{value}</strong>
      {hint && <small style={{ color: "#9ca3af", fontSize: "11px", lineHeight: 1.3, display: "block", marginTop: "2px" }}>{hint}</small>}
    </div>
  );
}

type ClientUser = {
  id: string;
  email: string;
  name: string;
  whatsapp: string;
  status: "waiting_store" | "linked" | "blocked";
  isBlocked: boolean;
  createdAt: string;
  linkedTenants: Array<{
    tenantId: string;
    tenantName: string;
    status: string;
    role: string;
    planName: string;
  }>;
};

type Client = {
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
  whatsappSlots?: Array<{ slot: number; instanceName: string; status: string; phone?: string; unlocked: boolean; pausedByDowngrade?: boolean }>;
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
    trialDaysLeft?: number;
    trialStatus?: "active" | "expiring_soon" | "expired" | "quota_exhausted" | "converted" | string;
    trialStartedAt?: string;
    trialExpiresAt?: string;
    contractedPlan?: {
      quotaLimit: number;
      price: string;
      version: number;
      contractedAt?: string;
    } | null;
    pendingPlanUpdate?: {
      quotaLimit: number;
      effectiveAt: string;
      planVersion: number;
    } | null;
  };
  paymentHistory?: Array<{
    id?: string;
    billingCycleKey?: string;
    amount?: string | number;
    dueDate?: string;
    paidAt?: string;
    status?: string;
  }>;
};

type UpgradeRequestItem = {
  id: string;
  tenantId: string;
  storeName: string;
  tenantSlug?: string;
  currentPlanId: string;
  currentPlanName: string;
  targetPlanId: string;
  targetPlanName: string;
  reason?: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  resolvedAt?: string | null;
};

type FeatureId =
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

type PlanItem = {
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
  enrolledStores?: Array<{ id: string; name: string; customQuotaOverride?: number; exceptionReason?: string }>;
};

type AuditEntry = {
  id: string;
  timestamp: string;
  planId: string;
  planName: string;
  action: string;
  vigencia: string;
  actor: string;
  impactedCount: number;
  diffSummary?: string;
  changes?: Record<string, { from: unknown; to: unknown }>;
};

type PublishedPlan = Omit<PlanItem,"draftPlan"> & {
  featureBullets?: string[]; maxWhatsappConnections?: number;
  status?: "active" | "inactive"; draftPlan?: PublishedPlan;
};

function fromPublishedPlan(plan: PublishedPlan): PlanItem {
  const technicalIds = plan.allowedFeatures ?? plan.features.filter((id): id is FeatureId => TECHNICAL_FEATURES_LIST.some(feature => feature.id === id));
  return {
    ...plan,
    features: plan.featureBullets ?? plan.features.map(value => TECHNICAL_FEATURES_LIST.find(feature => feature.id === value)?.name ?? value),
    allowedFeatures: technicalIds,
    maxWhatsAppConnections: plan.maxWhatsappConnections ?? plan.maxWhatsAppConnections,
    isActive: plan.status ? plan.status === "active" : plan.isActive !== false,
    draftPlan: plan.draftPlan ? fromPublishedPlan(plan.draftPlan) : undefined
  };
}

function toPublishedPlan(plan: PlanItem) {
  return {
    id: plan.id, name: plan.name, price: plan.price, quotaLimit: plan.quotaLimit,
    description: plan.description, maxOperators: plan.maxOperators,
    maxWhatsappConnections: plan.maxWhatsAppConnections,
    features: [...new Set(["ai_chat","human_handoff",...(plan.allowedFeatures ?? [])])],
    featureBullets: plan.features, status: plan.isActive === false ? "inactive" : "active",
    isPopular: plan.isPopular
  };
}

const TECHNICAL_FEATURES_LIST: Array<{ id: FeatureId; name: string; category: string; description: string; isCore?: boolean }> = [
  { id: "ai_chat", isCore: true, name: "IA Personalizada 24h", category: "IA", description: "Respostas inteligentes automatizadas com IA no WhatsApp.", },
  { id: "human_handoff", isCore: true, name: "Atendimento Humano & Transferência", category: "Atendimento", description: "Operador humano assume o chat e pausa a IA naquela conversa.", },
  { id: "simulator", name: "Simulador da IA", category: "IA", description: "Ambiente para o lojista simular diálogos antes de ativar o WhatsApp.", },
  { id: "business_hours_basic", name: "Horários Básicos", category: "Gestão", description: "Configuração simples de abertura e fechamento.", },
  { id: "quick_replies", name: "Respostas Rápidas", category: "Atendimento", description: "Atalhos de mensagens prontas para agilizar o operador.", },
  { id: "basic_indicators", name: "Indicadores Básicos", category: "Gestão", description: "Visão essencial do volume de atendimentos e consumo.", },
  { id: "business_hours", name: "Horários Avançados e Intervalos", category: "Gestão", description: "Configuração por dia da semana, intervalos de almoço e mensagem fora do expediente." },
  { id: "commercial_tags", name: "Etiquetas Comerciais", category: "Atendimento", description: "Classificação por etapas: Novo Lead, Orçamento, Vendido, Perdido." },
  { id: "handoff_summary", name: "Resumos Inteligentes de Atendimento", category: "IA", description: "Síntese automática em 3 linhas gerada para o atendente humano." },
  { id: "sound_notifications", name: "Alertas Sonoros", category: "Atendimento", description: "Alerta em áudio quando cliente solicita atendente humano." },
  { id: "model_fallback", name: "Modelo Reserva de IA", category: "Segurança", description: "Rota reserva de IA quando configurada e disponível." },
  { id: "conversation_priority", name: "Prioridade dos Atendimentos", category: "Atendimento", description: "Classificação e ordenação de fila por urgência (Baixa, Normal, Alta, Urgente)." },
  { id: "satisfaction_survey", name: "Pesquisa de Satisfação", category: "Atendimento", description: "Coleta de nota 1 a 5 e comentário ao encerrar o atendimento." },
  { id: "commercial_indicators", name: "Indicadores Comerciais", category: "Gestão", description: "Métricas de funil comercial, etiquetas e conversão." },
  { id: "advanced_reports", name: "Relatórios Avançados", category: "Gestão", description: "Relatórios gerenciais detalhados de operação e tendências." },
  { id: "satisfaction_analytics", name: "Análise de Satisfação (CSAT)", category: "Gestão", description: "Distribuição de notas, média CSAT e comentários." },
  { id: "operator_indicators", name: "Indicadores por Atendente", category: "Gestão", description: "Produtividade individual e volume por operador da equipe." },
  { id: "advanced_commercial_filters", name: "Filtros e Análises Comerciais Avançadas", category: "Gestão", description: "Segmentação avançada por período, etiqueta, prioridade e atendente." }
];

const DEFAULT_PLANS: PlanItem[] = [
  {
    id: "crm-trial",
    name: "Teste Grátis (7 Dias)",
    price: "0,00",
    quotaLimit: 100,
    maxOperators: 3,
    maxWhatsAppConnections: 3,
    isActive: true,
    description: "Avaliação gratuita de 7 dias com todos os recursos Premium liberados para teste.",
    allowedFeatures: [
      "ai_chat",
      "human_handoff",
      "simulator",
      "business_hours_basic",
      "quick_replies",
      "basic_indicators",
      "business_hours",
      "commercial_tags",
      "handoff_summary",
      "sound_notifications",
      "model_fallback",
      "conversation_priority",
      "satisfaction_survey",
      "commercial_indicators",
      "advanced_reports",
      "satisfaction_analytics",
      "operator_indicators",
      "advanced_commercial_filters"
    ],
    features: [
      "7 dias corridos de teste grátis",
      "Até 100 mensagens da IA no teste",
      "Até 3 números WhatsApp (3/5 espaços)",
      "Até 2 operadores humanos",
      "Todas as funcionalidades Premium disponíveis para teste",
      "Encerramento automático após 7 dias sem cobrança",
      "Dados 100% preservados ao final do período"
    ]
  },
  {
    id: "crm-premium",
    name: "CRM Premium",
    price: "89,90",
    quotaLimit: 1200,
    maxOperators: 3,
    maxWhatsAppConnections: 5,
    isPopular: true,
    isActive: true,
    description: "Plano definitivo da NovaesWeb: todas as funcionalidades liberadas, 1.200 mensagens, 5 WhatsApps e 3 operadores.",
    allowedFeatures: [
      "ai_chat",
      "human_handoff",
      "simulator",
      "business_hours_basic",
      "quick_replies",
      "basic_indicators",
      "business_hours",
      "commercial_tags",
      "handoff_summary",
      "sound_notifications",
      "model_fallback",
      "conversation_priority",
      "satisfaction_survey",
      "commercial_indicators",
      "advanced_reports",
      "satisfaction_analytics",
      "operator_indicators",
      "advanced_commercial_filters"
    ],
    features: [
      "1.200 mensagens da IA por mês",
      "Até 5 números WhatsApp simultâneos (5/5 espaços)",
      "Até 2 operadores humanos",
      "Todas as funcionalidades liberadas",
      "Recargas adicionais fixas: R$ 20,00 = 100 mensagens",
      "Sem divisões em planos Básico, Profissional ou Empresarial"
    ]
  },
  {
    id: "crm-start",
    name: "CRM Start",
    price: "59,90",
    quotaLimit: 200,
    maxOperators: 1,
    maxWhatsAppConnections: 1,
    isActive: false,
    description: "Plano legado indisponível para novas assinaturas.",
    allowedFeatures: [
      "ai_chat",
      "human_handoff",
      "simulator",
      "business_hours_basic",
      "quick_replies",
      "basic_indicators"
    ],
    features: [
      "200 mensagens da IA por mês",
      "1 número WhatsApp (1/5 espaços)",
      "1 operador humano",
      "Plano legado mantido apenas para contratos ativos anteriores"
    ]
  },
  {
    id: "crm-business",
    name: "CRM Business",
    price: "99,90",
    quotaLimit: 600,
    maxOperators: 3,
    maxWhatsAppConnections: 3,
    isActive: false,
    description: "Plano legado indisponível para novas assinaturas.",
    allowedFeatures: [
      "ai_chat",
      "human_handoff",
      "simulator",
      "business_hours_basic",
      "quick_replies",
      "basic_indicators",
      "business_hours",
      "commercial_tags",
      "handoff_summary",
      "sound_notifications",
      "model_fallback",
      "conversation_priority",
      "satisfaction_survey",
      "commercial_indicators"
    ],
    features: [
      "600 mensagens da IA por mês",
      "Até 3 números WhatsApp",
      "Até 3 operadores humanos",
      "Plano legado mantido apenas para contratos ativos anteriores"
    ]
  }
];

export default function AdminCRM() {
  const [clients, setClients] = useState<Client[]>([]);
  const [upgradeRequests, setUpgradeRequests] = useState<UpgradeRequestItem[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("crm_master_sidebar_collapsed");
      if (saved === "true") setSidebarCollapsed(true);
    } catch {}
  }, []);

  const toggleSidebar = () => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem("crm_master_sidebar_collapsed", String(next));
      } catch {}
      return next;
    });
  };

  // Recharges & PIX Configuration states
  type AdminRecharge = {
    id: string;
    tenantId: string;
    tenantName: string;
    tenantEmail: string;
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

  type PixConfig = {
    keyType: "cnpj" | "email" | "phone" | "random";
    pixKey: string;
    beneficiaryName: string;
    bankName?: string;
    city?: string;
    instructions?: string;
    updatedAt?: string;
  };

  const [adminRecharges, setAdminRecharges] = useState<AdminRecharge[]>([]);
  const [pixConfig, setPixConfig] = useState<PixConfig>({
    keyType: "cnpj",
    pixKey: "58.742.894/0001-40",
    beneficiaryName: "NovaesWeb Soluções Digitais",
    bankName: "Banco Inter / NuBank",
    city: "São Paulo - SP",
    instructions: "Após transferir o PIX, confirme sua recarga nesta tela para aprovação imediata pelo administrador Master."
  });
  const [rechargesLoading, setRechargesLoading] = useState(false);
  const [pixModalOpen, setPixModalOpen] = useState(false);
  const [savingPix, setSavingPix] = useState(false);
  const [rechargeFilter, setRechargeFilter] = useState<"all" | "pending" | "paid" | "rejected">("all");
  const [rejectionModalOpen, setRejectionModalOpen] = useState(false);
  const [targetRechargeForReject, setTargetRechargeForReject] = useState<AdminRecharge | null>(null);
  const [rejectionReasonInput, setRejectionReasonInput] = useState("");
  const [approvingRechargeId, setApprovingRechargeId] = useState<string | null>(null);

  const fetchRecharges = useCallback(async () => {
    try {
      setRechargesLoading(true);
      const res = await fetch("/api/crm/admin/recharges");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.recharges)) setAdminRecharges(data.recharges);
        if (data.pixConfig) setPixConfig(data.pixConfig);
      }
    } catch {} finally {
      setRechargesLoading(false);
    }
  }, []);

  const handleApproveRecharge = async (tenantId: string, rechargeId: string) => {
    setApprovingRechargeId(rechargeId);
    try {
      const res = await fetch("/api/crm/admin/recharges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve_recharge", tenantId, rechargeId })
      });
      const data = await res.json();
      if (res.ok) {
        setNotice(data.message || "Recarga aprovada com sucesso! Créditos liberados.");
        await fetchRecharges();
        await fetchClients();
      } else {
        setError(data.message || "Erro ao aprovar recarga.");
      }
    } catch {
      setError("Falha de comunicação ao aprovar recarga.");
    } finally {
      setApprovingRechargeId(null);
    }
  };

  const handleRejectRecharge = async () => {
    if (!targetRechargeForReject) return;
    try {
      const res = await fetch("/api/crm/admin/recharges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reject_recharge",
          tenantId: targetRechargeForReject.tenantId,
          rechargeId: targetRechargeForReject.id,
          reason: rejectionReasonInput
        })
      });
      const data = await res.json();
      if (res.ok) {
        setNotice(data.message || "Solicitação de recarga recusada.");
        setRejectionModalOpen(false);
        setTargetRechargeForReject(null);
        setRejectionReasonInput("");
        await fetchRecharges();
      } else {
        setError(data.message || "Erro ao recusar recarga.");
      }
    } catch {
      setError("Falha de comunicação ao recusar recarga.");
    }
  };

  const handleSavePixConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPix(true);
    try {
      const res = await fetch("/api/crm/admin/recharges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_pix_config", pixConfig })
      });
      const data = await res.json();
      if (res.ok) {
        setNotice("Chave PIX atualizada com sucesso!");
        setPixModalOpen(false);
        if (data.pixConfig) setPixConfig(data.pixConfig);
      } else {
        setError(data.message || "Erro ao atualizar chave PIX.");
      }
    } catch {
      setError("Falha de comunicação ao salvar chave PIX.");
    } finally {
      setSavingPix(false);
    }
  };

  // Security & WhatsApp Recovery State
  const [masterRecoveryPhone, setMasterRecoveryPhone] = useState("");
  const [masterRecoveryMasked, setMasterRecoveryMasked] = useState("");
  const [masterRecoveryVerified, setMasterRecoveryVerified] = useState(false);
  const [securityModalOpen, setSecurityModalOpen] = useState(false);
  const [newMasterPhoneInput, setNewMasterPhoneInput] = useState("");
  const [masterChallengeId, setMasterChallengeId] = useState("");
  const [masterVerificationCode, setMasterVerificationCode] = useState("");
  const [masterSecurityStep, setMasterSecurityStep] = useState<1 | 2>(1);
  const [masterSecurityLoading, setMasterSecurityLoading] = useState(false);
  const [masterSecurityMsg, setMasterSecurityMsg] = useState("");
  const [masterSecurityErr, setMasterSecurityErr] = useState("");

  const fetchMasterRecoverySettings = useCallback(async () => {
    try {
      const res = await fetch("/api/crm/admin/security/recovery-phone", { credentials: "same-origin" });
      if (res.ok) {
        const data = await res.json();
        setMasterRecoveryPhone(data.phone || "");
        setMasterRecoveryMasked(data.maskedPhone || "");
        setMasterRecoveryVerified(data.verified === true);
      }
    } catch {}
  }, []);

  const handleRequestMasterPhoneChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (masterSecurityLoading) return;
    setMasterSecurityLoading(true);
    setMasterSecurityErr("");
    setMasterSecurityMsg("");
    try {
      const res = await fetch("/api/crm/admin/security/recovery-phone", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPhone: newMasterPhoneInput.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "Falha ao enviar código.");
      setMasterChallengeId(data.challengeId);
      setMasterSecurityStep(2);
      setMasterSecurityMsg(data.message || "Código enviado para o novo WhatsApp.");
    } catch (err) {
      setMasterSecurityErr(err instanceof Error ? err.message : "Erro ao solicitar código.");
    } finally {
      setMasterSecurityLoading(false);
    }
  };

  const handleConfirmMasterPhoneCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (masterSecurityLoading) return;
    setMasterSecurityLoading(true);
    setMasterSecurityErr("");
    setMasterSecurityMsg("");
    try {
      const res = await fetch("/api/crm/admin/security/verify-phone", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId: masterChallengeId, code: masterVerificationCode.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "Código incorreto.");
      setMasterRecoveryPhone(data.phone);
      setMasterRecoveryMasked(data.maskedPhone);
      setMasterRecoveryVerified(true);
      setMasterSecurityMsg(data.message || "WhatsApp verificado com sucesso!");
      setTimeout(() => {
        setSecurityModalOpen(false);
        setMasterSecurityStep(1);
        setMasterVerificationCode("");
        setNewMasterPhoneInput("");
      }, 1500);
    } catch (err) {
      setMasterSecurityErr(err instanceof Error ? err.message : "Erro ao validar código.");
    } finally {
      setMasterSecurityLoading(false);
    }
  };

  const handleTestMasterRecoveryOtp = async () => {
    setMasterSecurityLoading(true);
    setMasterSecurityErr("");
    setMasterSecurityMsg("");
    try {
      const res = await fetch("/api/crm/auth/whatsapp-recover/request", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "master" })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "Falha ao enviar teste.");
      setMasterSecurityMsg(`✅ Código de teste disparado com sucesso para ${data.maskedPhone}!`);
    } catch (err) {
      setMasterSecurityErr(err instanceof Error ? err.message : "Erro ao disparar teste.");
    } finally {
      setMasterSecurityLoading(false);
    }
  };

  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [clientCountsMap, setClientCountsMap] = useState<Record<string, number>>({});
  const [enrolledStoresMap, setEnrolledStoresMap] = useState<Record<string, Array<{ id: string; name: string; customQuotaOverride?: number; exceptionReason?: string }>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "overdue" | "suspended">("all");
  const [currentNav, setCurrentNav] = useState<MasterSection>("clients");
  const [crmActiveTab, setCrmActiveTab] = useState<CrmTab>("atendimentos");

  const navigateCrm = useCallback((tab: CrmTab) => {
    setCurrentNav("crm");
    setCrmActiveTab(tab);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("section", "crm");
      window.history.pushState(null, "", url.toString());
    }
  }, []);

  useEffect(() => {
    const syncSection = () => {
      const section = new URLSearchParams(window.location.search).get("section");
      setCurrentNav(section && Object.hasOwn(MASTER_SECTIONS, section) ? section as MasterSection : "clients");
    };
    syncSection();
    window.addEventListener("popstate", syncSection);
    return () => window.removeEventListener("popstate", syncSection);
  }, []);

  function navigateSection(section: MasterSection) {
    setCurrentNav(section);
    const url = new URL(window.location.href);
    url.searchParams.set("section", section);
    window.history.pushState(null, "", url);
  }

  // Master Authentication (secure session cookie)
  const [authenticated, setAuthenticated] = useState<boolean>(false);
  const [inputKey, setInputKey] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [forgotModalOpen, setForgotModalOpen] = useState(false);

  // Create client form state (initialized with official CRM Premium values)
  const [storeName, setStoreName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [planName, setPlanName] = useState("CRM Premium");
  const [planPrice, setPlanPrice] = useState("89,90");
  const [quotaLimit, setQuotaLimit] = useState(1200);
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [paymentStatus, setPaymentStatus] = useState<"paid" | "pending">("paid");
  const [autoBlock, setAutoBlock] = useState(true);
  const [creating, setCreating] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  // Store linking & additional business fields (Etapa 2: Criar Loja)
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [businessWhatsapp, setBusinessWhatsapp] = useState("");
  const [niche, setNiche] = useState("");
  const [clientDocument, setClientDocument] = useState("");
  const [agentName, setAgentName] = useState("");

  // User Management state (Etapa 1 & 5: Criar Login e Gerenciar Clientes)
  const [users, setUsers] = useState<ClientUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userFormOpen, setUserFormOpen] = useState(false);
  const [userFullName, setUserFullName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userWhatsapp, setUserWhatsapp] = useState("");
  const [userInitialPassword, setUserInitialPassword] = useState("");
  const [userConfirmPassword, setUserConfirmPassword] = useState("");
  const [userStatus, setUserStatus] = useState<"active" | "blocked">("active");
  const [creatingUser, setCreatingUser] = useState(false);
  const [showUserPassword, setShowUserPassword] = useState(false);
  const [userFilterStatus, setUserFilterStatus] = useState<"all" | "waiting_store" | "linked" | "blocked">("all");
  const [userSearchTerm, setUserSearchTerm] = useState("");
  const [whatsappModalData, setWhatsappModalData] = useState<{
    clientName: string;
    storeName: string;
    email: string;
    phone: string;
  } | null>(null);
  const [whatsappCopied, setWhatsappCopied] = useState(false);

  // Financeiro: filtros do dashboard (Faturamento & Métricas)
  const [finPeriod, setFinPeriod] = useState<PeriodPreset>("month");
  const [finFrom, setFinFrom] = useState("");
  const [finTo, setFinTo] = useState("");
  const [finPlan, setFinPlan] = useState("");
  const [finStatus, setFinStatus] = useState<FinanceSubscriptionStatus>("all");
  const [finTenant, setFinTenant] = useState("");
  const [finLoading, setFinLoading] = useState(false);
  const [finRefreshedAt, setFinRefreshedAt] = useState<Date | null>(null);
  const [operationalExpenses, setOperationalExpenses] = useState<OperationalExpense[]>([]);
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [newExpDesc, setNewExpDesc] = useState("");
  const [newExpCat, setNewExpCat] = useState<OperationalExpense["category"]>("other");
  const [newExpAmount, setNewExpAmount] = useState("");
  const [newExpDueDate, setNewExpDueDate] = useState("");
  const [newExpPaid, setNewExpPaid] = useState(false);
  const [newExpSupplier, setNewExpSupplier] = useState("");
  const [savingExpense, setSavingExpense] = useState(false);

  // Ficha Financeira do Cliente (Modal)
  const [financeModalClient, setFinanceModalClient] = useState<Client | null>(null);
  const [extensionModalOpen, setExtensionModalOpen] = useState(false);
  const [extensionNewDueDate, setExtensionNewDueDate] = useState("");
  const [extensionReason, setExtensionReason] = useState("");
  const [extensionGraceDays, setExtensionGraceDays] = useState<number>(3);
  const [savingExtension, setSavingExtension] = useState(false);
  const [discountModalOpen, setDiscountModalOpen] = useState(false);
  const [discountNewPrice, setDiscountNewPrice] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [savingDiscount, setSavingDiscount] = useState(false);

  // Administrative Suspension Modal state (with public reason + internal note)
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [clientToBlock, setClientToBlock] = useState<Client | null>(null);
  const [blockPublicReason, setBlockPublicReason] = useState("Conta suspensa administrativamente. Entre em contato com o suporte financeiro NovaesWeb.");
  const [blockInternalNote, setBlockInternalNote] = useState("");
  const [togglingBlock, setTogglingBlock] = useState(false);
  const [resolvingUpgradeId, setResolvingUpgradeId] = useState<string | null>(null);

  // Change Plan Modal
  const [changePlanModalOpen, setChangePlanModalOpen] = useState(false);
  const [selectedClientForPlan, setSelectedClientForPlan] = useState<Client | null>(null);
  const [targetPlanToAssign, setTargetPlanToAssign] = useState<PlanItem>(DEFAULT_PLANS[0]);
  const [assigningPlan, setAssigningPlan] = useState(false);
  const [customQuotaChecked, setCustomQuotaChecked] = useState(false);
  const [customQuotaValue, setCustomQuotaValue] = useState<number>(0);
  const [customQuotaReason, setCustomQuotaReason] = useState("");

  // Plan Edit / Create Modal state
  const [editPlanModalOpen, setEditPlanModalOpen] = useState(false);
  const [isCreatingNewPlan, setIsCreatingNewPlan] = useState(false);
  const [editingPlan, setEditingPlan] = useState<PlanItem>({
    id: "",
    name: "",
    price: "199,00",
    quotaLimit: 1000,
    maxOperators: 1,
    maxWhatsAppConnections: 1,
    description: "",
    features: [],
    allowedFeatures: ["ai_chat", "human_handoff"],
    isPopular: false,
    isActive: true
  });
  const [editingFeaturesText, setEditingFeaturesText] = useState("");

  // Impact Confirmation Modal ("Salvar e Aplicar")
  const [impactModalOpen, setImpactModalOpen] = useState(false);
  const [planToApply, setPlanToApply] = useState<PlanItem | null>(null);
  const [originalPlan, setOriginalPlan] = useState<PlanItem | null>(null);
  const [vigencia, setVigencia] = useState<"immediate" | "new_clients" | "next_cycle">("immediate");
  const [applyingPlan, setApplyingPlan] = useState(false);

  // Duplicate Plan Modal
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const [sourcePlanForDuplicate, setSourcePlanForDuplicate] = useState<PlanItem | null>(null);
  const [duplicateNewId, setDuplicateNewId] = useState("");
  const [duplicateNewName, setDuplicateNewName] = useState("");
  const [duplicating, setDuplicating] = useState(false);

  // Enrolled Stores Modal
  const [enrolledModalOpen, setEnrolledModalOpen] = useState(false);
  const [selectedPlanForStores, setSelectedPlanForStores] = useState<PlanItem | null>(null);

  // Audit History Modal
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Password reset modal state
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetUserId, setResetUserId] = useState("");
  const [resetStoreName, setResetStoreName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetting, setResetting] = useState(false);

  // Fetch Clients
  const fetchClients = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/crm/admin/clients", {
        credentials: "same-origin",
        cache: "no-store"
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          setAuthenticated(false);
          setError("Digite a senha Master para acessar a Central de Administração.");
        } else {
          setError("Não foi possível carregar a lista de clientes.");
        }
        return;
      }
      setAuthenticated(true);
      const data = await res.json();
      setClients(data.clients || []);
      setUpgradeRequests(Array.isArray(data.upgradeRequests) ? data.upgradeRequests : []);
    } catch {
      setError("Falha de comunicação com o servidor.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch Plans
  const fetchPlans = useCallback(async () => {
    try {
      const res = await fetch("/api/crm/admin/plans", {
        credentials: "same-origin",
        cache: "no-store"
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.plans)) {
          setPlans(data.plans.map(fromPublishedPlan));
        }
        if (data.clientCounts) {
          setClientCountsMap(data.clientCounts);
        }
        if (data.enrolledStores) {
          setEnrolledStoresMap(data.enrolledStores);
        }
      }
    } catch {}
  }, []);

  // Fetch Client Users
  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const res = await fetch("/api/crm/admin/users", {
        credentials: "same-origin",
        cache: "no-store"
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch {
      // quiet fail
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  // Check Master session on initial mount
  useEffect(() => {
    async function checkMasterSession() {
      try {
        const res = await fetch("/api/crm/auth/session?scope=master", { credentials: "same-origin", cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (data.authenticated && data.role === "master") {
            setAuthenticated(true);
            void fetchClients();
            void fetchPlans();
            void fetchUsers();
            void fetchMasterRecoverySettings();
            return;
          }
        }
      } catch {}
      setAuthenticated(false);
      setLoading(false);
      if (typeof window !== "undefined") {
        window.location.replace("/novaescrmadm?error=unauthorized_admin");
      }
    }
    void checkMasterSession();
  }, [fetchClients, fetchPlans, fetchUsers, fetchMasterRecoverySettings]);

  // Master Login
  const handleMasterLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const candidatePass = (adminPassword || inputKey).trim();
    if (!candidatePass) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/crm/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          email: adminEmail.trim(),
          password: candidatePass,
          rememberMe
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || (data.error === "invalid_credentials" ? "E-mail ou senha Master incorretos. Verifique suas credenciais de administrador." : data.error) || "Senha incorreta ou acesso não autorizado.");
        return;
      }
      setAuthenticated(true);
      setAdminPassword("");
      setInputKey("");
      await fetchClients();
      await fetchPlans();
    } catch {
      setError("Falha de comunicação com o servidor.");
    } finally {
      setLoading(false);
    }
  };

  // Master Logout
  const handleMasterLogout = async () => {
    try {
      await fetch("/api/crm/auth/session", { method: "DELETE", credentials: "same-origin" });
    } catch {}
    setAuthenticated(false);
    setAdminPassword("");
    setInputKey("");
    if (typeof window !== "undefined") {
      window.location.href = "/novaescrmadm?logout=success";
    }
  };

  // Financeiro: indicadores calculados por fonte única (src/lib/crm/finance-metrics.ts)
  const finance = useMemo(() => {
    const { from, to } = resolvePeriod(finPeriod, new Date(), { from: finFrom, to: finTo });
    return computeFinanceMetrics({
      clients,
      recharges: adminRecharges,
      expenses: operationalExpenses as FinanceExpense[],
      planCatalog: plans.map(p => ({ id: p.id, name: p.name, price: p.price })),
      filters: { from, to, planId: finPlan || undefined, subscriptionStatus: finStatus, tenantId: finTenant || undefined }
    });
  }, [clients, adminRecharges, operationalExpenses, plans, finPeriod, finFrom, finTo, finPlan, finStatus, finTenant]);

  const fetchFinanceSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/crm/admin/finance", { credentials: "same-origin", cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.expenses)) {
          setOperationalExpenses(data.expenses);
        }
      }
    } catch {}
  }, []);

  const refreshFinance = useCallback(async () => {
    setFinLoading(true);
    try {
      await Promise.all([fetchClients(), fetchPlans(), fetchRecharges(), fetchFinanceSettings()]);
      setFinRefreshedAt(new Date());
    } finally {
      setFinLoading(false);
    }
  }, [fetchClients, fetchPlans, fetchRecharges, fetchFinanceSettings]);

  // Client counts per plan
  const planDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of plans) counts[p.name] = clientCountsMap[p.id] ?? 0;
    for (const c of clients) {
      const pName = c.plan.name || "CRM Start";
      if (!counts[pName]) counts[pName] = (counts[pName] || 0) + 1;
    }
    return counts;
  }, [plans, clients, clientCountsMap]);

  // Exportação CSV de Lojas e Clientes (Excel compatível com UTF-8 BOM)
  const handleExportClientsCSV = () => {
    const headers = [
      "ID",
      "Nome da Loja",
      "E-mail de Acesso",
      "Plano Atual",
      "Mensalidade (R$)",
      "Status da Loja",
      "Status Pagamento",
      "Data de Vencimento",
      "Bloqueado",
      "Mensagens IA Usadas",
      "Limite Mensagens IA",
      "WhatsApps Conectados",
      "Limite WhatsApps",
      "Operadores de Equipe"
    ];
    const rows = clients.map(c => [
      `"${c.id}"`,
      `"${c.name.replace(/"/g, '""')}"`,
      `"${(c.email || "").replace(/"/g, '""')}"`,
      `"${(c.plan?.name || "").replace(/"/g, '""')}"`,
      `"${c.plan?.price || "0,00"}"`,
      `"${c.status || "active"}"`,
      `"${c.plan?.status || "pending"}"`,
      `"${c.plan?.dueDate || ""}"`,
      c.plan?.isOverdue || c.plan?.autoBlock ? "Sim" : "Não",
      c.plan?.quotaUsed ?? 0,
      c.plan?.quotaLimit ?? 0,
      c.connectedWhatsappCount ?? 0,
      c.maxWhatsappConnections ?? 1,
      c.operatorsCount ?? 1
    ]);
    const csvContent = [headers.join(";"), ...rows.map(r => r.join(";"))].join("\r\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `clientes_novaesweb_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Exportação CSV de Histórico Financeiro e Recargas
  const handleExportRechargesCSV = () => {
    const headers = [
      "ID Recarga",
      "ID Loja",
      "Nome da Loja",
      "E-mail",
      "Mensagens Adicionadas",
      "Valor (R$)",
      "Status",
      "Data da Compra"
    ];
    const rows = adminRecharges.map(r => [
      `"${r.id}"`,
      `"${r.tenantId}"`,
      `"${(r.tenantName || "").replace(/"/g, '""')}"`,
      `"${(r.tenantEmail || "").replace(/"/g, '""')}"`,
      r.messagesAdded,
      `"${(r.pricePaid ?? 0).toFixed(2).replace(".", ",")}"`,
      `"${r.status === "paid" ? "Aprovado / Pago" : r.status === "pending" ? "Pendente Conferência" : "Rejeitado"}"`,
      `"${r.purchasedAt || ""}"`
    ]);
    const csvContent = [headers.join(";"), ...rows.map(r => r.join(";"))].join("\r\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `recargas_financeiro_novaesweb_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered clients
  const filteredClients = useMemo(() => {
    return clients.filter(c => {
      const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            c.email.toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchesSearch) return false;
      if (filterStatus === "active") return c.status === "active" && !c.plan.isOverdue;
      if (filterStatus === "overdue") return c.plan.isOverdue;
      if (filterStatus === "suspended") return c.status === "suspended";
      return true;
    });
  }, [clients, searchTerm, filterStatus]);

  // User Filtering & Handlers (Etapa 1 & 5)
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const matchSearch =
        u.name.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
        u.email.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
        u.whatsapp.includes(userSearchTerm);

      if (!matchSearch) return false;
      if (userFilterStatus === "waiting_store") return u.status === "waiting_store";
      if (userFilterStatus === "linked") return u.status === "linked";
      if (userFilterStatus === "blocked") return u.status === "blocked";
      return true;
    });
  }, [users, userSearchTerm, userFilterStatus]);

  const handleGenerateStrongPassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
    let pass = "";
    for (let i = 0; i < 10; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setUserInitialPassword(pass);
    setUserConfirmPassword(pass);
    setShowUserPassword(true);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (userInitialPassword !== userConfirmPassword) {
      setError("As senhas informadas não coincidem. Digite novamente.");
      return;
    }
    if (userInitialPassword.length < 6) {
      setError("A senha deve ter no mínimo 6 caracteres.");
      return;
    }
    setCreatingUser(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/crm/admin/users", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: userFullName,
          email: userEmail,
          whatsapp: userWhatsapp,
          password: userInitialPassword,
          status: userStatus
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || "Não foi possível cadastrar o login do cliente.");
        return;
      }
      setNotice(`Login do cliente "${userFullName}" cadastrado com sucesso! Agora você pode criar ou vincular sua loja.`);
      setUserFullName("");
      setUserEmail("");
      setUserWhatsapp("");
      setUserInitialPassword("");
      setUserConfirmPassword("");
      setUserFormOpen(false);
      await fetchUsers();
    } catch {
      setError("Falha de comunicação ao cadastrar novo usuário.");
    } finally {
      setCreatingUser(false);
    }
  };

  const handleToggleBlockUser = async (user: ClientUser) => {
    const nextBlocked = !user.isBlocked;
    const confirmMsg = nextBlocked
      ? `Deseja realmente suspender o acesso de "${user.name}"? O cliente não conseguirá fazer login no painel.`
      : `Deseja reativar o acesso de "${user.name}"?`;
    if (!confirm(confirmMsg)) return;

    try {
      const res = await fetch("/api/crm/admin/users", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          action: "toggle_block",
          blocked: nextBlocked
        })
      });
      if (res.ok) {
        setNotice(nextBlocked ? `Acesso de ${user.name} bloqueado.` : `Acesso de ${user.name} reativado com sucesso!`);
        await fetchUsers();
      } else {
        setError("Não foi possível alterar o status do usuário.");
      }
    } catch {
      setError("Falha de comunicação ao atualizar status do usuário.");
    }
  };

  const handleStartStoreForUser = (user: ClientUser) => {
    setSelectedUserId(user.id);
    setStoreName(user.name);
    setCurrentNav("clients");
    setFormOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Create Client Store
  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError("");
    setNotice("");
    try {
      const isTrial = planName === "Teste Grátis (7 Dias)" || planName.includes("Teste Grátis");
      const selectedPlanObj = plans.find(p => p.name === planName);
      const planId = isTrial ? "crm-trial" : (selectedPlanObj?.id || "crm-premium");
      const res = await fetch("/api/crm/admin/clients", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeName,
          userId: selectedUserId || undefined,
          email: selectedUserId ? undefined : email,
          password: selectedUserId ? undefined : password,
          ownerName: selectedUserId ? users.find(u => u.id === selectedUserId)?.name : undefined,
          businessWhatsapp,
          niche,
          document: clientDocument,
          agentName,
          isTrial,
          planId,
          planName: isTrial ? "Teste Grátis (7 Dias)" : planName,
          planPrice: isTrial ? "0,00" : planPrice,
          dueDate,
          paymentStatus: isTrial ? "paid" : paymentStatus,
          autoBlock,
          quotaLimit: isTrial ? 100 : quotaLimit
        })
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        if (errJson.error === "trial_already_used") {
          setError(errJson.message || "Esta empresa ou e-mail já utilizou a avaliação gratuita de 7 dias anteriormente.");
        } else if (errJson.error === "backend_not_configured") {
          setError("O Supabase não está configurado no servidor. Adicione a variável CRM_SUPABASE_SERVICE_ROLE_KEY nas configurações de ambiente da hospedagem (ex: Vercel).");
        } else if (errJson.error === "tenant_create_failed") {
          setError("Falha ao criar o registro da loja no banco de dados do Supabase. Verifique as permissões da chave service_role.");
        } else if (errJson.error === "user_create_failed") {
          setError("Falha ao criar o usuário no Supabase Auth. Verifique se o e-mail já não está cadastrado.");
        } else {
          setError(errJson.message || errJson.error || "Não foi possível cadastrar a loja.");
        }
        return;
      }
      setNotice(`Loja "${storeName}" cadastrada e vinculada com sucesso!`);
      setStoreName("");
      setEmail("");
      setPassword("");
      setSelectedUserId("");
      setBusinessWhatsapp("");
      setNiche("");
      setClientDocument("");
      setAgentName("");
      setFormOpen(false);
      await fetchClients();
      await fetchPlans();
      await fetchUsers();
    } catch {
      setError("Falha ao salvar nova loja.");
    } finally {
      setCreating(false);
    }
  };

  // Plan Management Handlers
  const handleOpenCreatePlan = () => {
    setIsCreatingNewPlan(true);
    const newId = `crm-custom-${Date.now().toString().slice(-4)}`;
    setEditingPlan({
      id: newId,
      name: "Novo Plano CRM",
      price: "199,00",
      quotaLimit: 1000,
      maxOperators: 1,
      maxWhatsAppConnections: 1,
      description: "Plano comercial personalizado para lojistas.",
      allowedFeatures: ["ai_chat", "human_handoff", "simulator"],
      features: [
        "Até 1.000 mensagens IA/mês",
        "NovaesWeb IA ativa 24h",
        "Conexão WhatsApp (1 número)",
        "Atendimento Humano Básico"
      ],
      isPopular: false,
      isActive: true
    });
    setEditingFeaturesText("Até 1.000 mensagens IA/mês\nNovaesWeb IA ativa 24h\nConexão WhatsApp (1 número)\nAtendimento Humano Básico");
    setEditPlanModalOpen(true);
  };

  const handleOpenEditPlan = (plan: PlanItem) => {
    setIsCreatingNewPlan(false);
    const target = (plan.hasDraft && plan.draftPlan) ? { ...plan, ...plan.draftPlan } : plan;
    setEditingPlan({
      ...target,
      allowedFeatures: target.allowedFeatures || target.features.filter((id): id is FeatureId =>
        TECHNICAL_FEATURES_LIST.some(feature => feature.id === id))
    });
    setEditingFeaturesText((target.features || []).join("\n"));
    setEditPlanModalOpen(true);
  };

  const handleDiscardDraft = async (planId: string) => {
    if (!window.confirm("Deseja descartar as alterações deste rascunho? O plano publicado voltará a ser o único exibido.")) return;
    try {
      const res = await fetch("/api/crm/admin/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "discard_draft", planId })
      });
      if (!res.ok) throw new Error();
      setNotice("Rascunho descartado com sucesso.");
      await fetchPlans();
    } catch {
      setError("Falha ao descartar rascunho.");
    }
  };

  const handleToggleFeatureInEditor = (featId: FeatureId) => {
    if (featId === "ai_chat" || featId === "human_handoff") return;
    const current = editingPlan.allowedFeatures || [];
    if (current.includes(featId)) {
      setEditingPlan({ ...editingPlan, allowedFeatures: current.filter(id => id !== featId) });
    } else {
      setEditingPlan({ ...editingPlan, allowedFeatures: [...current, featId] });
    }
  };

  const handleSavePlanDraft = async () => {
    try {
      const lines = editingFeaturesText.split("\n").map(l => l.trim()).filter(Boolean);
      const planPayload = { ...editingPlan, features: lines };
      const res = await fetch("/api/crm/admin/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "save_draft", plan: toPublishedPlan(planPayload) })
      });
      if (!res.ok) throw new Error();
      setNotice(`Plano "${editingPlan.name}" salvo como rascunho com sucesso.`);
      setEditPlanModalOpen(false);
      await fetchPlans();
    } catch {
      setError("Falha ao salvar rascunho do plano.");
    }
  };

  const handleTriggerApplyPlan = () => {
    const lines = editingFeaturesText.split("\n").map(l => l.trim()).filter(Boolean);
    const planPayload = { ...editingPlan, features: lines };
    setPlanToApply(planPayload);
    const orig = plans.find(p => p.id === editingPlan.id) || null;
    setOriginalPlan(orig);
    setVigencia("immediate");
    setEditPlanModalOpen(false);
    setImpactModalOpen(true);
  };

  const handleConfirmApplyPlan = async () => {
    if (!planToApply) return;
    setApplyingPlan(true);
    setError("");
    try {
      const res = await fetch("/api/crm/admin/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          action: "save_and_apply",
          plan: toPublishedPlan(planToApply),
          vigencia
        })
      });
      const data = await res.json();
      if (!res.ok && res.status !== 207) throw new Error(data.error || "Falha ao aplicar plano");

      if (data.failedTenants && data.failedTenants.length > 0) {
        setError(
          `Sincronização com falhas parciais: ${data.succeededTenants?.length || 0} loja(s) sincronizada(s), mas ${data.failedTenants.length} falharam: ${data.failedTenants.map((f: { tenantId: string; error: string }) => `${f.tenantId}: ${f.error}`).join("; ")}`
        );
      } else {
        const affectedCount = data.affectedTenants?.length || data.impactedCount || 0;
        setNotice(
          `Plano "${planToApply.name}" aplicado com sucesso! ${affectedCount} loja(s) vinculada(s) sincronizada(s) automaticamente conforme vigência (${vigencia}).`
        );
      }
      setImpactModalOpen(false);
      setPlanToApply(null);
      await fetchPlans();
      await fetchClients();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao aplicar plano.");
    } finally {
      setApplyingPlan(false);
    }
  };

  const handleOpenDuplicate = (plan: PlanItem) => {
    setSourcePlanForDuplicate(plan);
    setDuplicateNewId(`${plan.id}-copia`);
    setDuplicateNewName(`${plan.name} (Cópia)`);
    setDuplicateModalOpen(true);
  };

  const handleConfirmDuplicate = async () => {
    if (!sourcePlanForDuplicate || !duplicateNewId.trim()) return;
    setDuplicating(true);
    try {
      const res = await fetch("/api/crm/admin/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          action: "duplicate",
          sourcePlanId: sourcePlanForDuplicate.id,
          newPlanId: duplicateNewId.trim(),
          newName: duplicateNewName.trim()
        })
      });
      if (!res.ok) throw new Error();
      setNotice(`Plano duplicado com sucesso: "${duplicateNewName}"`);
      setDuplicateModalOpen(false);
      await fetchPlans();
    } catch {
      setError("Falha ao duplicar plano.");
    } finally {
      setDuplicating(false);
    }
  };

  const handleTogglePlanStatus = async (plan: PlanItem) => {
    try {
      const nextStatus = !(plan.isActive !== false);
      const res = await fetch("/api/crm/admin/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          action: "toggle_status",
          planId: plan.id,
          isActive: nextStatus
        })
      });
      if (!res.ok) throw new Error();
      setNotice(`Plano "${plan.name}" ${nextStatus ? "ativado" : "desativado"}.`);
      await fetchPlans();
    } catch {
      setError("Falha ao alterar status do plano.");
    }
  };

  const handleDeletePlan = async (plan: PlanItem) => {
    if (plan.id === "crm-trial" || plan.id === "crm-premium") {
      setError("Os planos oficiais base (Teste Grátis e CRM Premium) são obrigatórios e não podem ser excluídos.");
      return;
    }
    const enrolled = clientCountsMap[plan.id] ?? 0;
    const confirmMsg = enrolled > 0
      ? `ATENÇÃO: Existem ${enrolled} loja(s) vinculada(s) ao plano "${plan.name}". Tem certeza que deseja EXCLUIR permanentemente este plano do catálogo?`
      : `Tem certeza que deseja excluir permanentemente o plano "${plan.name}" do catálogo? Esta ação não pode ser desfeita.`;
    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await fetch("/api/crm/admin/plans", {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao excluir plano.");
      setNotice(`Plano "${plan.name}" excluído com sucesso do catálogo.`);
      await fetchPlans();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao excluir plano.");
    }
  };

  const handleViewEnrolledStores = (plan: PlanItem) => {
    setSelectedPlanForStores(plan);
    setEnrolledModalOpen(true);
  };

  const handleOpenAuditHistory = async () => {
    setHistoryModalOpen(true);
    setLoadingHistory(true);
    try {
      const res = await fetch("/api/crm/admin/plans/history", {
        credentials: "same-origin",
        cache: "no-store"
      });
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.history || []);
      }
    } catch {
      setError("Falha ao carregar histórico de alterações.");
    } finally {
      setLoadingHistory(false);
    }
  };

  // Open Assign Plan Modal for a client
  const handleOpenAssignModal = (client: Client) => {
    setSelectedClientForPlan(client);
    const cur = plans.find(p => p.id === client.plan.planId || p.name === client.plan.name) || plans[0];
    setTargetPlanToAssign(cur);
    if (client.plan.customQuotaOverride) {
      setCustomQuotaChecked(true);
      setCustomQuotaValue(client.plan.customQuotaOverride);
      setCustomQuotaReason(client.plan.exceptionReason || "");
    } else {
      setCustomQuotaChecked(false);
      setCustomQuotaValue(cur.quotaLimit);
      setCustomQuotaReason("");
    }
    setChangePlanModalOpen(true);
  };

  const handleAssignPlan = async () => {
    if (!selectedClientForPlan) return;
    setAssigningPlan(true);
    setError("");
    try {
      const res = await fetch("/api/crm/admin/plans", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          tenantId: selectedClientForPlan.id,
          planId: targetPlanToAssign.id,
          planName: targetPlanToAssign.name,
          planPrice: targetPlanToAssign.price,
          quotaLimit: targetPlanToAssign.quotaLimit,
          customQuotaOverride: customQuotaChecked ? Number(customQuotaValue) : null,
          exceptionReason: customQuotaChecked ? customQuotaReason.trim() : null
        })
      });
      if (!res.ok) throw new Error();
      setNotice(
        `Plano da loja "${selectedClientForPlan.name}" atualizado para ${targetPlanToAssign.name}${
          customQuotaChecked ? ` com exceção contratual (${customQuotaValue} msgs)` : ""
        }!`
      );
      setChangePlanModalOpen(false);
      await fetchClients();
      await fetchPlans();
    } catch {
      setError("Falha ao atualizar plano da loja.");
    } finally {
      setAssigningPlan(false);
    }
  };

  const handleToggleBlock = (client: Client) => {
    setClientToBlock(client);
    setBlockPublicReason(
      client.plan.adminSuspensionReason ||
        "Conta suspensa administrativamente. Entre em contato com o suporte financeiro NovaesWeb."
    );
    setBlockInternalNote(client.plan.adminInternalNote || "");
    setBlockModalOpen(true);
  };

  const handleConfirmToggleBlock = async () => {
    if (!clientToBlock) return;
    const isSuspended = clientToBlock.status === "suspended";
    setTogglingBlock(true);
    setError("");
    try {
      const res = await fetch("/api/crm/admin/clients", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: clientToBlock.id,
          action: "toggle_block",
          suspend: !isSuspended,
          publicReason: !isSuspended ? blockPublicReason.trim() : undefined,
          internalNote: blockInternalNote.trim() || undefined
        })
      });
      if (!res.ok) throw new Error();
      setNotice(`Status da loja ${clientToBlock.name} atualizado para ${isSuspended ? "Ativo (Liberado)" : "Suspenso Administrativamente"}.`);
      setBlockModalOpen(false);
      setClientToBlock(null);
      await fetchClients();
    } catch {
      setError("Falha ao alterar status de bloqueio.");
    } finally {
      setTogglingBlock(false);
    }
  };

  const handleResolveUpgradeRequest = async (reqItem: UpgradeRequestItem, decision: "approved" | "rejected") => {
    setResolvingUpgradeId(reqItem.id);
    setError("");
    try {
      const res = await fetch("/api/crm/admin/clients", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: reqItem.tenantId,
          action: "resolve_upgrade_request",
          requestId: reqItem.id,
          decision
        })
      });
      if (!res.ok) throw new Error();
      setNotice(
        decision === "approved"
          ? `Upgrade aprovado! Loja "${reqItem.storeName}" migrada para ${reqItem.targetPlanName}.`
          : `Solicitação de upgrade de "${reqItem.storeName}" rejeitada.`
      );
      await fetchClients();
      await fetchPlans();
    } catch {
      setError("Falha ao processar solicitação de upgrade.");
    } finally {
      setResolvingUpgradeId(null);
    }
  };

  const handleSetPaymentStatus = async (client: Client, newStatus: "paid" | "pending") => {
    try {
      const res = await fetch("/api/crm/admin/clients", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: client.id,
          action: "set_payment_status",
          paymentStatus: newStatus
        })
      });
      if (!res.ok) throw new Error();
      setNotice(`Pagamento da loja ${client.name} marcado como ${newStatus === "paid" ? "PAGO (Liberado)" : "PENDENTE"}.`);
      await fetchClients();
    } catch {
      setError("Falha ao atualizar status de pagamento.");
    }
  };

  const handleDeleteClient = async (client: Client) => {
    const typed = window.prompt(`ATENÇÃO: apagar PERMANENTEMENTE a loja "${client.name}" (conversas, configurações, agentes e instância WhatsApp). Esta ação não pode ser desfeita.\n\nDigite o nome da loja para confirmar:`);
    if (typed === null) return;
    if (typed.trim().toLowerCase() !== client.name.trim().toLowerCase()) {
      setError("Nome digitado não confere. Exclusão cancelada.");
      return;
    }
    const deleteLogin = window.confirm(`Apagar também o LOGIN do cliente responsável (se ele não tiver outras lojas)?\n\nOK = apagar loja e login\nCancelar = apagar só a loja (o login continua como "Aguardando Vinculação")`);

    try {
      const res = await fetch(`/api/crm/admin/clients?tenantId=${encodeURIComponent(client.id)}&deleteLogin=${deleteLogin}`, {
        method: "DELETE",
        credentials: "same-origin"
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        setError(errJson.message || "Falha ao apagar cliente.");
        return;
      }
      setNotice(`Loja "${client.name}" apagada permanentemente${deleteLogin ? " (login removido quando possível)" : ""}.`);
      await fetchClients();
      await fetchUsers();
    } catch {
      setError("Falha ao apagar cliente.");
    }
  };

  const handleDeleteUser = async (user: ClientUser) => {
    const typed = window.prompt(`ATENÇÃO: apagar PERMANENTEMENTE o login de "${user.name}" (${user.email}). Esta ação não pode ser desfeita.\n\nDigite o e-mail do cliente para confirmar:`);
    if (typed === null) return;
    if (typed.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
      setError("E-mail digitado não confere. Exclusão cancelada.");
      return;
    }
    try {
      const res = await fetch(`/api/crm/admin/users?userId=${encodeURIComponent(user.id)}`, {
        method: "DELETE",
        credentials: "same-origin"
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        setError(errJson.message || "Falha ao apagar o cliente.");
        return;
      }
      setNotice(`Cliente "${user.name}" apagado permanentemente.`);
      await fetchUsers();
    } catch {
      setError("Falha ao apagar o cliente.");
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetUserId || newPassword.length < 6) return;
    setResetting(true);
    try {
      const res = await fetch("/api/crm/admin/clients", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: resetUserId,
          action: "reset_password",
          userId: resetUserId,
          newPassword
        })
      });
      if (!res.ok) throw new Error();
      setNotice(`Senha da loja "${resetStoreName}" alterada com sucesso!`);
      setResetModalOpen(false);
      setNewPassword("");
    } catch {
      setError("Falha ao alterar senha.");
    } finally {
      setResetting(false);
    }
  };

  // Smooth Skeleton Loading while verifying session or redirecting unauthorized users
  if (loading || !authenticated) {
    return <MasterAdminSkeleton />;
  }

  // Obsolete fallback - will not render because of condition above
  if (false as boolean) {
    return (
      <main
        style={{
          position: "relative",
          minHeight: "100vh",
          width: "100%",
          backgroundColor: "#07030c",
          backgroundImage: `
            radial-gradient(ellipse 65% 50% at 12% 18%, rgba(217, 70, 239, 0.32) 0%, rgba(147, 51, 234, 0.14) 42%, transparent 70%),
            radial-gradient(ellipse 60% 48% at 18% 92%, rgba(244, 63, 94, 0.38) 0%, rgba(225, 29, 72, 0.18) 46%, transparent 75%),
            radial-gradient(ellipse 55% 45% at 94% 88%, rgba(217, 70, 239, 0.32) 0%, rgba(168, 85, 247, 0.14) 50%, transparent 75%),
            radial-gradient(ellipse 42% 38% at 92% 10%, rgba(225, 29, 72, 0.25) 0%, transparent 60%)
          `,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "32px 24px",
          color: "#ffffff",
          fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          overflow: "hidden"
        }}
      >
        {/* Luminous Neon Silk Ribbon Curves (SVG overlay matching reference image) */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 1,
            overflow: "hidden"
          }}
        >
          <svg
            style={{ position: "absolute", top: "-10%", left: "-10%", width: "120%", height: "120%", opacity: 0.7 }}
            viewBox="0 0 1440 900"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M-80 230 C 220 70, 260 400, 520 270 C 760 150, 880 490, 1560 820"
              stroke="url(#neon-magenta)"
              strokeWidth="64"
              strokeLinecap="round"
              filter="blur(40px)"
            />
            <path
              d="M-50 220 C 240 80, 280 390, 520 280 C 760 170, 890 480, 1520 800"
              stroke="#ff1493"
              strokeWidth="10"
              strokeLinecap="round"
              filter="blur(8px)"
            />
            <path
              d="M-40 840 C 320 730, 440 900, 780 830 C 1080 770, 1220 940, 1540 830"
              stroke="url(#neon-red)"
              strokeWidth="74"
              filter="blur(46px)"
            />
            <path
              d="M-40 840 C 320 730, 440 900, 780 830 C 1080 770, 1220 940, 1540 830"
              stroke="#ff1e42"
              strokeWidth="8"
              filter="blur(7px)"
            />
            <defs>
              <linearGradient id="neon-magenta" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ec4899" />
                <stop offset="50%" stopColor="#d946ef" />
                <stop offset="100%" stopColor="#8b5cf6" />
              </linearGradient>
              <linearGradient id="neon-red" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ff1744" />
                <stop offset="50%" stopColor="#e11d48" />
                <stop offset="100%" stopColor="#a824e8" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        {/* Central Content Container: 2-column landscape on desktop */}
        <div
          style={{
            position: "relative",
            zIndex: 2,
            width: "100%",
            maxWidth: "1160px",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
            alignItems: "center",
            gap: "52px",
            margin: "0 auto"
          }}
        >
          {/* LEFT COLUMN: Brand identity, headline, subtitle, 4 feature cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
            {/* Brand Header: mascot + typography */}
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              {/* Mascot Robot Head wearing glowing headphones */}
              <div
                style={{
                  position: "relative",
                  width: "70px",
                  height: "70px",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <svg width="70" height="70" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                  {/* Glowing headphone band */}
                  <path
                    d="M16 38 C 16 22, 25 14, 36 14 C 47 14, 56 22, 56 38"
                    stroke="#ec4899"
                    strokeWidth="4.5"
                    strokeLinecap="round"
                    filter="drop-shadow(0 0 6px #ec4899)"
                  />
                  {/* Left earphone pad */}
                  <rect x="10" y="32" width="8" height="18" rx="4" fill="#a855f7" filter="drop-shadow(0 0 6px #a855f7)" />
                  {/* Right earphone pad */}
                  <rect x="54" y="32" width="8" height="18" rx="4" fill="#a855f7" filter="drop-shadow(0 0 6px #a855f7)" />
                  {/* Cute robot face pill */}
                  <rect x="18" y="24" width="36" height="32" rx="14" fill="#ffffff" />
                  {/* Friendly eyes */}
                  <circle cx="28" cy="38" r="2.8" fill="#1e1035" />
                  <circle cx="44" cy="38" r="2.8" fill="#1e1035" />
                  {/* Cute smile */}
                  <path d="M31 43 Q 36 48, 41 43" stroke="#1e1035" strokeWidth="2.2" strokeLinecap="round" fill="none" />
                  {/* Rosy cheeks */}
                  <circle cx="24" cy="42" r="2" fill="#f43f5e" opacity="0.6" />
                  <circle cx="48" cy="42" r="2" fill="#f43f5e" opacity="0.6" />
                </svg>
              </div>

              {/* Brand Typography with red swoosh over Web */}
              <div style={{ position: "relative", display: "flex", flexDirection: "column" }}>
                <div style={{ position: "relative", display: "inline-flex", alignItems: "baseline" }}>
                  <span style={{ fontSize: "28px", fontWeight: 900, color: "#ffffff", letterSpacing: "-0.5px" }}>
                    Novaes
                  </span>
                  <span style={{ fontSize: "28px", fontWeight: 900, color: "#ff1e42", letterSpacing: "-0.5px" }}>
                    Web
                  </span>
                  {/* Curved dynamic swoosh arch over Web */}
                  <svg
                    style={{
                      position: "absolute",
                      top: "-10px",
                      right: "-12px",
                      width: "80px",
                      height: "28px",
                      overflow: "visible",
                      pointerEvents: "none"
                    }}
                    viewBox="0 0 80 28"
                    fill="none"
                  >
                    <path
                      d="M2 24 C 24 2, 54 2, 78 18"
                      stroke="#ff1e42"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
                <span
                  style={{
                    fontSize: "22px",
                    fontWeight: 900,
                    letterSpacing: "1px",
                    background: "linear-gradient(90deg, #ffffff 0%, #fbcfe8 50%, #c084fc 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    textTransform: "uppercase",
                    marginTop: "-4px"
                  }}
                >
                  CRM IA
                </span>
              </div>
            </div>

            {/* Pill Badge: Painel Master */}
            <div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "6px 14px",
                  borderRadius: "9999px",
                  background: "rgba(42, 14, 48, 0.7)",
                  border: "1px solid rgba(236, 72, 153, 0.45)",
                  boxShadow: "0 0 16px rgba(236, 72, 153, 0.25)"
                }}
              >
                <Crown size={14} style={{ color: "#fbbf24" }} />
                <span style={{ fontSize: "13px", fontWeight: 700, color: "#f5d0fe", letterSpacing: "0.2px" }}>
                  Painel Master
                </span>
              </div>
            </div>

            {/* Main Headline */}
            <h1
              style={{
                fontSize: "clamp(26px, 3.2vw, 36px)",
                fontWeight: 900,
                lineHeight: 1.15,
                color: "#ffffff",
                letterSpacing: "-0.6px",
                margin: 0
              }}
            >
              Central de Gestão<br />do NovaesWeb CRM IA
            </h1>

            {/* Subtitle */}
            <p
              style={{
                fontSize: "14px",
                lineHeight: 1.6,
                color: "rgba(226, 232, 240, 0.75)",
                margin: 0,
                maxWidth: "460px"
              }}
            >
              Administre planos, clientes, IA, WhatsApp, funcionalidades e toda a operação da plataforma em um só lugar.
            </p>

            {/* 4 Feature Cards */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                gap: "10px",
                marginTop: "12px"
              }}
            >
              {/* Card 1 */}
              <div
                style={{
                  background: "rgba(24, 12, 32, 0.55)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "14px",
                  padding: "16px 8px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  gap: "8px",
                  backdropFilter: "blur(10px)",
                  boxShadow: "0 4px 18px rgba(0, 0, 0, 0.35)"
                }}
              >
                <Users size={22} style={{ color: "#f1f5f9" }} />
                <span style={{ fontSize: "11px", fontWeight: 600, color: "#e2e8f0", lineHeight: 1.3 }}>
                  Clientes e<br />Empresas
                </span>
              </div>

              {/* Card 2 */}
              <div
                style={{
                  background: "rgba(24, 12, 32, 0.55)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "14px",
                  padding: "16px 8px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  gap: "8px",
                  backdropFilter: "blur(10px)",
                  boxShadow: "0 4px 18px rgba(0, 0, 0, 0.35)"
                }}
              >
                <Layers size={22} style={{ color: "#f1f5f9" }} />
                <span style={{ fontSize: "11px", fontWeight: 600, color: "#e2e8f0", lineHeight: 1.3 }}>
                  Planos e<br />Franquias
                </span>
              </div>

              {/* Card 3 */}
              <div
                style={{
                  background: "rgba(24, 12, 32, 0.55)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "14px",
                  padding: "16px 8px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  gap: "8px",
                  backdropFilter: "blur(10px)",
                  boxShadow: "0 4px 18px rgba(0, 0, 0, 0.35)"
                }}
              >
                <Bot size={22} style={{ color: "#f1f5f9" }} />
                <span style={{ fontSize: "11px", fontWeight: 600, color: "#e2e8f0", lineHeight: 1.3 }}>
                  IA e<br />Modelos
                </span>
              </div>

              {/* Card 4 */}
              <div
                style={{
                  background: "rgba(24, 12, 32, 0.55)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "14px",
                  padding: "16px 8px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  gap: "8px",
                  backdropFilter: "blur(10px)",
                  boxShadow: "0 4px 18px rgba(0, 0, 0, 0.35)"
                }}
              >
                <BarChart3 size={22} style={{ color: "#f1f5f9" }} />
                <span style={{ fontSize: "11px", fontWeight: 600, color: "#e2e8f0", lineHeight: 1.3 }}>
                  Relatórios e<br />Uso
                </span>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Frosted Glass Login Card */}
          <div style={{ display: "flex", justifyContent: "center" }}>
            <div
              style={{
                width: "100%",
                maxWidth: "430px",
                background: "rgba(24, 12, 34, 0.68)",
                backdropFilter: "blur(28px)",
                WebkitBackdropFilter: "blur(28px)",
                border: "1px solid rgba(255, 255, 255, 0.14)",
                borderRadius: "28px",
                padding: "36px 32px",
                boxShadow: "0 24px 60px rgba(0, 0, 0, 0.65), 0 0 32px rgba(217, 70, 239, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.16)"
              }}
            >
              {/* Crown Icon Emblem */}
              <div
                style={{
                  width: "52px",
                  height: "52px",
                  margin: "0 auto 16px",
                  borderRadius: "14px",
                  background: "linear-gradient(135deg, #7c3aed 0%, #c026d3 100%)",
                  boxShadow: "0 6px 20px rgba(192, 38, 211, 0.45)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <Crown size={24} style={{ color: "#fef08a" }} />
              </div>

              {/* Title and Subtitle */}
              <h2
                style={{
                  fontSize: "22px",
                  fontWeight: 800,
                  color: "#ffffff",
                  textAlign: "center",
                  margin: 0,
                  letterSpacing: "-0.3px"
                }}
              >
                Acesso ao Painel Master
              </h2>
              <p
                style={{
                  fontSize: "13px",
                  color: "#c4b5fd",
                  textAlign: "center",
                  margin: "4px 0 24px",
                  fontWeight: 500
                }}
              >
                NovaesWeb CRM IA
              </p>

              {/* Form */}
              <form onSubmit={handleMasterLogin} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {/* Input 1: E-mail do administrador */}
                <div style={{ position: "relative", width: "100%" }}>
                  <Mail
                    size={18}
                    style={{
                      position: "absolute",
                      left: "14px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "#94a3b8",
                      pointerEvents: "none"
                    }}
                  />
                  <input
                    type="email"
                    placeholder="E-mail do administrador"
                    value={adminEmail}
                    onChange={e => setAdminEmail(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "13px 14px 13px 44px",
                      background: "rgba(12, 6, 18, 0.7)",
                      border: "1px solid rgba(255, 255, 255, 0.14)",
                      borderRadius: "12px",
                      color: "#ffffff",
                      fontSize: "14px",
                      outline: "none",
                      transition: "border-color 0.2s, box-shadow 0.2s"
                    }}
                    onFocus={e => {
                      e.target.style.borderColor = "#d946ef";
                      e.target.style.boxShadow = "0 0 0 3px rgba(217, 70, 239, 0.25)";
                    }}
                    onBlur={e => {
                      e.target.style.borderColor = "rgba(255, 255, 255, 0.14)";
                      e.target.style.boxShadow = "none";
                    }}
                  />
                </div>

                {/* Input 2: Senha */}
                <div style={{ position: "relative", width: "100%" }}>
                  <Lock
                    size={18}
                    style={{
                      position: "absolute",
                      left: "14px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "#94a3b8",
                      pointerEvents: "none"
                    }}
                  />
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Senha"
                    value={adminPassword}
                    onChange={e => {
                      setAdminPassword(e.target.value);
                      setInputKey(e.target.value);
                    }}
                    required
                    style={{
                      width: "100%",
                      padding: "13px 44px 13px 44px",
                      background: "rgba(12, 6, 18, 0.7)",
                      border: "1px solid rgba(255, 255, 255, 0.14)",
                      borderRadius: "12px",
                      color: "#ffffff",
                      fontSize: "14px",
                      outline: "none",
                      transition: "border-color 0.2s, box-shadow 0.2s"
                    }}
                    onFocus={e => {
                      e.target.style.borderColor = "#d946ef";
                      e.target.style.boxShadow = "0 0 0 3px rgba(217, 70, 239, 0.25)";
                    }}
                    onBlur={e => {
                      e.target.style.borderColor = "rgba(255, 255, 255, 0.14)";
                      e.target.style.boxShadow = "none";
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Ocultar senha" : "Exibir senha"}
                    style={{
                      position: "absolute",
                      right: "12px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "none",
                      border: "none",
                      color: "#94a3b8",
                      cursor: "pointer",
                      padding: "4px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center"
                    }}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>

                {/* Row: Manter-me conectado & Esqueceu a senha? */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginTop: "4px",
                    fontSize: "13px"
                  }}
                >
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      color: "#cbd5e1",
                      cursor: "pointer",
                      userSelect: "none"
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={e => setRememberMe(e.target.checked)}
                      style={{
                        accentColor: "#d946ef",
                        width: "16px",
                        height: "16px",
                        cursor: "pointer"
                      }}
                    />
                    <span>Manter-me conectado</span>
                  </label>

                  <button
                    type="button"
                    onClick={() => setForgotModalOpen(true)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#c084fc",
                      fontSize: "13px",
                      cursor: "pointer",
                      padding: 0,
                      textDecoration: "none",
                      fontWeight: 500
                    }}
                    onMouseEnter={e => (e.currentTarget.style.textDecoration = "underline")}
                    onMouseLeave={e => (e.currentTarget.style.textDecoration = "none")}
                  >
                    Esqueceu a senha?
                  </button>
                </div>

                {/* Primary Button: Entrar no Painel Master */}
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    width: "100%",
                    padding: "13px 20px",
                    borderRadius: "12px",
                    border: "none",
                    marginTop: "10px",
                    cursor: loading ? "wait" : "pointer",
                    background: "linear-gradient(90deg, #ff1e42 0%, #e11d48 35%, #a824e8 100%)",
                    boxShadow: "0 6px 22px rgba(225, 29, 72, 0.4)",
                    color: "#ffffff",
                    fontWeight: 700,
                    fontSize: "15px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "10px",
                    transition: "all 0.2s"
                  }}
                  onMouseEnter={e => {
                    if (!loading) {
                      e.currentTarget.style.filter = "brightness(1.08)";
                      e.currentTarget.style.boxShadow = "0 8px 26px rgba(225, 29, 72, 0.55)";
                    }
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.filter = "none";
                    e.currentTarget.style.boxShadow = "0 6px 22px rgba(225, 29, 72, 0.4)";
                  }}
                >
                  <LogIn size={18} />
                  <span>{loading ? "Verificando..." : "Entrar no Painel Master"}</span>
                </button>
              </form>

              {/* Error message */}
              {error && (
                <div
                  role="alert"
                  style={{
                    marginTop: "16px",
                    padding: "12px 14px",
                    borderRadius: "10px",
                    background: "rgba(225, 29, 72, 0.15)",
                    border: "1px solid rgba(225, 29, 72, 0.4)",
                    color: "#fecdd3",
                    fontSize: "13px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px"
                  }}
                >
                  <AlertCircle size={16} style={{ color: "#fb7185", flexShrink: 0 }} />
                  <span>{error}</span>
                </div>
              )}

              {/* Security Footer Note */}
              <div
                style={{
                  marginTop: "24px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  color: "rgba(203, 213, 225, 0.65)",
                  fontSize: "12px",
                  textAlign: "center"
                }}
              >
                <ShieldCheck size={16} style={{ color: "#94a3b8", flexShrink: 0 }} />
                <span>Acesso seguro e restrito aos gestores da NovaesWeb.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal: Esqueceu a Senha */}
        {forgotModalOpen && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 100,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "20px",
              background: "rgba(0, 0, 0, 0.75)",
              backdropFilter: "blur(12px)"
            }}
          >
            <div
              style={{
                width: "100%",
                maxWidth: "460px",
                background: "#160b24",
                border: "1px solid rgba(236, 72, 153, 0.4)",
                borderRadius: "20px",
                padding: "28px",
                boxShadow: "0 20px 50px rgba(0, 0, 0, 0.8)",
                position: "relative"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <Crown size={20} style={{ color: "#ec4899" }} />
                  <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#ffffff" }}>
                    Recuperação de Acesso Master
                  </h3>
                </div>
                <button
                  onClick={() => setForgotModalOpen(false)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#94a3b8",
                    cursor: "pointer",
                    padding: "4px"
                  }}
                >
                  <X size={20} />
                </button>
              </div>

              <div style={{ color: "#cbd5e1", fontSize: "13.5px", lineHeight: 1.6, display: "flex", flexDirection: "column", gap: "12px" }}>
                <p style={{ margin: 0 }}>
                  O acesso Master é restrito e autenticado pelo segredo criptográfico configurado nas variáveis de ambiente do servidor.
                </p>

                <p style={{ margin: 0, color: "#94a3b8", fontSize: "12px" }}>
                  Solicite a recuperação ao responsável pela administração da NovaesWeb. As credenciais de acesso não são exibidas no painel.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setForgotModalOpen(false)}
                style={{
                  width: "100%",
                  marginTop: "20px",
                  padding: "11px",
                  borderRadius: "10px",
                  border: "none",
                  background: "linear-gradient(90deg, #ec4899, #a855f7)",
                  color: "#ffffff",
                  fontWeight: 700,
                  fontSize: "14px",
                  cursor: "pointer"
                }}
              >
                Voltar para o Login
              </button>
            </div>
          </div>
        )}
      </main>
    );
  }

  return (
    <div className="nw-layout-shell">
      {/* MENU LATERAL FIXO MASTER (SIDEBAR) */}
      <aside className={`nw-sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
        <div className="nw-sidebar-brand" style={{display: "flex", alignItems: "center", justifyContent: sidebarCollapsed ? "center" : "space-between", gap: "10px"}}>
          <div style={{display: "flex", alignItems: "center", gap: "10px", minWidth: 0}}>
            <img
              src="/novaes-crm-logo.jpg"
              alt="Novaes CRM IA"
              style={{
                width: "38px",
                height: "38px",
                borderRadius: "10px",
                objectFit: "cover",
                border: "1px solid rgba(236, 72, 153, 0.4)",
                boxShadow: "0 0 15px rgba(236, 72, 153, 0.3)",
                flexShrink: 0
              }}
            />
            <div className="nw-sidebar-brand-text">
              <strong style={{display: "block", fontSize: "15px", color: "#fff", letterSpacing: "-0.3px", fontWeight: 800, whiteSpace: "nowrap"}}>
                Novaes <span style={{background: "linear-gradient(90deg, #ec4899, #ef4444)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent"}}>CRM IA</span>
              </strong>
              <small style={{display: "block", fontSize: "10px", color: "#f43f5e", fontWeight: 800, letterSpacing: "0.6px", textTransform: "uppercase"}}>
                Painel Master
              </small>
            </div>
          </div>
          <button
            type="button"
            className="nw-sidebar-toggle-btn"
            title={sidebarCollapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>

        {/* Navegação Master Unificada e Agrupada */}
        <nav className="nw-sidebar-nav" aria-label="Menu do Master">
          {/* GRUPO 1: GESTÃO DA PLATAFORMA */}
          <div className="nw-sidebar-group-header">
            <Building2 size={13} style={{ color: "#ec4899" }}/>
            <span>Gestão da Plataforma</span>
          </div>

          <button
            type="button"
            className={`nw-nav-button ${currentNav === "users" ? "active" : ""}`}
            aria-current={currentNav === "users" ? "page" : undefined}
            title="Criar Login / Clientes"
            onClick={() => navigateSection("users")}
          >
            <UserCheck size={18}/>
            <span>Criar Login &amp; Clientes</span>
            {sidebarCollapsed ? (
              users.length > 0 && <span className="nw-nav-badge-dot" title={`${users.length} logins`} />
            ) : (
              <span style={{marginLeft: "auto", background: "rgba(255,255,255,0.2)", padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 700}}>
                {users.length}
              </span>
            )}
          </button>

          <button
            type="button"
            className={`nw-nav-button ${currentNav === "clients" ? "active" : ""}`}
            aria-current={currentNav === "clients" ? "page" : undefined}
            title="Empresas & Lojas"
            onClick={() => navigateSection("clients")}
          >
            <Building2 size={18}/>
            <span>Empresas &amp; Lojas</span>
            {sidebarCollapsed ? (
              clients.length > 0 && <span className="nw-nav-badge-dot" title={`${clients.length} lojas`} />
            ) : (
              <span style={{marginLeft: "auto", background: "rgba(255,255,255,0.2)", padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 700}}>
                {clients.length}
              </span>
            )}
          </button>

          <button
            type="button"
            className={`nw-nav-button ${currentNav === "plans" ? "active" : ""}`}
            aria-current={currentNav === "plans" ? "page" : undefined}
            title="Planos & Franquias"
            onClick={() => navigateSection("plans")}
          >
            <CreditCard size={18}/>
            <span>Planos &amp; Franquias</span>
            {!sidebarCollapsed && (
              <span style={{marginLeft: "auto", background: "rgba(236, 72, 153, 0.2)", color: "#ec4899", padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 700}}>
                {plans.length}
              </span>
            )}
          </button>

          <button
            type="button"
            className={`nw-nav-button ${currentNav === "recharges" ? "active" : ""}`}
            aria-current={currentNav === "recharges" ? "page" : undefined}
            title="Recargas & PIX"
            onClick={() => navigateSection("recharges")}
          >
            <Coins size={18}/>
            <span>Recargas &amp; PIX</span>
            {adminRecharges.filter(r => r.status === "pending").length > 0 ? (
              sidebarCollapsed ? (
                <span className="nw-nav-badge-dot" style={{ background: "#f59e0b", boxShadow: "0 0 6px #f59e0b" }} title={`${adminRecharges.filter(r => r.status === "pending").length} pendente(s)`} />
              ) : (
                <span style={{
                  marginLeft: "auto",
                  background: "rgba(245, 158, 11, 0.2)",
                  color: "#fcd34d",
                  border: "1px solid rgba(245, 158, 11, 0.4)",
                  padding: "2px 8px",
                  borderRadius: "10px",
                  fontSize: "11px",
                  fontWeight: 800
                }}>
                  {adminRecharges.filter(r => r.status === "pending").length} pendente{adminRecharges.filter(r => r.status === "pending").length > 1 ? "s" : ""}
                </span>
              )
            ) : !sidebarCollapsed ? (
              <span style={{marginLeft: "auto", background: "rgba(0, 219, 140, 0.15)", color: "#00db8c", padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 700}}>
                {adminRecharges.filter(r => r.status === "paid").length}
              </span>
            ) : null}
          </button>

          <button
            type="button"
            className={`nw-nav-button ${currentNav === "kpis" ? "active" : ""}`}
            aria-current={currentNav === "kpis" ? "page" : undefined}
            title="Faturamento & Métricas"
            onClick={() => navigateSection("kpis")}
          >
            <DollarSign size={18}/>
            <span>Faturamento &amp; Métricas</span>
          </button>

          <button
            type="button"
            className={`nw-nav-button ${currentNav === "radar" ? "active" : ""}`}
            aria-current={currentNav === "radar" ? "page" : undefined}
            title="Radar WhatsApp (Tempo Real)"
            onClick={() => navigateSection("radar")}
          >
            <Radio size={18}/>
            <span>Radar WhatsApp</span>
            {!sidebarCollapsed && (
              <span style={{
                marginLeft: "auto",
                background: "rgba(0, 219, 140, 0.15)",
                color: "#00db8c",
                padding: "2px 8px",
                borderRadius: "10px",
                fontSize: "11px",
                fontWeight: 700
              }}>
                Ao Vivo
              </span>
            )}
          </button>

          <button
            type="button"
            className={`nw-nav-button ${currentNav === "broadcast" ? "active" : ""}`}
            aria-current={currentNav === "broadcast" ? "page" : undefined}
            title="Avisos & Transmissão Global"
            onClick={() => navigateSection("broadcast")}
          >
            <Megaphone size={18}/>
            <span>Avisos Globais</span>
          </button>

          <button
            type="button"
            className={`nw-nav-button ${currentNav === "security" ? "active" : ""}`}
            aria-current={currentNav === "security" ? "page" : undefined}
            title="Segurança & Recuperação de Senha"
            onClick={() => { navigateSection("security"); void fetchMasterRecoverySettings(); }}
          >
            <KeyRound size={18}/>
            <span>Recuperação de Senha</span>
            {masterRecoveryVerified ? (
              !sidebarCollapsed && <span style={{marginLeft: "auto", color: "#34d399", fontSize: "11px", fontWeight: 700}}>✅ Ativo</span>
            ) : (
              !sidebarCollapsed && <span style={{marginLeft: "auto", color: "#f59e0b", fontSize: "11px", fontWeight: 700}}>⚠️ Pendente</span>
            )}
          </button>

          {/* DIVISOR DE GRUPO */}
          <div style={{height: "1px", background: "rgba(255,255,255,0.08)", margin: "10px 4px"}}/>

          {/* GRUPO 2: SERVIDOR & INTELIGÊNCIA ARTIFICIAL */}
          <div className="nw-sidebar-group-header">
            <BrainCircuit size={13} style={{ color: "#a855f7" }}/>
            <span>Servidor &amp; IA</span>
          </div>

          <button
            type="button"
            className={`nw-nav-button ${currentNav === "providers" ? "active" : ""}`}
            aria-current={currentNav === "providers" ? "page" : undefined}
            title="Provedores de IA & OmniRoute"
            onClick={() => navigateSection("providers")}
          >
            <BrainCircuit size={18}/>
            <span>Provedores de IA</span>
          </button>

          {/* DIVISOR DE GRUPO */}
          <div style={{height: "1px", background: "rgba(255,255,255,0.08)", margin: "10px 4px"}}/>

          {/* GRUPO 3: CRM PRÓPRIO — OPERAÇÃO NOVAESWEB */}
          <div className="nw-sidebar-group-header" style={{ justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Crown size={13} style={{ color: "#ec4899" }}/>
              <span style={{ color: "#ec4899" }}>CRM NovaesWeb</span>
            </div>
            <span style={{ fontSize: "9px", color: "#34d399", background: "rgba(52,211,153,0.15)", border: "1px solid rgba(52,211,153,0.3)", padding: "1px 6px", borderRadius: "6px", fontWeight: 700 }}>
              Ativo
            </span>
          </div>

          {/* Funções do CRM Próprio no menu lateral */}
          <button
            type="button"
            className={`nw-nav-button nw-subnav-button ${currentNav === "crm" && (!crmActiveTab || crmActiveTab === "atendimentos") ? "active-sub" : ""}`}
            aria-current={currentNav === "crm" && (!crmActiveTab || crmActiveTab === "atendimentos") ? "page" : undefined}
            title="Atendimentos & Chat"
            onClick={() => navigateCrm("atendimentos")}
          >
            <MessageCircle size={17}/>
            <span>Atendimentos &amp; Chat</span>
          </button>

          <button
            type="button"
            className={`nw-nav-button nw-subnav-button ${currentNav === "crm" && crmActiveTab === "whatsapp" ? "active-sub" : ""}`}
            aria-current={currentNav === "crm" && crmActiveTab === "whatsapp" ? "page" : undefined}
            title="WhatsApp (Conexões Comerciais)"
            onClick={() => navigateCrm("whatsapp")}
          >
            <Smartphone size={17}/>
            <span>WhatsApp (Conexões)</span>
          </button>

          <button
            type="button"
            className={`nw-nav-button nw-subnav-button ${currentNav === "crm" && crmActiveTab === "conhecimento" ? "active-sub" : ""}`}
            aria-current={currentNav === "crm" && crmActiveTab === "conhecimento" ? "page" : undefined}
            title="IA & Instruções"
            onClick={() => navigateCrm("conhecimento")}
          >
            <Bot size={17}/>
            <span>IA &amp; Instruções</span>
          </button>

          <button
            type="button"
            className={`nw-nav-button nw-subnav-button ${currentNav === "crm" && crmActiveTab === "artigos" ? "active-sub" : ""}`}
            aria-current={currentNav === "crm" && crmActiveTab === "artigos" ? "page" : undefined}
            title="Base de Conhecimento"
            onClick={() => navigateCrm("artigos")}
          >
            <BookOpen size={17}/>
            <span>Base de Conhecimento</span>
          </button>

          <button
            type="button"
            className={`nw-nav-button nw-subnav-button ${currentNav === "crm" && crmActiveTab === "contatos" ? "active-sub" : ""}`}
            aria-current={currentNav === "crm" && crmActiveTab === "contatos" ? "page" : undefined}
            title="Contatos & Clientes"
            onClick={() => navigateCrm("contatos")}
          >
            <Users size={17}/>
            <span>Contatos &amp; Clientes</span>
          </button>

          <button
            type="button"
            className={`nw-nav-button nw-subnav-button ${currentNav === "crm" && crmActiveTab === "horarios" ? "active-sub" : ""}`}
            aria-current={currentNav === "crm" && crmActiveTab === "horarios" ? "page" : undefined}
            title="Horários de Atendimento"
            onClick={() => navigateCrm("horarios")}
          >
            <Calendar size={17}/>
            <span>Horários de Atendimento</span>
          </button>

          <button
            type="button"
            className={`nw-nav-button nw-subnav-button ${currentNav === "crm" && crmActiveTab === "equipe" ? "active-sub" : ""}`}
            aria-current={currentNav === "crm" && crmActiveTab === "equipe" ? "page" : undefined}
            title="Equipe & Operadores"
            onClick={() => navigateCrm("equipe")}
          >
            <UserCheck size={17}/>
            <span>Equipe &amp; Operadores</span>
          </button>

          <button
            type="button"
            className={`nw-nav-button nw-subnav-button ${currentNav === "crm" && crmActiveTab === "relatorios" ? "active-sub" : ""}`}
            aria-current={currentNav === "crm" && crmActiveTab === "relatorios" ? "page" : undefined}
            title="Relatórios de Atendimento"
            onClick={() => navigateCrm("relatorios")}
          >
            <BarChart3 size={17}/>
            <span>Relatórios &amp; CSAT</span>
          </button>

          <button
            type="button"
            className={`nw-nav-button nw-subnav-button ${currentNav === "crm" && crmActiveTab === "simulador" ? "active-sub" : ""}`}
            aria-current={currentNav === "crm" && crmActiveTab === "simulador" ? "page" : undefined}
            title="Simulador de IA"
            onClick={() => navigateCrm("simulador")}
          >
            <Sparkles size={17}/>
            <span>Simulador de IA</span>
          </button>
        </nav>

        {/* Rodapé da Sidebar Master */}
        <div className="nw-sidebar-footer">
          <div style={{
            background: "rgba(244, 63, 94, 0.08)",
            border: "1px solid rgba(244, 63, 94, 0.25)",
            borderRadius: "12px",
            padding: "10px 12px",
            fontSize: "12px"
          }}>
            <div style={{display: "flex", alignItems: "center", gap: "8px", color: "#f43f5e", fontWeight: 700, marginBottom: "4px"}}>
              <ShieldCheck size={15}/> Central Master
            </div>
            <p style={{margin: 0, color: "#9ca3af", fontSize: "11px", lineHeight: "1.4"}}>
              Acesso restrito e irrestrito da administração.
            </p>
          </div>

          <button
            type="button"
            onClick={handleMasterLogout}
            title="Sair do Master"
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              padding: "10px",
              borderRadius: "10px",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "#e2e8f0",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            <LogOut size={16}/> {!sidebarCollapsed && <span>Sair do Master</span>}
          </button>
        </div>
      </aside>

      {/* ÁREA PRINCIPAL MASTER */}
      <main className="nw-main-content">
        {/* Top Header */}
        <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "16px"}}>
          <div>
            <h1 style={{fontSize: "28px", fontWeight: 800, margin: "0 0 6px", letterSpacing: "-0.5px"}}>
              {MASTER_SECTIONS[currentNav].title}
            </h1>
            <p style={{color: "#c2bed4", margin: 0, fontSize: "14px"}}>
              {MASTER_SECTIONS[currentNav].description}
            </p>
          </div>
          <div style={{display: "flex", gap: "10px"}}>
            {currentNav === "recharges" && (
              <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", width: "100%"}}>
                <div>
                  <h2 style={{margin: 0, fontSize: "22px", fontWeight: 900, display: "flex", alignItems: "center", gap: "10px"}}>
                    <Coins size={24} color="#ec4899"/> Central de Recargas &amp; Chave PIX
                  </h2>
                  <p style={{margin: "4px 0 0", fontSize: "13px", color: "#aba8bf"}}>
                    Aprove manualmente as recargas de mensagens após conferir o comprovante PIX e configure a chave de pagamento.
                  </p>
                </div>
                <div style={{display: "flex", gap: "10px"}}>
                  <button
                    type="button"
                    onClick={() => setPixModalOpen(true)}
                    className="op-primary"
                    style={{padding: "10px 18px", borderRadius: "10px", display: "flex", alignItems: "center", gap: "8px", fontWeight: 700}}
                  >
                    <Settings size={16}/> Configurar Chave PIX
                  </button>
                  <button
                    type="button"
                    onClick={handleExportRechargesCSV}
                    className="op-refresh"
                    style={{padding: "10px 16px", borderRadius: "10px", display: "flex", alignItems: "center", gap: "8px", fontWeight: 700}}
                    title="Exportar histórico de recargas financeiras em CSV"
                  >
                    <Download size={16}/> Exportar CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => void fetchRecharges()}
                    className="op-refresh"
                    style={{padding: "10px 14px", borderRadius: "10px"}}
                    title="Atualizar solicitações"
                  >
                    <RefreshCw size={16}/>
                  </button>
                </div>
              </div>
            )}

            {currentNav === "plans" && (
              <>
                <button
                  className="op-primary"
                  style={{display: "flex", alignItems: "center", gap: "8px", padding: "12px 18px", fontWeight: 700, borderRadius: "10px"}}
                  onClick={handleOpenCreatePlan}
                >
                  <PlusCircle size={18}/> + Novo Plano
                </button>
                <button
                  className="op-refresh"
                  style={{display: "flex", alignItems: "center", gap: "8px", padding: "12px 16px"}}
                  onClick={handleOpenAuditHistory}
                >
                  <History size={16}/> Histórico
                </button>
              </>
            )}
            {currentNav === "users" && (
              <>
                <button
                  className="op-primary"
                  style={{display: "flex", alignItems: "center", gap: "8px", padding: "12px 20px", fontWeight: 700, borderRadius: "10px", background: "linear-gradient(135deg, #a855f7, #7c3aed)"}}
                  onClick={() => setUserFormOpen(!userFormOpen)}
                >
                  <PlusCircle size={18}/> {userFormOpen ? "Fechar Formulário" : "+ Criar Login"}
                </button>
                <button className="op-refresh" onClick={() => { void fetchUsers(); }} disabled={loadingUsers}>
                  <RefreshCw size={16}/> Atualizar
                </button>
              </>
            )}
            {currentNav === "clients" && (
              <>
                <button
                  className="op-primary"
                  style={{display: "flex", alignItems: "center", gap: "8px", padding: "12px 20px", fontWeight: 700, borderRadius: "10px"}}
                  onClick={() => setFormOpen(!formOpen)}
                >
                  <PlusCircle size={18}/> {formOpen ? "Fechar Formulário" : "+ Criar Loja"}
                </button>
                <button
                  className="op-refresh"
                  style={{display: "flex", alignItems: "center", gap: "8px", padding: "12px 16px"}}
                  onClick={handleExportClientsCSV}
                  title="Exportar base completa de empresas em formato CSV (Excel)"
                >
                  <Download size={16}/> Exportar CSV
                </button>
              </>
            )}
            {currentNav === "kpis" && (
              <button
                className="op-refresh"
                style={{display: "flex", alignItems: "center", gap: "8px", padding: "12px 16px"}}
                onClick={handleExportClientsCSV}
                title="Exportar métricas de clientes em formato CSV (Excel)"
              >
                <Download size={16}/> Exportar Métricas (CSV)
              </button>
            )}
            {["clients", "plans", "kpis", "radar", "users"].includes(currentNav) && (
              <button className="op-refresh" onClick={() => { void fetchClients(); void fetchPlans(); void fetchUsers(); }} disabled={loading || loadingUsers}>
                <RefreshCw size={16}/> Atualizar
              </button>
            )}
          </div>
        </div>

        {/* FEEDBACKS */}
        {error && (
          <div className="op-card" style={{border: "1px solid #f43f5e", background: "rgba(80, 16, 28, 0.8)", color: "#ffccd5", padding: "14px 18px", marginBottom: "18px", display: "flex", alignItems: "center", gap: "10px"}}>
            <AlertCircle size={20} color="#f43f5e"/>
            <span>{error}</span>
          </div>
        )}

        {notice && (
          <div className="op-card" style={{border: "1px solid #00db8c", background: "rgba(6, 43, 30, 0.8)", color: "#b9f5dc", padding: "14px 18px", marginBottom: "18px", display: "flex", alignItems: "center", gap: "10px"}}>
            <CheckCircle2 size={20} color="#00db8c"/>
            <span>{notice}</span>
          </div>
        )}

        {currentNav === "providers" && <ProvidersWorkspace />}
        {currentNav === "crm" && (
          <ClientWorkspace
            embedded
            initialTenant="novaesweb"
            activeTabOverride={crmActiveTab}
            onTabChange={setCrmActiveTab}
          />
        )}
        {currentNav === "radar" && (
          <WhatsAppRadarSection
            clients={clients.map(c => ({
              id: c.id,
              name: c.name,
              email: c.email,
              planName: c.plan?.name,
              isTrial: c.plan?.isTrial,
              whatsappSlots: c.whatsappSlots,
              instanceName: c.instanceName,
              whatsappStatus: c.whatsappStatus
            }))}
            onRefresh={() => { void fetchClients(); }}
          />
        )}
        {currentNav === "broadcast" && (
          <BroadcastManagerSection
            onNotice={(msg) => setNotice(msg)}
            onError={(err) => setError(err)}
          />
        )}

        {/* FILA DE SOLICITAÇÕES DE UPGRADE DOS CLIENTES */}
        {currentNav === "clients" && upgradeRequests.filter(r => r.status === "pending").length > 0 && (
          <div
            className="op-card"
            style={{
              marginBottom: "22px",
              padding: "18px 22px",
              border: "1px solid rgba(245, 158, 11, 0.5)",
              background: "rgba(45, 28, 10, 0.45)"
            }}
          >
            <div style={{display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px"}}>
              <Sparkles size={20} color="#fbbf24"/>
              <h3 style={{margin: 0, fontSize: "16px", fontWeight: 800, color: "#fef08a"}}>
                Solicitações de Upgrade Pendentes ({upgradeRequests.filter(r => r.status === "pending").length})
              </h3>
            </div>
            <div style={{display: "flex", flexDirection: "column", gap: "10px"}}>
              {upgradeRequests
                .filter(r => r.status === "pending")
                .map(reqItem => (
                  <div
                    key={reqItem.id}
                    style={{
                      padding: "12px 16px",
                      borderRadius: "10px",
                      background: "rgba(0,0,0,0.35)",
                      border: "1px solid rgba(245, 158, 11, 0.3)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "12px"
                    }}
                  >
                    <div>
                      <strong style={{color: "#fff", fontSize: "14px"}}>
                        {reqItem.storeName}
                      </strong>{" "}
                      {reqItem.reason?.includes("IMPLANTAÇÃO VIP") && (
                        <span style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          marginLeft: "6px",
                          marginRight: "6px",
                          padding: "2px 8px",
                          borderRadius: "6px",
                          background: "linear-gradient(135deg, #eab308, #ca8a04)",
                          color: "#000",
                          fontSize: "11px",
                          fontWeight: 900
                        }}>
                          ⭐ IMPLANTAÇÃO VIP (+R$ 197)
                        </span>
                      )}
                      <span style={{fontSize: "12px", color: "#cbd5e1"}}>
                        solicitou upgrade de <strong>{reqItem.currentPlanName}</strong> para{" "}
                        <strong style={{color: "#ec4899"}}>{reqItem.targetPlanName}</strong>
                      </span>
                      {reqItem.reason && (
                        <small style={{display: "block", color: "#9ca3af", marginTop: "3px"}}>
                          Motivo/Recurso desejado: {reqItem.reason}
                        </small>
                      )}
                    </div>
                    <div style={{display: "flex", gap: "8px"}}>
                      <button
                        type="button"
                        className="op-primary"
                        disabled={resolvingUpgradeId === reqItem.id}
                        onClick={() => handleResolveUpgradeRequest(reqItem, "approved")}
                        style={{padding: "7px 14px", fontSize: "12px", background: "#00db8c", color: "#052e16", fontWeight: 800, borderRadius: "8px"}}
                      >
                        ✅ Aprovar &amp; Ativar {reqItem.targetPlanName}
                      </button>
                      <button
                        type="button"
                        className="op-refresh"
                        disabled={resolvingUpgradeId === reqItem.id}
                        onClick={() => handleResolveUpgradeRequest(reqItem, "rejected")}
                        style={{padding: "7px 12px", fontSize: "12px", color: "#f43f5e", borderRadius: "8px"}}
                      >
                        Recusar
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* ===================== VIEW: PLANOS & FRANQUIAS ===================== */}
        {currentNav === "plans" && (
          <section>
            <div style={{
              background: "linear-gradient(135deg, rgba(236, 72, 153, 0.12), rgba(139, 92, 246, 0.12))",
              border: "1px solid rgba(236, 72, 153, 0.3)",
              borderRadius: "14px",
              padding: "16px 20px",
              marginBottom: "24px",
              display: "flex",
              alignItems: "center",
              gap: "12px"
            }}>
              <Zap size={24} color="#ec4899"/>
              <div style={{fontSize: "14px", color: "#e2e8f0", lineHeight: "1.5"}}>
                <strong>Sincronização Automática Master:</strong> Ao editar um plano e confirmar a aplicação, as novas cotas e recursos são refletidos automaticamente em todas as lojas vinculadas elegíveis, preservando com segurança as exceções contratuais individuais.
              </div>
            </div>

            {/* Grid dos Planos */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
              gap: "24px",
              marginBottom: "36px"
            }}>
              {plans.map(p => {
                const enrolled = clientCountsMap[p.id] ?? planDistribution[p.name] ?? 0;
                const allowedFeats = p.allowedFeatures || [];
                const isActive = p.isActive !== false;
                return (
                  <div
                    key={p.id}
                    className="op-card"
                    style={{
                      position: "relative",
                      background: p.isPopular
                        ? "linear-gradient(145deg, #231638, #140e24)"
                        : "linear-gradient(145deg, #181427, #110d1d)",
                      border: p.isPopular ? "2px solid #ec4899" : isActive ? "1px solid #3d335c" : "1px dashed #574b6f",
                      boxShadow: p.isPopular ? "0 0 32px rgba(236, 72, 153, 0.22), 0 0 8px rgba(244, 63, 94, 0.3)" : undefined,
                      borderRadius: "18px",
                      padding: "26px",
                      display: "flex",
                      flexDirection: "column",
                      opacity: isActive ? 1 : 0.65
                    }}
                  >
                    <div style={{display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px"}}>
                      <div style={{display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap"}}>
                        <span style={{
                          background: "rgba(255,255,255,0.08)",
                          color: "#c2bed4",
                          padding: "2px 8px",
                          borderRadius: "6px",
                          fontSize: "11px",
                          fontWeight: 700,
                          fontFamily: "monospace"
                        }}>
                          ID: {p.id}
                        </span>
                        {!isActive && (
                          <span style={{
                            background: "rgba(244, 63, 94, 0.2)",
                            color: "#f43f5e",
                            padding: "2px 8px",
                            borderRadius: "6px",
                            fontSize: "11px",
                            fontWeight: 700
                          }}>
                            DESATIVADO
                          </span>
                        )}
                        {p.hasDraft && (
                          <span style={{
                            background: "rgba(245, 158, 11, 0.2)",
                            color: "#f59e0b",
                            border: "1px solid rgba(245, 158, 11, 0.4)",
                            padding: "2px 8px",
                            borderRadius: "6px",
                            fontSize: "11px",
                            fontWeight: 700
                          }}>
                            RASCUNHO PENDENTE
                          </span>
                        )}
                      </div>

                      {p.id === "crm-trial" && (
                        <span style={{
                          background: "linear-gradient(135deg, #9333ea, #c084fc)",
                          color: "white",
                          padding: "5px 14px",
                          borderRadius: "20px",
                          fontSize: "11px",
                          fontWeight: 900,
                          letterSpacing: "0.5px",
                          boxShadow: "0 0 16px rgba(168, 85, 247, 0.45)"
                        }}>
                          🎁 TESTE 7 DIAS
                        </span>
                      )}
                      {p.isPopular && (
                        <span style={{
                          background: "var(--grad-primary)",
                          color: "white",
                          padding: "5px 14px",
                          borderRadius: "20px",
                          fontSize: "11px",
                          fontWeight: 900,
                          letterSpacing: "0.5px",
                          boxShadow: "0 0 16px rgba(244, 63, 94, 0.45)"
                        }}>
                          ⭐ MAIS RECOMENDADO
                        </span>
                      )}
                    </div>

                    <div style={{marginBottom: "12px"}}>
                      <h3 style={{fontSize: "22px", fontWeight: 800, margin: "0 0 6px", color: "white"}}>{p.name}</h3>
                      <p style={{fontSize: "13px", color: "#c2bed4", margin: 0, minHeight: "36px"}}>{p.description}</p>
                    </div>

                    <div style={{marginBottom: "16px"}}>
                      {p.id === "crm-trial" ? (
                        <div style={{display: "flex", alignItems: "baseline", gap: "6px"}}>
                          <strong style={{fontSize: "30px", color: "#c084fc"}}>Gratuito</strong>
                          <span style={{fontSize: "13px", color: "#9ca3af"}}>(7 Dias)</span>
                        </div>
                      ) : (
                        <div>
                          <span style={{fontSize: "13px", color: "#9ca3af"}}>R$</span>
                          <strong style={{fontSize: "34px", color: "white", marginLeft: "4px"}}>{p.price}</strong>
                          <span style={{fontSize: "13px", color: "#9ca3af"}}>/mês</span>
                        </div>
                      )}
                    </div>

                    {/* Franquia & Limites Técnicos */}
                    <div style={{
                      background: "rgba(255,255,255,0.04)",
                      borderRadius: "10px",
                      padding: "12px 14px",
                      marginBottom: "16px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px"
                    }}>
                      <div style={{display: "flex", justifyContent: "space-between", alignItems: "center"}}>
                        <span style={{fontSize: "13px", color: "#e2e8f0", fontWeight: 600}}>
                          Franquia com IA:
                        </span>
                        <strong style={{fontSize: "14px", color: "#ec4899"}}>
                          {p.quotaLimit.toLocaleString("pt-BR")} mensagens IA / mês
                        </strong>
                      </div>
                      <small style={{fontSize: "11px", color: "#9ca3af", margin: "-2px 0 2px"}}>
                        (1 mensagem enviada pela IA = 1 unidade da franquia)
                      </small>
                      <div style={{display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#9ca3af"}}>
                        <span>Operadores: <strong style={{color: "white"}}>{p.maxOperators || 1}</strong></span>
                        <span>WhatsApps: <strong style={{color: "white"}}>{p.maxWhatsAppConnections || 1}</strong></span>
                      </div>
                    </div>

                    {/* Benefícios Reais e Incluídos */}
                    <div style={{marginBottom: "18px", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "14px", flex: 1}}>
                      <strong style={{display: "block", fontSize: "12px", color: "#a599c2", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px"}}>
                        Recursos e Benefícios Incluídos:
                      </strong>
                      <ul style={{listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "8px"}}>
                        {p.features.map(f => (
                          <li key={f} style={{display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "12.5px", color: "#e2e8f0", lineHeight: 1.4}}>
                            <Check size={14} color="#00db8c" style={{flexShrink: 0, marginTop: "2px"}}/>
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Lojas vinculadas e Botões de Ação */}
                    <div style={{borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "16px"}}>
                      <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px"}}>
                        <span style={{fontSize: "12px", color: "#9ca3af"}}>
                          Lojas neste plano: <strong style={{color: "white"}}>{enrolled}</strong>
                        </span>
                        <button
                          type="button"
                          onClick={() => handleViewEnrolledStores(p)}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "#ec4899",
                            fontSize: "12px",
                            fontWeight: 700,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "4px"
                          }}
                        >
                          <Eye size={13}/> Ver Lojas ({enrolled})
                        </button>
                      </div>

                      <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px"}}>
                        <button
                          type="button"
                          className="op-primary"
                          style={{padding: "8px", fontSize: "12px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px"}}
                          onClick={() => handleOpenEditPlan(p)}
                        >
                          <Edit3 size={14}/> Editar
                        </button>
                        <button
                          type="button"
                          className="op-refresh"
                          style={{padding: "8px", fontSize: "12px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px"}}
                          onClick={() => handleOpenDuplicate(p)}
                        >
                          <Copy size={14}/> Duplicar
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleTogglePlanStatus(p)}
                        style={{
                          width: "100%",
                          marginTop: "8px",
                          padding: "6px",
                          background: "transparent",
                          border: "1px solid rgba(255,255,255,0.08)",
                          borderRadius: "8px",
                          color: isActive ? "#9ca3af" : "#00db8c",
                          fontSize: "11px",
                          fontWeight: 600,
                          cursor: "pointer"
                        }}
                      >
                        {isActive ? "Desativar Plano" : "Ativar Plano"}
                      </button>

                      {p.id !== "crm-trial" && p.id !== "crm-premium" && (
                        <button
                          type="button"
                          onClick={() => handleDeletePlan(p)}
                          style={{
                            width: "100%",
                            marginTop: "6px",
                            padding: "6px",
                            background: "rgba(244, 63, 94, 0.08)",
                            border: "1px solid rgba(244, 63, 94, 0.25)",
                            borderRadius: "8px",
                            color: "#f43f5e",
                            fontSize: "11px",
                            fontWeight: 600,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "5px"
                          }}
                        >
                          <Trash2 size={13} /> Excluir Plano
                        </button>
                      )}

                      {p.hasDraft && (
                        <button
                          type="button"
                          onClick={() => handleDiscardDraft(p.id)}
                          style={{
                            width: "100%",
                            marginTop: "6px",
                            padding: "6px",
                            background: "rgba(245, 158, 11, 0.08)",
                            border: "1px dashed rgba(245, 158, 11, 0.35)",
                            borderRadius: "8px",
                            color: "#f59e0b",
                            fontSize: "11px",
                            fontWeight: 700,
                            cursor: "pointer"
                          }}
                        >
                          Descartar Rascunho Pendente
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Tabela de Lojas e Seus Planos */}
            <div className="op-card" style={{padding: "24px"}}>
              <h3 style={{fontSize: "18px", fontWeight: 800, margin: "0 0 8px", color: "white"}}>
                Atribuição Rápida de Planos por Loja
              </h3>
              <p style={{fontSize: "13px", color: "#9ca3af", margin: "0 0 16px"}}>
                Alterne o plano contratado ou defina uma exceção contratual individual para qualquer loja.
              </p>

              <div style={{display: "flex", flexDirection: "column", gap: "12px"}}>
                {clients.map(c => {
                  const hasException = Boolean(c.plan.customQuotaOverride);
                  return (
                    <div
                      key={c.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "14px 18px",
                        background: "rgba(255,255,255,0.03)",
                        borderRadius: "12px",
                        border: "1px solid #332b49",
                        flexWrap: "wrap",
                        gap: "12px"
                      }}
                    >
                      <div>
                        <strong style={{fontSize: "15px", color: "white"}}>{c.name}</strong>
                        <small style={{display: "block", color: "#8e87a2", fontSize: "12px"}}>{c.email}</small>
                        {hasException && (
                          <span style={{
                            display: "inline-block",
                            marginTop: "4px",
                            background: "rgba(245, 158, 11, 0.15)",
                            color: "#f59e0b",
                            padding: "2px 8px",
                            borderRadius: "6px",
                            fontSize: "11px",
                            fontWeight: 700
                          }}>
                            ⚠️ Exceção Contratual: {c.plan.customQuotaOverride} msgs ({c.plan.exceptionReason || "Personalizado"})
                          </span>
                        )}
                        {Boolean(c.plan.contractedPlan) && (
                          <span style={{
                            display: "inline-block",
                            marginTop: "4px",
                            marginLeft: hasException ? "6px" : "0",
                            background: "rgba(59, 130, 246, 0.15)",
                            color: "#60a5fa",
                            border: "1px solid rgba(59, 130, 246, 0.3)",
                            padding: "2px 8px",
                            borderRadius: "6px",
                            fontSize: "11px",
                            fontWeight: 700
                          }}>
                            🔒 Contrato Congelado (v{c.plan.contractedPlan?.version}: {c.plan.contractedPlan?.quotaLimit} msgs)
                          </span>
                        )}
                        {Boolean(c.plan.pendingPlanUpdate) && (
                          <span style={{
                            display: "inline-block",
                            marginTop: "4px",
                            marginLeft: "6px",
                            background: "rgba(168, 85, 247, 0.15)",
                            color: "#c084fc",
                            border: "1px solid rgba(168, 85, 247, 0.3)",
                            padding: "2px 8px",
                            borderRadius: "6px",
                            fontSize: "11px",
                            fontWeight: 700
                          }}>
                            ⏳ Transição Agendada: {c.plan.pendingPlanUpdate?.quotaLimit} msgs em {c.plan.pendingPlanUpdate?.effectiveAt}
                          </span>
                        )}
                      </div>

                      <div style={{display: "flex", alignItems: "center", gap: "14px"}}>
                        <span style={{
                          background: "rgba(236, 72, 153, 0.15)",
                          color: "#ec4899",
                          padding: "4px 12px",
                          borderRadius: "8px",
                          fontSize: "13px",
                          fontWeight: 700
                        }}>
                          {c.plan.name} (R$ {c.plan.price})
                        </span>

                        <button
                          type="button"
                          className="op-primary"
                          style={{padding: "8px 14px", fontSize: "12px", borderRadius: "8px"}}
                          onClick={() => handleOpenAssignModal(c)}
                        >
                          Alterar Plano
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* ===================== VIEW: CENTRAL DE LOGINS & CLIENTES ===================== */}
        {currentNav === "users" && (
          <section>
            {/* CARDS DE RESUMO DE USUÁRIOS */}
            <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginBottom: "24px"}}>
              <div className="op-card" style={{padding: "18px"}}>
                <span style={{fontSize: "12px", color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px"}}>Total de Logins</span>
                <strong style={{display: "block", fontSize: "28px", color: "white", marginTop: "4px"}}>{users.length}</strong>
                <small style={{color: "#a855f7", fontSize: "12px"}}>Clientes cadastrados no sistema</small>
              </div>

              <div className="op-card" style={{padding: "18px"}}>
                <span style={{fontSize: "12px", color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px"}}>Aguardando Loja</span>
                <strong style={{display: "block", fontSize: "28px", color: "#fbbf24", marginTop: "4px"}}>
                  {users.filter(u => u.status === "waiting_store").length}
                </strong>
                <small style={{color: "#fbbf24", fontSize: "12px"}}>Login criado sem empresa</small>
              </div>

              <div className="op-card" style={{padding: "18px"}}>
                <span style={{fontSize: "12px", color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px"}}>Lojas Vinculadas</span>
                <strong style={{display: "block", fontSize: "28px", color: "#00db8c", marginTop: "4px"}}>
                  {users.filter(u => u.status === "linked").length}
                </strong>
                <small style={{color: "#00db8c", fontSize: "12px"}}>Operando empresas ativas</small>
              </div>

              <div className="op-card" style={{padding: "18px"}}>
                <span style={{fontSize: "12px", color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px"}}>Acessos Bloqueados</span>
                <strong style={{display: "block", fontSize: "28px", color: "#f43f5e", marginTop: "4px"}}>
                  {users.filter(u => u.status === "blocked").length}
                </strong>
                <small style={{color: "#f43f5e", fontSize: "12px"}}>Acesso suspenso pelo Master</small>
              </div>
            </div>

            {/* FORMULÁRIO DE CRIAR LOGIN DO CLIENTE (ETAPA 1) */}
            {userFormOpen && (
              <div className="op-card" style={{padding: "26px", marginBottom: "26px", border: "1px solid #a855f7", boxShadow: "0 8px 30px rgba(168,85,247,0.15)"}}>
                <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px"}}>
                  <div style={{display: "flex", alignItems: "center", gap: "10px"}}>
                    <UserPlus size={22} color="#a855f7"/>
                    <h3 style={{margin: 0, fontSize: "20px", fontWeight: 800}}>Criar Login de Cliente</h3>
                  </div>
                  <button type="button" className="op-refresh" onClick={() => setUserFormOpen(false)} style={{padding: "4px 12px", fontSize: "12px"}}>
                    Cancelar
                  </button>
                </div>

                <p style={{fontSize: "13px", color: "#aba8bf", margin: "0 0 18px", lineHeight: "1.5"}}>
                  Cadastre o usuário responsável e crie suas credenciais. O cliente poderá existir antes da loja; o acesso ao painel só é liberado após vincular uma empresa.
                </p>

                <form onSubmit={handleCreateUser} style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "18px"}}>
                  <div>
                    <label style={{fontSize: "13px", color: "var(--muted)", display: "block", marginBottom: "4px"}}>Nome Completo do Responsável *</label>
                    <input
                      type="text"
                      placeholder="Ex: Carlos Eduardo Silva"
                      value={userFullName}
                      onChange={e => setUserFullName(e.target.value)}
                      required
                      style={{width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white"}}
                    />
                  </div>

                  <div>
                    <label style={{fontSize: "13px", color: "var(--muted)", display: "block", marginBottom: "4px"}}>E-mail de Acesso do Cliente *</label>
                    <input
                      type="email"
                      placeholder="carlos@empresa.com.br"
                      value={userEmail}
                      onChange={e => setUserEmail(e.target.value)}
                      required
                      style={{width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white"}}
                    />
                  </div>

                  <div>
                    <label style={{fontSize: "13px", color: "var(--muted)", display: "block", marginBottom: "4px"}}>WhatsApp de Contato & Recuperação (com DDD) *</label>
                    <input
                      type="tel"
                      placeholder="Ex: 51981964238"
                      value={userWhatsapp}
                      onChange={e => setUserWhatsapp(e.target.value)}
                      required
                      style={{width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white"}}
                    />
                    <small style={{color: "#8e87a2", fontSize: "11px"}}>Usado para envio de códigos de recuperação e avisos de acesso.</small>
                  </div>

                  <div>
                    <label style={{fontSize: "13px", color: "var(--muted)", display: "block", marginBottom: "4px"}}>Situação Inicial do Acesso</label>
                    <select
                      value={userStatus}
                      onChange={e => setUserStatus(e.target.value as "active" | "blocked")}
                      style={{width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white"}}
                    >
                      <option value="active">Ativo (Aguardando vinculação da loja)</option>
                      <option value="blocked">Bloqueado (Acesso suspenso administrativamente)</option>
                    </select>
                  </div>

                  <div style={{gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "18px", background: "rgba(168,85,247,0.06)", padding: "16px", borderRadius: "10px", border: "1px dashed rgba(168,85,247,0.3)"}}>
                    <div>
                      <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px"}}>
                        <label style={{fontSize: "13px", color: "var(--muted)"}}>Senha Inicial *</label>
                        <button
                          type="button"
                          onClick={handleGenerateStrongPassword}
                          style={{background: "none", border: "none", color: "#a855f7", fontSize: "12px", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "4px"}}
                        >
                          <Sparkles size={13}/> 🎲 Gerar Senha Forte
                        </button>
                      </div>
                      <div style={{position: "relative"}}>
                        <input
                          type={showUserPassword ? "text" : "password"}
                          placeholder="Mínimo 6 dígitos"
                          value={userInitialPassword}
                          onChange={e => setUserInitialPassword(e.target.value)}
                          required
                          minLength={6}
                          style={{width: "100%", padding: "12px 40px 12px 12px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white"}}
                        />
                        <button
                          type="button"
                          onClick={() => setShowUserPassword(!showUserPassword)}
                          style={{position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#8e87a2", cursor: "pointer"}}
                        >
                          {showUserPassword ? <EyeOff size={16}/> : <Eye size={16}/>}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label style={{fontSize: "13px", color: "var(--muted)", display: "block", marginBottom: "4px"}}>Confirmar Senha *</label>
                      <input
                        type={showUserPassword ? "text" : "password"}
                        placeholder="Repita a senha inicial"
                        value={userConfirmPassword}
                        onChange={e => setUserConfirmPassword(e.target.value)}
                        required
                        minLength={6}
                        style={{width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white"}}
                      />
                    </div>
                  </div>

                  <div style={{gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "6px"}}>
                    <button type="submit" className="op-primary" disabled={creatingUser} style={{padding: "14px 28px", fontWeight: 700, borderRadius: "10px", background: "linear-gradient(135deg, #a855f7, #7c3aed)"}}>
                      {creatingUser ? "Cadastrando Login..." : "Finalizar Cadastro do Cliente"}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* BARRA DE FILTROS & BUSCA DE USUÁRIOS */}
            <div style={{display: "flex", gap: "14px", marginBottom: "20px", flexWrap: "wrap", alignItems: "center"}}>
              <div style={{position: "relative", flex: 1, minWidth: "260px"}}>
                <Search size={18} color="#8e87a2" style={{position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)"}}/>
                <input
                  type="text"
                  placeholder="Pesquisar por nome, e-mail ou WhatsApp..."
                  value={userSearchTerm}
                  onChange={e => setUserSearchTerm(e.target.value)}
                  style={{width: "100%", padding: "12px 14px 12px 42px", borderRadius: "10px", border: "1px solid #332b49", background: "#151222", color: "white", fontSize: "14px"}}
                />
              </div>

              <div style={{display: "flex", gap: "8px", flexWrap: "wrap"}}>
                <button
                  type="button"
                  className={`op-filter-chip ${userFilterStatus === "all" ? "active" : ""}`}
                  onClick={() => setUserFilterStatus("all")}
                >
                  Todos ({users.length})
                </button>
                <button
                  type="button"
                  className={`op-filter-chip ${userFilterStatus === "waiting_store" ? "active" : ""}`}
                  onClick={() => setUserFilterStatus("waiting_store")}
                  style={{borderColor: userFilterStatus === "waiting_store" ? "#fbbf24" : undefined}}
                >
                  Aguardando Loja ({users.filter(u => u.status === "waiting_store").length})
                </button>
                <button
                  type="button"
                  className={`op-filter-chip ${userFilterStatus === "linked" ? "active" : ""}`}
                  onClick={() => setUserFilterStatus("linked")}
                  style={{borderColor: userFilterStatus === "linked" ? "#00db8c" : undefined}}
                >
                  Vinculados ({users.filter(u => u.status === "linked").length})
                </button>
                <button
                  type="button"
                  className={`op-filter-chip ${userFilterStatus === "blocked" ? "active" : ""}`}
                  onClick={() => setUserFilterStatus("blocked")}
                  style={{borderColor: userFilterStatus === "blocked" ? "#f43f5e" : undefined}}
                >
                  Bloqueados ({users.filter(u => u.status === "blocked").length})
                </button>
              </div>
            </div>

            {/* LISTA DE USUÁRIOS */}
            <div style={{display: "flex", flexDirection: "column", gap: "14px"}}>
              {filteredUsers.length === 0 ? (
                <div className="op-card" style={{padding: "40px", textAlign: "center", color: "#8e87a2"}}>
                  <Users size={36} style={{margin: "0 auto 12px", opacity: 0.5}}/>
                  <p style={{margin: 0, fontSize: "15px"}}>Nenhum cliente/usuário encontrado com os filtros selecionados.</p>
                </div>
              ) : (
                filteredUsers.map(user => {
                  const isBlocked = user.isBlocked || user.status === "blocked";
                  const isWaitingStore = user.status === "waiting_store";

                  return (
                    <div
                      key={user.id}
                      className="op-card"
                      style={{
                        padding: "20px 24px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: "18px",
                        borderLeft: isBlocked ? "4px solid #f43f5e" : isWaitingStore ? "4px solid #fbbf24" : "4px solid #00db8c"
                      }}
                    >
                      <div style={{display: "flex", alignItems: "center", gap: "16px", minWidth: "260px"}}>
                        <div style={{
                          width: "48px", height: "48px", borderRadius: "12px",
                          background: isBlocked ? "rgba(244,63,94,0.15)" : isWaitingStore ? "rgba(251,191,36,0.15)" : "rgba(0,219,140,0.15)",
                          display: "grid", placeItems: "center",
                          color: isBlocked ? "#f43f5e" : isWaitingStore ? "#fbbf24" : "#00db8c",
                          fontWeight: 800, fontSize: "18px"
                        }}>
                          {user.name.slice(0, 2).toUpperCase()}
                        </div>

                        <div>
                          <div style={{display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap"}}>
                            <strong style={{fontSize: "17px", color: "white"}}>{user.name}</strong>
                            <span style={{
                              background: isBlocked ? "rgba(244,63,94,0.2)" : isWaitingStore ? "rgba(251,191,36,0.2)" : "rgba(0,219,140,0.2)",
                              color: isBlocked ? "#f43f5e" : isWaitingStore ? "#fbbf24" : "#00db8c",
                              padding: "2px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: 700
                            }}>
                              {isBlocked ? "ACESSO BLOQUEADO" : isWaitingStore ? "AGUARDANDO VINCULAÇÃO" : "VINCULADO"}
                            </span>
                          </div>

                          <div style={{display: "flex", alignItems: "center", gap: "14px", marginTop: "4px", fontSize: "13px", color: "#c4bed6", flexWrap: "wrap"}}>
                            <span>E-mail: <strong style={{color: "#fff"}}>{user.email}</strong></span>
                            {user.whatsapp && (
                              <span>• WhatsApp: <strong style={{color: "#00db8c"}}>{user.whatsapp}</strong></span>
                            )}
                          </div>

                          {/* Lojas Vinculadas */}
                          <div style={{marginTop: "8px", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap"}}>
                            <span style={{fontSize: "12px", color: "#8e87a2"}}>Empresas:</span>
                            {user.linkedTenants.length === 0 ? (
                              <span style={{fontSize: "11.5px", color: "#fbbf24", background: "rgba(251,191,36,0.1)", padding: "2px 8px", borderRadius: "6px"}}>
                                Nenhuma loja vinculada até o momento
                              </span>
                            ) : (
                              user.linkedTenants.map(t => (
                                <span key={t.tenantId} style={{fontSize: "11.5px", color: "#a5b4fc", background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", padding: "2px 8px", borderRadius: "6px", display: "inline-flex", alignItems: "center", gap: "4px"}}>
                                  <Building2 size={11}/> {t.tenantName} ({t.planName})
                                </span>
                              ))
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Ações do Usuário */}
                      <div style={{display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap"}}>
                        {isWaitingStore && (
                          <button
                            type="button"
                            className="op-primary"
                            onClick={() => handleStartStoreForUser(user)}
                            style={{padding: "8px 14px", borderRadius: "8px", fontSize: "12px", fontWeight: 700, display: "flex", alignItems: "center", gap: "6px"}}
                          >
                            <Building2 size={14}/> Criar Loja para este Cliente
                          </button>
                        )}

                        <button
                          type="button"
                          className="op-refresh"
                          title="Enviar Mensagem de Acesso via WhatsApp"
                          onClick={() => {
                            setWhatsappModalData({
                              clientName: user.name,
                              storeName: user.linkedTenants[0]?.tenantName || "Sua Loja",
                              email: user.email,
                              phone: user.whatsapp
                            });
                          }}
                          style={{color: "#22c55e", borderColor: "rgba(34,197,94,0.4)", background: "rgba(34,197,94,0.1)", display: "flex", alignItems: "center", gap: "6px", padding: "8px 12px", borderRadius: "8px", fontSize: "12px"}}
                        >
                          <Smartphone size={14}/> Enviar Acesso
                        </button>

                        <button
                          type="button"
                          className="op-refresh"
                          onClick={() => handleToggleBlockUser(user)}
                          style={{color: isBlocked ? "#00db8c" : "#f43f5e", borderColor: isBlocked ? "rgba(0,219,140,0.4)" : "rgba(244,63,94,0.4)", padding: "8px 12px", borderRadius: "8px", fontSize: "12px"}}
                        >
                          {isBlocked ? "Reativar" : "Bloquear"}
                        </button>

                        <button
                          type="button"
                          className="op-refresh"
                          title="Apagar cliente permanentemente"
                          onClick={() => handleDeleteUser(user)}
                          style={{color: "#f43f5e", borderColor: "rgba(244,63,94,0.4)", padding: "8px 12px", borderRadius: "8px", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px"}}
                        >
                          <Trash2 size={14}/> Apagar
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        )}

        {/* ===================== VIEW: EMPRESAS & LOJAS ===================== */}
        {currentNav === "clients" && (
          <section>
            {/* FORMULÁRIO DE CADASTRO DE LOJA (ETAPA 2) */}
            {formOpen && (
              <div className="op-card" style={{padding: "26px", marginBottom: "26px", border: "1px solid #ec4899", boxShadow: "0 8px 30px rgba(236,72,153,0.15)"}}>
                <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px"}}>
                  <div style={{display: "flex", alignItems: "center", gap: "10px"}}>
                    <PlusCircle size={22} color="#ec4899"/>
                    <h3 style={{margin: 0, fontSize: "20px", fontWeight: 800}}>Cadastrar Nova Empresa / Loja</h3>
                  </div>
                  <button type="button" className="op-refresh" onClick={() => setFormOpen(false)} style={{padding: "4px 12px", fontSize: "12px"}}>
                    Cancelar
                  </button>
                </div>

                <form onSubmit={handleCreateClient} style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "18px"}}>
                  {/* SELETOR DE CLIENTE RESPONSÁVEL */}
                  <div style={{gridColumn: "1 / -1", background: "rgba(236,72,153,0.06)", border: "1px solid rgba(236,72,153,0.25)", borderRadius: "10px", padding: "16px"}}>
                    <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", flexWrap: "wrap", gap: "6px"}}>
                      <label style={{fontSize: "13px", fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: "6px"}}>
                        <UserCheck size={16} color="#ec4899"/> Selecionar Cliente Responsável (Login Cadastrado)
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setCurrentNav("users");
                          setUserFormOpen(true);
                        }}
                        style={{background: "none", border: "none", color: "#ec4899", fontSize: "12px", fontWeight: 700, cursor: "pointer", textDecoration: "underline"}}
                      >
                        + Criar Novo Login Primeiro
                      </button>
                    </div>

                    <select
                      value={selectedUserId}
                      onChange={e => {
                        const uid = e.target.value;
                        setSelectedUserId(uid);
                        const found = users.find(u => u.id === uid);
                        if (found) {
                          if (!storeName) setStoreName(`Loja ${found.name.split(" ")[0]}`);
                        }
                      }}
                      style={{width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white", fontSize: "14px"}}
                    >
                      <option value="">-- Selecione o Cliente na Lista (ou cadastre novo login) --</option>
                      {users.map(u => (
                        <option key={u.id} value={u.id}>
                          {u.name} — {u.email} {u.whatsapp ? `(WhatsApp: ${u.whatsapp})` : ""} {u.linkedTenants.length > 0 ? `• [${u.linkedTenants.length} loja(s)]` : "• [Aguardando Loja ⭐]"}
                        </option>
                      ))}
                    </select>

                    {selectedUserId && (
                      <div style={{marginTop: "10px", padding: "10px 14px", borderRadius: "8px", background: "rgba(0,219,140,0.1)", border: "1px solid rgba(0,219,140,0.3)", display: "flex", alignItems: "center", gap: "10px", fontSize: "13px", color: "#b9f5dc"}}>
                        <CheckCircle2 size={16} color="#00db8c"/>
                        <span>
                          Responsável Vinculado: <strong>{users.find(u => u.id === selectedUserId)?.name}</strong> ({users.find(u => u.id === selectedUserId)?.email}). O acesso já está registrado no sistema!
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Nome da Loja */}
                  <div>
                    <label style={{fontSize: "13px", color: "var(--muted)", display: "block", marginBottom: "4px"}}>Nome da Loja / Empresa *</label>
                    <input
                      type="text"
                      placeholder="Ex: Pizzaria Forno Nobre"
                      value={storeName}
                      onChange={e => setStoreName(e.target.value)}
                      required
                      style={{width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white"}}
                    />
                  </div>

                  {/* WhatsApp Comercial */}
                  <div>
                    <label style={{fontSize: "13px", color: "var(--muted)", display: "block", marginBottom: "4px"}}>WhatsApp Comercial da Loja</label>
                    <input
                      type="tel"
                      placeholder="Ex: 51999998888"
                      value={businessWhatsapp}
                      onChange={e => setBusinessWhatsapp(e.target.value)}
                      style={{width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white"}}
                    />
                  </div>

                  {/* Nicho / Segmento */}
                  <div>
                    <label style={{fontSize: "13px", color: "var(--muted)", display: "block", marginBottom: "4px"}}>Nicho / Segmento do Negócio</label>
                    <input
                      type="text"
                      placeholder="Ex: Pizzaria / Delivery, Clínica, Loja de Roupas"
                      value={niche}
                      onChange={e => setNiche(e.target.value)}
                      style={{width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white"}}
                    />
                  </div>

                  {/* CPF / CNPJ */}
                  <div>
                    <label style={{fontSize: "13px", color: "var(--muted)", display: "block", marginBottom: "4px"}}>CPF ou CNPJ</label>
                    <input
                      type="text"
                      placeholder="00.000.000/0000-00"
                      value={clientDocument}
                      onChange={e => setClientDocument(e.target.value)}
                      style={{width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white"}}
                    />
                  </div>

                  {/* Nome da Assistente IA */}
                  <div>
                    <label style={{fontSize: "13px", color: "var(--muted)", display: "block", marginBottom: "4px"}}>Nome da Assistente IA (Opcional)</label>
                    <input
                      type="text"
                      placeholder="Ex: Sofia (padrão)"
                      value={agentName}
                      onChange={e => setAgentName(e.target.value)}
                      style={{width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white"}}
                    />
                  </div>

                  {/* Fallback de E-mail & Senha quando não seleciona cliente prévio */}
                  {!selectedUserId && (
                    <>
                      <div>
                        <label style={{fontSize: "13px", color: "var(--muted)", display: "block", marginBottom: "4px"}}>E-mail de Login *</label>
                        <input
                          type="email"
                          placeholder="contato@empresa.com.br"
                          value={email}
                          onChange={e => setEmail(e.target.value)}
                          required={!selectedUserId}
                          style={{width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white"}}
                        />
                      </div>

                      <div>
                        <label style={{fontSize: "13px", color: "var(--muted)", display: "block", marginBottom: "4px"}}>Senha Inicial *</label>
                        <input
                          type="password"
                          placeholder="Mínimo 6 dígitos"
                          value={password}
                          onChange={e => setPassword(e.target.value)}
                          required={!selectedUserId}
                          minLength={6}
                          style={{width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white"}}
                        />
                      </div>
                    </>
                  )}

                  {/* Plano Comercial */}
                  <div>
                    <label style={{fontSize: "13px", color: "var(--muted)", display: "block", marginBottom: "4px"}}>Plano Comercial</label>
                    <select
                      value={planName}
                      onChange={e => {
                        if (e.target.value === "crm-trial" || e.target.value === "Teste Grátis (7 Dias)") {
                          setPlanName("Teste Grátis (7 Dias)");
                          setPlanPrice("0,00");
                          setQuotaLimit(100);
                          const trialExp = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
                          setDueDate(trialExp);
                          setPaymentStatus("paid");
                          return;
                        }
                        const sel = plans.find(p => p.name === e.target.value);
                        if (sel) {
                          setPlanName(sel.name);
                          setPlanPrice(sel.price);
                          setQuotaLimit(sel.quotaLimit);
                        }
                      }}
                      style={{width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white"}}
                    >
                      <option value="Teste Grátis (7 Dias)">🎁 Teste Grátis (7 Dias — 100 mensagens IA)</option>
                      {plans.filter(p => p.id !== "crm-trial" && p.isActive !== false).map(p => (
                        <option key={p.id} value={p.name}>
                          {p.name} — R$ {p.price}/mês ({p.quotaLimit.toLocaleString("pt-BR")} msgs)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{fontSize: "13px", color: "var(--muted)", display: "block", marginBottom: "4px"}}>Primeiro Vencimento</label>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={e => setDueDate(e.target.value)}
                      required
                      style={{width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white"}}
                    />
                  </div>

                  <div>
                    <label style={{fontSize: "13px", color: "var(--muted)", display: "block", marginBottom: "4px"}}>Status do Pagamento</label>
                    <select
                      value={paymentStatus}
                      onChange={e => setPaymentStatus(e.target.value as "paid" | "pending")}
                      style={{width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white"}}
                    >
                      <option value="paid">PAGO (Acesso Liberado)</option>
                      <option value="pending">PENDENTE (Aguardando)</option>
                    </select>
                  </div>

                  <div style={{gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: "10px", padding: "10px 0"}}>
                    <input
                      type="checkbox"
                      id="autoBlock"
                      checked={autoBlock}
                      onChange={e => setAutoBlock(e.target.checked)}
                      style={{width: "18px", height: "18px", accentColor: "#ec4899"}}
                    />
                    <label htmlFor="autoBlock" style={{fontSize: "14px", color: "#e2e8f0", cursor: "pointer"}}>
                      <strong>Bloqueio Automático por Inadimplência:</strong> Suspender automaticamente as respostas da IA caso a mensalidade vença sem confirmação de pagamento.
                    </label>
                  </div>

                  <div style={{gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", gap: "12px"}}>
                    <button type="submit" className="op-primary" disabled={creating} style={{padding: "14px 28px", fontWeight: 700, borderRadius: "10px"}}>
                      {creating ? "Criando e Vinculando..." : "Confirmar Criação da Loja"}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* BARRA DE FILTROS & BUSCA */}
            <div style={{display: "flex", gap: "14px", marginBottom: "20px", flexWrap: "wrap", alignItems: "center"}}>
              <div style={{position: "relative", flex: 1, minWidth: "260px"}}>
                <Search size={18} color="#8e87a2" style={{position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)"}}/>
                <input
                  type="text"
                  placeholder="Pesquisar loja por nome ou e-mail..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  style={{width: "100%", padding: "12px 14px 12px 42px", borderRadius: "10px", border: "1px solid #332b49", background: "#151222", color: "white", fontSize: "14px"}}
                />
              </div>

              <div style={{display: "flex", gap: "8px", flexWrap: "wrap"}}>
                <button
                  type="button"
                  className={`op-filter-chip ${filterStatus === "all" ? "active" : ""}`}
                  onClick={() => setFilterStatus("all")}
                >
                  Todos ({clients.length})
                </button>
                <button
                  type="button"
                  className={`op-filter-chip ${filterStatus === "active" ? "active" : ""}`}
                  onClick={() => setFilterStatus("active")}
                >
                  Em Dia ({clients.filter(c => c.status === "active" && !c.plan.isOverdue).length})
                </button>
                <button
                  type="button"
                  className={`op-filter-chip ${filterStatus === "overdue" ? "active" : ""}`}
                  onClick={() => setFilterStatus("overdue")}
                  style={{borderColor: filterStatus === "overdue" ? "#f59e0b" : undefined}}
                >
                  Atrasados ({clients.filter(c => c.plan.isOverdue).length})
                </button>
                <button
                  type="button"
                  className={`op-filter-chip ${filterStatus === "suspended" ? "active" : ""}`}
                  onClick={() => setFilterStatus("suspended")}
                  style={{borderColor: filterStatus === "suspended" ? "#f43f5e" : undefined}}
                >
                  Bloqueados ({clients.filter(c => c.status === "suspended").length})
                </button>
              </div>
            </div>

            {/* LISTA DE LOJAS CADASTRADAS */}
            <div style={{display: "flex", flexDirection: "column", gap: "14px"}}>
              {filteredClients.length === 0 ? (
                <div className="op-card" style={{padding: "40px", textAlign: "center", color: "#8e87a2"}}>
                  <Users size={36} style={{margin: "0 auto 12px", opacity: 0.5}}/>
                  <p style={{margin: 0, fontSize: "15px"}}>Nenhuma loja encontrada com os filtros selecionados.</p>
                </div>
              ) : (
                filteredClients.map(client => {
                  const isBlocked = client.status === "suspended";
                  const isOverdue = client.plan.isOverdue;
                  const hasException = Boolean(client.plan.customQuotaOverride);

                  return (
                    <div
                      key={client.id}
                      className="op-card"
                      style={{
                        padding: "20px 24px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: "18px",
                        borderLeft: isBlocked ? "4px solid #f43f5e" : isOverdue ? "4px solid #f59e0b" : "4px solid #00db8c"
                      }}
                    >
                      <div style={{display: "flex", alignItems: "center", gap: "16px", minWidth: "260px"}}>
                        <div style={{
                          width: "48px", height: "48px", borderRadius: "12px",
                          background: isBlocked ? "rgba(244,63,94,0.15)" : "rgba(236,72,153,0.15)",
                          display: "grid", placeItems: "center",
                          color: isBlocked ? "#f43f5e" : "#ec4899",
                          fontWeight: 800, fontSize: "18px"
                        }}>
                          {client.name.slice(0, 2).toUpperCase()}
                        </div>

                        <div>
                          <div style={{display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap"}}>
                            <strong style={{fontSize: "17px", color: "white"}}>{client.name}</strong>
                            {client.isMasterOwnTenant && (
                              <span style={{
                                background: "rgba(251, 191, 36, 0.2)",
                                color: "#fbbf24",
                                border: "1px solid rgba(251, 191, 36, 0.4)",
                                padding: "2px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: 800
                              }}>
                                👑 OPERAÇÃO PRÓPRIA MASTER
                              </span>
                            )}
                            <span style={{
                              background: isBlocked ? "rgba(244,63,94,0.2)" : isOverdue ? "rgba(245,158,11,0.2)" : "rgba(0,219,140,0.2)",
                              color: isBlocked ? "#f43f5e" : isOverdue ? "#f59e0b" : "#00db8c",
                              padding: "2px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: 700
                            }}>
                              {isBlocked ? "SUSPENSO / BLOQUEADO" : isOverdue ? "PAGAMENTO PENDENTE" : "ATIVO"}
                            </span>
                          </div>

                          <span style={{fontSize: "13px", color: "#8e87a2", display: "block", marginTop: "2px"}}>
                            Login: <strong>{client.email}</strong>
                          </span>

                          <div style={{display: "flex", alignItems: "center", gap: "12px", marginTop: "6px", fontSize: "12px", color: "#b3a9c7", flexWrap: "wrap"}}>
                            <span style={{display: "flex", alignItems: "center", gap: "4px"}}>
                              <Smartphone size={13} color={client.whatsappStatus === "connected" ? "#00db8c" : "#8e87a2"}/>
                              WhatsApp: <strong>{client.connectedWhatsappCount ?? (client.whatsappStatus === "connected" ? 1 : 0)}/{client.maxWhatsappConnections ?? client.plan.maxWhatsappConnections ?? 1}</strong> (de 5 espaços)
                            </span>
                            <span>•</span>
                            <span style={{display: "flex", alignItems: "center", gap: "4px"}}>
                              <Users size={13} color="#a855f7"/>
                              Operadores: <strong>{client.operatorsCount ?? 1}/{client.maxOperators ?? client.plan.maxOperators ?? 1}</strong>
                            </span>
                            <span>•</span>
                            <span style={{display: "flex", alignItems: "center", gap: "4px"}}>
                              <Bot size={13} color="#ec4899"/>
                              Consumo IA: <strong>{client.plan.quotaUsed ?? 0}/{client.plan.customQuotaOverride || client.plan.quotaLimit || 200}</strong>
                            </span>
                            <span>•</span>
                            <span style={{display: "flex", alignItems: "center", gap: "4px"}}>
                              <Calendar size={13}/> Vence em: {client.plan.dueDate}
                            </span>
                          </div>

                          {isBlocked && (client.plan.adminSuspensionReason || client.plan.adminInternalNote) && (
                            <div style={{marginTop: "6px", display: "flex", flexDirection: "column", gap: "2px"}}>
                              {client.plan.adminSuspensionReason && (
                                <span style={{fontSize: "11.5px", color: "#fda4af"}}>
                                  🚫 <strong>Motivo público (exibido ao cliente):</strong> {client.plan.adminSuspensionReason}
                                </span>
                              )}
                              {client.plan.adminInternalNote && (
                                <span style={{fontSize: "11.5px", color: "#fbbf24"}}>
                                  🔒 <strong>Nota interna Master:</strong> {client.plan.adminInternalNote}
                                </span>
                              )}
                            </div>
                          )}

                          {hasException && (
                            <div style={{marginTop: "6px"}}>
                              <span style={{
                                background: "rgba(245, 158, 11, 0.15)",
                                color: "#f59e0b",
                                padding: "2px 8px",
                                borderRadius: "6px",
                                fontSize: "11px",
                                fontWeight: 700
                              }}>
                                ⚠️ Exceção Contratual: {client.plan.customQuotaOverride} msgs ({client.plan.exceptionReason || "Personalizado"})
                              </span>
                            </div>
                          )}
                          {Boolean(client.plan.contractedPlan) && (
                            <div style={{marginTop: "6px"}}>
                              <span style={{
                                background: "rgba(59, 130, 246, 0.15)",
                                color: "#60a5fa",
                                border: "1px solid rgba(59, 130, 246, 0.3)",
                                padding: "2px 8px",
                                borderRadius: "6px",
                                fontSize: "11px",
                                fontWeight: 700
                              }}>
                                🔒 Contrato Congelado (v{client.plan.contractedPlan?.version}: {client.plan.contractedPlan?.quotaLimit} msgs)
                              </span>
                            </div>
                          )}
                          {Boolean(client.plan.pendingPlanUpdate) && (
                            <div style={{marginTop: "6px"}}>
                              <span style={{
                                background: "rgba(168, 85, 247, 0.15)",
                                color: "#c084fc",
                                border: "1px solid rgba(168, 85, 247, 0.3)",
                                padding: "2px 8px",
                                borderRadius: "6px",
                                fontSize: "11px",
                                fontWeight: 700
                              }}>
                                ⏳ Transição Agendada: {client.plan.pendingPlanUpdate?.quotaLimit} msgs em {client.plan.pendingPlanUpdate?.effectiveAt}
                              </span>
                            </div>
                          )}
                          {Boolean(client.plan.isTrial) && (
                            <div style={{marginTop: "6px"}}>
                              {client.plan.trialStatus === "expired" ? (
                                <span style={{
                                  background: "rgba(239, 68, 68, 0.2)",
                                  color: "#f87171",
                                  border: "1px solid rgba(239, 68, 68, 0.4)",
                                  padding: "3px 9px",
                                  borderRadius: "6px",
                                  fontSize: "11px",
                                  fontWeight: 800
                                }}>
                                  ⚠️ Teste Expirado (7 dias esgotados)
                                </span>
                              ) : client.plan.trialStatus === "quota_exhausted" ? (
                                <span style={{
                                  background: "rgba(245, 158, 11, 0.2)",
                                  color: "#fbbf24",
                                  border: "1px solid rgba(245, 158, 11, 0.4)",
                                  padding: "3px 9px",
                                  borderRadius: "6px",
                                  fontSize: "11px",
                                  fontWeight: 800
                                }}>
                                  🚫 Limite do Teste Atingido (100/100)
                                </span>
                              ) : (
                                <span style={{
                                  background: "rgba(168, 85, 247, 0.2)",
                                  color: "#c084fc",
                                  border: "1px solid rgba(168, 85, 247, 0.4)",
                                  padding: "3px 9px",
                                  borderRadius: "6px",
                                  fontSize: "11px",
                                  fontWeight: 800
                                }}>
                                  🎁 Teste Grátis — {client.plan.trialDaysLeft ?? 7}d restantes
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Informações do Plano & Ações Rápidas */}
                      <div style={{display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap"}}>
                        <div style={{textAlign: "right", marginRight: "6px"}}>
                          <span style={{
                            display: "inline-block",
                            background: client.plan.isTrial ? "rgba(168, 85, 247, 0.15)" : "rgba(236, 72, 153, 0.15)",
                            color: client.plan.isTrial ? "#c084fc" : "#ec4899",
                            padding: "4px 10px",
                            borderRadius: "8px",
                            fontSize: "13px",
                            fontWeight: 700
                          }}>
                            {client.plan.name}
                          </span>
                          <strong style={{display: "block", fontSize: "16px", color: "white", marginTop: "2px"}}>
                            {client.plan.isTrial ? "Gratuito (7 dias)" : `R$ ${client.plan.price}/mês`}
                          </strong>
                          <small style={{color: "#8e87a2", fontSize: "11px"}}>
                            {client.plan.isTrial ? "100 mensagens da IA de teste" : `${client.plan.customQuotaOverride || client.plan.quotaLimit || 200} mensagens IA`}
                          </small>
                        </div>

                        {/* Botões de Ação */}
                        <div style={{display: "flex", gap: "6px", flexWrap: "wrap"}}>
                          {client.plan.isTrial && (
                            <button
                              type="button"
                              className="op-primary"
                              title="Converter Teste em Plano Pago Definitivo"
                              style={{
                                padding: "8px 12px",
                                background: "var(--grad-primary)",
                                color: "white",
                                fontSize: "12px",
                                fontWeight: 800,
                                borderRadius: "8px",
                                boxShadow: "0 0 12px rgba(236, 72, 153, 0.35)"
                              }}
                              onClick={() => handleOpenAssignModal(client)}
                            >
                              ⭐ Converter p/ Pago
                            </button>
                          )}
                          {client.plan.status === "paid" ? (
                            <button
                              type="button"
                              className="op-refresh"
                              title="Marcar como Pagamento Pendente"
                              style={{padding: "8px 12px", color: "#f59e0b"}}
                              onClick={() => handleSetPaymentStatus(client, "pending")}
                            >
                              Pendente
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="op-primary"
                              title="Confirmar Pagamento Recebido"
                              style={{padding: "8px 12px", background: "#00db8c", color: "#000"}}
                              onClick={() => handleSetPaymentStatus(client, "paid")}
                            >
                              Marcar Pago
                            </button>
                          )}

                          <button
                            type="button"
                            className="op-refresh"
                            title="Ficha Financeira e Cobrança"
                            style={{padding: "8px 12px", color: "#ec4899", borderColor: "rgba(236,72,153,0.3)"}}
                            onClick={() => setFinanceModalClient(client)}
                          >
                            <DollarSign size={15}/>
                          </button>

                          <button
                            type="button"
                            className="op-refresh"
                            title="Alterar Plano da Loja"
                            style={{padding: "8px 12px"}}
                            onClick={() => handleOpenAssignModal(client)}
                          >
                            <CreditCard size={15}/>
                          </button>

                          <button
                            type="button"
                            className="op-refresh"
                            title="Redefinir Senha do Cliente"
                            style={{padding: "8px 12px"}}
                            onClick={() => {
                              setResetUserId(client.userId || client.id);
                              setResetStoreName(client.name);
                              setNewPassword("");
                              setResetModalOpen(true);
                            }}
                          >
                            <KeyRound size={15}/>
                          </button>

                          <button
                            type="button"
                            className="op-refresh"
                            title={isBlocked ? "Desbloquear Loja" : "Bloquear Loja"}
                            style={{padding: "8px 12px", color: isBlocked ? "#00db8c" : "#f43f5e"}}
                            onClick={() => handleToggleBlock(client)}
                          >
                            {isBlocked ? <RotateCcw size={15}/> : <Ban size={15}/>}
                          </button>

                          <button
                            type="button"
                            className="op-refresh"
                            title="Apagar Loja"
                            style={{padding: "8px 12px", color: "#f43f5e"}}
                            onClick={() => handleDeleteClient(client)}
                          >
                            <Trash2 size={15}/>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        )}

        {/* ===================== VIEW: FATURAMENTO & KPIS ===================== */}
        {currentNav === "kpis" && (
          <section style={{display: "flex", flexDirection: "column", gap: "22px"}}>
            {/* Filtros */}
            <div className="op-card" style={{padding: "16px 18px", borderRadius: "14px", display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "flex-end"}}>
              {(() => {
                const sel: React.CSSProperties = {padding: "9px 10px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white", fontSize: "13px"};
                const lab: React.CSSProperties = {fontSize: "11px", color: "#9ca3af", display: "block", marginBottom: "4px", fontWeight: 700, textTransform: "uppercase"};
                return (
                  <>
                    <div>
                      <label style={lab}>Período</label>
                      <select value={finPeriod} onChange={e => setFinPeriod(e.target.value as PeriodPreset)} style={sel}>
                        <option value="today">Hoje</option>
                        <option value="7d">Últimos 7 dias</option>
                        <option value="month">Mês atual</option>
                        <option value="prev_month">Mês anterior</option>
                        <option value="3m">Últimos 3 meses</option>
                        <option value="6m">Últimos 6 meses</option>
                        <option value="12m">Últimos 12 meses</option>
                        <option value="custom">Período personalizado</option>
                      </select>
                    </div>
                    {finPeriod === "custom" && (
                      <>
                        <div><label style={lab}>De</label><input type="date" value={finFrom} onChange={e => setFinFrom(e.target.value)} style={sel} /></div>
                        <div><label style={lab}>Até</label><input type="date" value={finTo} onChange={e => setFinTo(e.target.value)} style={sel} /></div>
                      </>
                    )}
                    <div>
                      <label style={lab}>Plano</label>
                      <select value={finPlan} onChange={e => setFinPlan(e.target.value)} style={sel}>
                        <option value="">Todos</option>
                        <option value="crm-trial">Teste Grátis</option>
                        {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={lab}>Situação</label>
                      <select value={finStatus} onChange={e => setFinStatus(e.target.value as FinanceSubscriptionStatus)} style={sel}>
                        <option value="all">Todas</option>
                        <option value="active">Ativas</option>
                        <option value="paying">Pagantes</option>
                        <option value="trial">Teste grátis</option>
                        <option value="overdue">Inadimplentes</option>
                        <option value="suspended">Suspensas</option>
                        <option value="canceled">Canceladas</option>
                      </select>
                    </div>
                    <div>
                      <label style={lab}>Empresa</label>
                      <select value={finTenant} onChange={e => setFinTenant(e.target.value)} style={{...sel, maxWidth: "200px"}}>
                        <option value="">Todas</option>
                        {clients.filter(c => !c.isMasterOwnTenant).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                  </>
                );
              })()}
              <div style={{marginLeft: "auto", display: "flex", alignItems: "center", gap: "12px"}}>
                <small style={{color: "#9ca3af", fontSize: "11px"}}>
                  Atualizado: {(finRefreshedAt ?? new Date(finance.generatedAt)).toLocaleString("pt-BR")}
                </small>
                <button type="button" className="op-refresh" onClick={refreshFinance} disabled={finLoading}
                  style={{padding: "9px 14px", borderRadius: "8px", display: "flex", alignItems: "center", gap: "6px", fontSize: "13px"}}>
                  <RefreshCw size={14} className={finLoading ? "animate-spin" : undefined} /> Atualizar
                </button>
              </div>
            </div>

            {loading && clients.length === 0 ? (
              <div className="op-card" style={{padding: "28px", textAlign: "center", color: "#9ca3af"}}>Carregando indicadores financeiros...</div>
            ) : finance.totals.companies === 0 && clients.filter(c => !c.isMasterOwnTenant).length === 0 ? (
              <div className="op-card" style={{padding: "28px", textAlign: "center", color: "#9ca3af"}}>
                Nenhuma empresa cadastrada ainda. Os indicadores aparecem assim que houver clientes reais.
              </div>
            ) : (
              <>
                {/* Alertas */}
                {(finance.alerts.overdueClients.length > 0 || finance.alerts.pendingRecharges > 0 || finance.alerts.duplicatePayments > 0 || finance.alerts.dueSoon.length > 0) && (
                  <div className="op-card" style={{padding: "14px 18px", borderRadius: "14px", border: "1px solid rgba(245,158,11,0.4)", background: "rgba(245,158,11,0.06)", display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px", color: "#fcd34d"}}>
                    <strong style={{color: "#fff"}}>⚠️ Alertas financeiros</strong>
                    {finance.alerts.overdueClients.length > 0 && <span>🔴 {finance.alerts.overdueClients.length} empresa(s) em atraso ({brl(finance.money.overdueAmount)}). Mais antiga: {finance.alerts.overdueClients[0].name}, {finance.alerts.overdueClients[0].daysOverdue} dia(s).</span>}
                    {finance.alerts.dueSoon.length > 0 && <span>🟡 {finance.alerts.dueSoon.length} cobrança(s) vencendo em 7 dias ({brl(finance.money.dueNext7Days)}).</span>}
                    {finance.alerts.pendingRecharges > 0 && <span>⏳ {finance.alerts.pendingRecharges} recarga(s) aguardando sua conferência.</span>}
                    {finance.alerts.duplicatePayments > 0 && <span>🧾 {finance.alerts.duplicatePayments} possível(is) pagamento(s) duplicado(s) no mesmo ciclo — revise o histórico.</span>}
                  </div>
                )}

                {/* Clientes */}
                <div>
                  <h3 style={{fontSize: "14px", fontWeight: 800, margin: "0 0 10px", color: "#c4bed6", textTransform: "uppercase", letterSpacing: "0.6px"}}>Clientes</h3>
                  <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "14px"}}>
                    <FinCard label="Empresas cadastradas" value={finance.totals.companies} hint="Exclui a loja própria da NovaesWeb" />
                    <FinCard label="Clientes ativos" value={finance.totals.active} color="#00db8c" hint="Não suspensos nem cancelados (inclui testes)" />
                    <FinCard label="Clientes pagantes" value={finance.totals.paying} color="#00db8c" hint="Ativos em plano pago, fora do teste" />
                    <FinCard label="Em teste grátis" value={finance.totals.trial} color="#a855f7" hint="Não contam como pagantes" />
                    <FinCard label="Inadimplentes" value={finance.totals.overdue} color={finance.totals.overdue > 0 ? "#f43f5e" : "#fff"} hint="Cobrança vencida e não paga" />
                    <FinCard label="Suspensos" value={finance.totals.suspended} color={finance.totals.suspended > 0 ? "#f59e0b" : "#fff"} />
                    <FinCard label="Cancelados" value={finance.totals.canceled} />
                    <FinCard label="Novos no período" value={finance.totals.newInPeriod} />
                    <FinCard label="Renovaram no período" value={finance.totals.renewedInPeriod} hint="Pagamento confirmado após um anterior" />
                    <FinCard label="Pedidos de cancelamento" value="Indisponível" unavailable hint="Sistema ainda não registra esse pedido" />
                  </div>
                </div>

                {/* Financeiro */}
                <div>
                  <h3 style={{fontSize: "14px", fontWeight: 800, margin: "0 0 10px", color: "#c4bed6", textTransform: "uppercase", letterSpacing: "0.6px"}}>Financeiro</h3>
                  <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "14px"}}>
                    <FinCard label="Receita recebida (período)" value={brl(finance.money.receivedInPeriod)} color="#00db8c" hint="Somente pagamentos confirmados" />
                    <FinCard label="MRR contratado" value={brl(finance.money.mrr)} color="#ec4899" hint="Mensalidade contratada dos pagantes — não é caixa" />
                    <FinCard label="Contas a receber" value={brl(finance.money.receivable)} hint="Cobranças em aberto de planos pagos" />
                    <FinCard label="Total em atraso" value={brl(finance.money.overdueAmount)} color={finance.money.overdueAmount > 0 ? "#f43f5e" : "#fff"} />
                    <FinCard label="Vencem em 7 dias" value={brl(finance.money.dueNext7Days)} hint={`${finance.money.dueNext7DaysCount} cobrança(s)`} />
                    <FinCard label="Novas assinaturas (receita)" value={brl(finance.money.newSubscriptionRevenue)} hint="1º pagamento confirmado da empresa" />
                    <FinCard label="Renovações (receita)" value={brl(finance.money.recurringRevenue)} hint="Pagamentos seguintes ao primeiro" />
                    <FinCard label="Upgrades (receita)" value="Indisponível" unavailable hint="Pagamentos ainda não são classificados como upgrade" />
                    <FinCard label="Adicionais/serviços extras" value="Indisponível" unavailable hint="Sem registro de serviços extras" />
                    <FinCard label="Recargas de IA (receita)" value={brl(finance.money.rechargeRevenue)} color="#00db8c" hint="Recargas aprovadas no período" />
                    <FinCard label="Ticket médio contratado" value={brl(finance.money.averageTicket)} hint="MRR ÷ clientes pagantes" />
                    <FinCard label="Despesas (período)" value={brl(finance.money.expenses)} color="#f43f5e" hint="Despesas pagas registradas" />
                    <FinCard label="Lucro operacional estimado" value={brl(finance.money.operatingProfit)} color={finance.money.operatingProfit !== null && finance.money.operatingProfit >= 0 ? "#00db8c" : "#f43f5e"} hint="Receita realizada − despesas" />
                    <FinCard label="Margem operacional" value={finance.money.operatingMargin !== null ? `${finance.money.operatingMargin.toFixed(1)}%` : "—"} color="#a855f7" hint="Lucro ÷ receita realizada" />
                  </div>
                </div>

                {/* Previsão */}
                <div className="op-card" style={{padding: "20px", borderRadius: "14px"}}>
                  <h3 style={{fontSize: "16px", fontWeight: 800, margin: "0 0 4px", color: "white"}}>Previsão de cobranças</h3>
                  <small style={{color: "#9ca3af", fontSize: "12px"}}>Calculada pelos contratos e vencimentos reais. É uma previsão, não dinheiro garantido nem receita recebida.</small>
                  <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px", marginTop: "12px"}}>
                    {([["Próximos 30 dias", finance.forecast.d30], ["Próximos 60 dias", finance.forecast.d60], ["Próximos 90 dias", finance.forecast.d90]] as const).map(([l, v]) => (
                      <div key={l} style={{padding: "12px 14px", borderRadius: "10px", background: "rgba(255,255,255,0.03)", border: "1px solid #332b49"}}>
                        <span style={{fontSize: "12px", color: "#9ca3af"}}>{l}</span>
                        <strong style={{display: "block", fontSize: "20px", color: "#c4b5fd"}}>{brl(v)}</strong>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Distribuição por plano */}
                <div className="op-card" style={{padding: "24px"}}>
                  <h3 style={{fontSize: "18px", fontWeight: 800, margin: "0 0 4px", color: "white"}}>Distribuição de Clientes por Plano</h3>
                  <small style={{color: "#9ca3af", fontSize: "12px"}}>A receita de cada plano soma os contratos reais das empresas (inclusive valores negociados), não o preço de tabela × quantidade.</small>
                  <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "16px", marginTop: "14px"}}>
                    {finance.plans.map(p => (
                      <div key={p.planId} style={{padding: "16px", background: "rgba(255,255,255,0.03)", borderRadius: "12px", border: "1px solid #332b49"}}>
                        <strong style={{fontSize: "16px", color: "white", display: "block"}}>{p.name}</strong>
                        <span style={{fontSize: "13px", color: "#ec4899", fontWeight: 700}}>
                          {p.catalogPrice === null ? "Contrato individual" : `Tabela: R$ ${p.catalogPrice}/mês`}
                        </span>
                        <div style={{height: "6px", borderRadius: "4px", background: "#241e38", margin: "10px 0 8px", overflow: "hidden"}}>
                          <div style={{width: `${Math.min(100, p.percent)}%`, height: "100%", background: "linear-gradient(90deg, #a855f7, #ec4899, #f43f5e)"}} />
                        </div>
                        {([
                          ["Empresas", `${p.companies} (${p.percent.toFixed(0)}%)`],
                          ["Ativas", p.active],
                          ["Pagantes", p.paying],
                          ["Suspensas", p.suspended],
                          ["Canceladas", p.canceled],
                          ["Novas no período", p.newInPeriod]
                        ] as const).map(([l, v]) => (
                          <div key={l} style={{marginTop: "3px", display: "flex", justifyContent: "space-between", fontSize: "13px", color: "#9ca3af"}}>
                            <span>{l}:</span><strong style={{color: "white"}}>{v}</strong>
                          </div>
                        ))}
                        <div style={{marginTop: "6px", display: "flex", justifyContent: "space-between", fontSize: "13px", color: "#9ca3af"}}>
                          <span>Receita recorrente:</span><strong style={{color: "#00db8c"}}>{brl(p.mrr)}</strong>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Inadimplência e vencimentos */}
                {(finance.alerts.overdueClients.length > 0 || finance.alerts.dueSoon.length > 0) && (
                  <div className="op-card" style={{padding: "20px", borderRadius: "14px"}}>
                    <h3 style={{fontSize: "16px", fontWeight: 800, margin: "0 0 10px", color: "white"}}>Atrasos e próximos vencimentos</h3>
                    <div style={{display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px"}}>
                      {finance.alerts.overdueClients.map(o => {
                        const targetClient = clients.find(c => c.id === o.id);
                        return (
                          <div key={o.id} style={{display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: "8px", background: "rgba(244,63,94,0.08)", color: "#fca5a5", flexWrap: "wrap", gap: "8px"}}>
                            <div>
                              <span>🔴 <strong>{o.name}</strong> — {o.daysOverdue} dia(s) em atraso</span>
                              <span style={{marginLeft: "10px", color: "#f43f5e", fontWeight: 700}}>{brl(o.amount)}</span>
                            </div>
                            <div style={{display: "flex", gap: "6px"}}>
                              {targetClient && (
                                <button
                                  type="button"
                                  className="op-refresh"
                                  onClick={() => setFinanceModalClient(targetClient)}
                                  style={{padding: "4px 8px", fontSize: "11px", borderRadius: "6px"}}
                                >
                                  Ver Ficha
                                </button>
                              )}
                              <button
                                type="button"
                                className="op-primary"
                                onClick={() => {
                                  const name = targetClient?.businessDetails?.ownerName || o.name;
                                  const phone = (targetClient?.businessDetails?.businessWhatsapp || "").replace(/\D/g, "");
                                  const msg = `Olá, ${name}! Identificamos uma pendência financeira referente à sua assinatura do NovaesWeb CRM AI. Podemos ajudar você a regularizar o pagamento?`;
                                  if (phone) window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(msg)}`, "_blank");
                                  else alert("WhatsApp não cadastrado na ficha da empresa.");
                                }}
                                style={{padding: "4px 8px", fontSize: "11px", borderRadius: "6px", background: "#22c55e", color: "#fff"}}
                              >
                                Cobrar no WhatsApp
                              </button>
                            </div>
                          </div>
                        );
                      })}
                      {finance.alerts.dueSoon.map(o => (
                        <div key={o.tenantId} style={{display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: "8px", background: "rgba(245,158,11,0.08)", color: "#fcd34d", flexWrap: "wrap", gap: "8px"}}>
                          <span>🟡 {o.name} — vence em {o.dueDate.split("-").reverse().join("/")}</span><strong>{brl(o.amount)}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Gestão de Despesas Operacionais */}
                <div className="op-card" style={{padding: "20px", borderRadius: "14px"}}>
                  <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "10px"}}>
                    <div>
                      <h3 style={{fontSize: "16px", fontWeight: 800, margin: 0, color: "white"}}>Despesas Operacionais NovaesWeb</h3>
                      <small style={{color: "#9ca3af", fontSize: "12px"}}>Custos de IA, servidores, infraestrutura e ferramentas para apuração do lucro real.</small>
                    </div>
                    <button
                      type="button"
                      className="op-primary"
                      onClick={() => setExpenseModalOpen(true)}
                      style={{padding: "8px 14px", borderRadius: "8px", fontSize: "12px", fontWeight: 700, display: "flex", alignItems: "center", gap: "6px"}}
                    >
                      <PlusCircle size={14}/> Nova Despesa
                    </button>
                  </div>

                  {operationalExpenses.length === 0 ? (
                    <div style={{padding: "16px", textAlign: "center", color: "#71717a", fontSize: "13px"}}>
                      Nenhuma despesa cadastrada ainda. Clique em &quot;Nova Despesa&quot; para registrar seus custos operacionais.
                    </div>
                  ) : (
                    <div style={{overflowX: "auto"}}>
                      <table style={{width: "100%", borderCollapse: "collapse", fontSize: "13px", color: "#c4bed6"}}>
                        <thead>
                          <tr style={{borderBottom: "1px solid #332b49", textAlign: "left", color: "#9ca3af", fontSize: "11px", textTransform: "uppercase"}}>
                            <th style={{padding: "8px 10px"}}>Descrição</th>
                            <th style={{padding: "8px 10px"}}>Categoria</th>
                            <th style={{padding: "8px 10px"}}>Valor</th>
                            <th style={{padding: "8px 10px"}}>Vencimento</th>
                            <th style={{padding: "8px 10px"}}>Status</th>
                            <th style={{padding: "8px 10px"}}>Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {operationalExpenses.map(exp => (
                            <tr key={exp.id} style={{borderBottom: "1px solid rgba(255,255,255,0.04)"}}>
                              <td style={{padding: "8px 10px", color: "white", fontWeight: 600}}>
                                {exp.description}
                                {exp.supplier && <span style={{display: "block", fontSize: "11px", color: "#9ca3af"}}>{exp.supplier}</span>}
                              </td>
                              <td style={{padding: "8px 10px", textTransform: "capitalize"}}>{exp.category}</td>
                              <td style={{padding: "8px 10px", color: "#f43f5e", fontWeight: 700}}>{brl(exp.amount)}</td>
                              <td style={{padding: "8px 10px"}}>{exp.dueDate.split("-").reverse().join("/")}</td>
                              <td style={{padding: "8px 10px"}}>
                                <span style={{
                                  padding: "2px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: 700,
                                  background: exp.status === "paid" ? "rgba(0,219,140,0.15)" : "rgba(245,158,11,0.15)",
                                  color: exp.status === "paid" ? "#00db8c" : "#fcd34d"
                                }}>
                                  {exp.status === "paid" ? "Paga" : "Pendente"}
                                </span>
                              </td>
                              <td style={{padding: "8px 10px"}}>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const nextStatus = exp.status === "paid" ? "pending" : "paid";
                                    await fetch("/api/crm/admin/finance", {
                                      method: "POST", headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ action: "update_expense", id: exp.id, status: nextStatus })
                                    });
                                    await fetchFinanceSettings();
                                  }}
                                  style={{background: "none", border: "none", color: "#a855f7", cursor: "pointer", fontSize: "12px", textDecoration: "underline", marginRight: "10px"}}
                                >
                                  {exp.status === "paid" ? "Marcar Pendente" : "Marcar Paga"}
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (!confirm(`Excluir a despesa "${exp.description}"?`)) return;
                                    await fetch("/api/crm/admin/finance", {
                                      method: "POST", headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ action: "delete_expense", id: exp.id })
                                    });
                                    await fetchFinanceSettings();
                                  }}
                                  style={{background: "none", border: "none", color: "#f43f5e", cursor: "pointer", fontSize: "12px"}}
                                >
                                  Excluir
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* CENTRAL GERAL DE COBRANÇAS DAS LOJAS */}
                <div className="op-card" style={{padding: "24px", borderRadius: "16px"}}>
                  <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px"}}>
                    <div>
                      <h3 style={{fontSize: "18px", fontWeight: 800, margin: 0, color: "white"}}>Central Geral de Cobranças das Lojas</h3>
                      <small style={{color: "#9ca3af", fontSize: "12px"}}>Controle consolidado das faturas e mensalidades de todos os lojistas do CRM.</small>
                    </div>
                    <div style={{display: "flex", gap: "8px", flexWrap: "wrap"}}>
                      <button
                        type="button"
                        className="op-refresh"
                        onClick={() => {
                          const headers = ["Empresa", "Responsavel", "Plano", "Mensalidade (R$)", "Vencimento", "Situacao", "WhatsApp"];
                          const rows = clients.filter(c => !c.isMasterOwnTenant).map(c => [
                            `"${c.name.replace(/"/g, '""')}"`,
                            `"${(c.businessDetails?.ownerName || c.ownerName || "").replace(/"/g, '""')}"`,
                            `"${(c.plan.name || "").replace(/"/g, '""')}"`,
                            `"${c.plan.price || "0,00"}"`,
                            `"${c.plan.dueDate || ""}"`,
                            c.plan.status === "paid" ? "Paga / Em Dia" : (c.plan.isOverdue ? "Em Atraso" : "Pendente"),
                            `"${c.businessDetails?.businessWhatsapp || ""}"`
                          ]);
                          const csv = "\uFEFF" + [headers.join(";"), ...rows.map(r => r.join(";"))].join("\r\n");
                          const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                          const link = document.createElement("a");
                          link.href = URL.createObjectURL(blob);
                          link.download = `relatorio-cobrancas-${new Date().toISOString().slice(0, 10)}.csv`;
                          link.click();
                        }}
                        style={{padding: "8px 12px", borderRadius: "8px", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px"}}
                      >
                        <Download size={14}/> Exportar CSV
                      </button>
                    </div>
                  </div>

                  <div style={{overflowX: "auto"}}>
                    <table style={{width: "100%", borderCollapse: "collapse", fontSize: "13px", color: "#c4bed6"}}>
                      <thead>
                        <tr style={{borderBottom: "1px solid #332b49", textAlign: "left", color: "#9ca3af", fontSize: "11px", textTransform: "uppercase"}}>
                          <th style={{padding: "10px"}}>Loja / Empresa</th>
                          <th style={{padding: "10px"}}>Responsável</th>
                          <th style={{padding: "10px"}}>Plano</th>
                          <th style={{padding: "10px"}}>Valor</th>
                          <th style={{padding: "10px"}}>Vencimento</th>
                          <th style={{padding: "10px"}}>Situação</th>
                          <th style={{padding: "10px"}}>Ações Rápidas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clients.filter(c => !c.isMasterOwnTenant).map(c => {
                          const isPaid = c.plan.status === "paid";
                          const isOverdue = c.plan.isOverdue;
                          return (
                            <tr key={c.id} style={{borderBottom: "1px solid rgba(255,255,255,0.04)"}}>
                              <td style={{padding: "10px", color: "white", fontWeight: 700}}>
                                {c.name}
                                {c.businessDetails?.document && (
                                  <span style={{display: "block", fontSize: "11px", color: "#9ca3af", fontWeight: 400}}>
                                    {c.businessDetails.document}
                                  </span>
                                )}
                              </td>
                              <td style={{padding: "10px"}}>
                                {c.businessDetails?.ownerName || c.ownerName || c.email || "—"}
                              </td>
                              <td style={{padding: "10px"}}>
                                <span style={{color: "#ec4899", fontWeight: 600}}>
                                  {c.plan.isTrial ? "Teste Grátis" : c.plan.name}
                                </span>
                              </td>
                              <td style={{padding: "10px", color: "#fff", fontWeight: 700}}>
                                {c.plan.isTrial ? "R$ 0,00" : `R$ ${c.plan.price}`}
                              </td>
                              <td style={{padding: "10px"}}>
                                {c.plan.dueDate ? c.plan.dueDate.split("-").reverse().join("/") : "—"}
                              </td>
                              <td style={{padding: "10px"}}>
                                <span style={{
                                  padding: "3px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: 700,
                                  background: c.plan.isTrial
                                    ? "rgba(168, 85, 247, 0.15)"
                                    : isPaid ? "rgba(0,219,140,0.15)" : isOverdue ? "rgba(244,63,94,0.15)" : "rgba(245,158,11,0.15)",
                                  color: c.plan.isTrial
                                    ? "#a855f7"
                                    : isPaid ? "#00db8c" : isOverdue ? "#f43f5e" : "#fcd34d"
                                }}>
                                  {c.plan.isTrial ? "Teste" : isPaid ? "Paga" : isOverdue ? "Vencida" : "A Vencer"}
                                </span>
                              </td>
                              <td style={{padding: "10px"}}>
                                <div style={{display: "flex", gap: "6px"}}>
                                  <button
                                    type="button"
                                    onClick={() => setFinanceModalClient(c)}
                                    style={{
                                      padding: "4px 8px", borderRadius: "6px", fontSize: "11px",
                                      background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                                      color: "#fff", cursor: "pointer"
                                    }}
                                  >
                                    Ficha
                                  </button>

                                  {!isPaid && !c.plan.isTrial && (
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        await handleSetPaymentStatus(c, "paid");
                                      }}
                                      style={{
                                        padding: "4px 8px", borderRadius: "6px", fontSize: "11px",
                                        background: "rgba(0,219,140,0.15)", border: "1px solid rgba(0,219,140,0.3)",
                                        color: "#00db8c", cursor: "pointer", fontWeight: 700
                                      }}
                                    >
                                      Dar Baixa
                                    </button>
                                  )}

                                  {!isPaid && !c.plan.isTrial && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const name = c.businessDetails?.ownerName || c.name;
                                        const phone = (c.businessDetails?.businessWhatsapp || "").replace(/\D/g, "");
                                        const msg = `Olá, ${name}! Tudo bem?\nSua mensalidade da NovaesWeb CRM AI referente à empresa ${c.name} (R$ ${c.plan.price}) está com vencimento pendente.\nChave PIX: ${pixConfig.pixKey} (${pixConfig.beneficiaryName}).\nQualquer dúvida, estamos à disposição!`;
                                        if (phone) window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(msg)}`, "_blank");
                                        else alert("WhatsApp comercial não informado para esta empresa.");
                                      }}
                                      style={{
                                        padding: "4px 8px", borderRadius: "6px", fontSize: "11px",
                                        background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)",
                                        color: "#22c55e", cursor: "pointer"
                                      }}
                                    >
                                      Cobrar
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </section>
        )}

        {/* ===================== VIEW: RECARGAS & PIX ===================== */}
        {currentNav === "recharges" && (
          <section style={{display: "flex", flexDirection: "column", gap: "24px"}}>
            {/* Bento Cards Resumo */}
            <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px"}}>
              <div className="op-card" style={{
                padding: "20px",
                border: adminRecharges.filter(r => r.status === "pending").length > 0 ? "1px solid rgba(245, 158, 11, 0.4)" : "1px solid rgba(255, 255, 255, 0.08)",
                background: adminRecharges.filter(r => r.status === "pending").length > 0 ? "rgba(245, 158, 11, 0.06)" : "rgba(22, 19, 39, 0.65)",
                borderRadius: "16px"
              }}>
                <div style={{display: "flex", justifyContent: "space-between", alignItems: "flex-start"}}>
                  <span style={{fontSize: "12px", color: "#c4bed6", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700}}>
                    Recargas Pendentes
                  </span>
                  <div style={{width: "36px", height: "36px", borderRadius: "10px", background: "rgba(245, 158, 11, 0.15)", display: "grid", placeItems: "center"}}>
                    <Zap size={18} color="#f59e0b"/>
                  </div>
                </div>
                <strong style={{display: "block", fontSize: "34px", color: adminRecharges.filter(r => r.status === "pending").length > 0 ? "#fcd34d" : "#fff", marginTop: "8px", fontWeight: 900}}>
                  {adminRecharges.filter(r => r.status === "pending").length}
                </strong>
                <small style={{color: adminRecharges.filter(r => r.status === "pending").length > 0 ? "#fcd34d" : "#00db8c", fontSize: "12px", fontWeight: 600}}>
                  {adminRecharges.filter(r => r.status === "pending").length > 0 ? "⚠️ Requer sua conferência bancária" : "✅ Todas as solicitações processadas"}
                </small>
              </div>

              <div className="op-card" style={{padding: "20px", background: "rgba(22, 19, 39, 0.65)", borderRadius: "16px"}}>
                <div style={{display: "flex", justifyContent: "space-between", alignItems: "flex-start"}}>
                  <span style={{fontSize: "12px", color: "#c4bed6", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700}}>
                    Receita com Recargas
                  </span>
                  <div style={{width: "36px", height: "36px", borderRadius: "10px", background: "rgba(0, 219, 140, 0.15)", display: "grid", placeItems: "center"}}>
                    <DollarSign size={18} color="#00db8c"/>
                  </div>
                </div>
                <strong style={{display: "block", fontSize: "34px", color: "#00db8c", marginTop: "8px", fontWeight: 900}}>
                  R$ {adminRecharges.filter(r => r.status === "paid").reduce((s, r) => s + (Number(r.pricePaid) || 0), 0).toFixed(2).replace(".", ",")}
                </strong>
                <small style={{color: "#aba8bf", fontSize: "12px"}}>Faturamento confirmado em créditos</small>
              </div>

              <div className="op-card" style={{padding: "20px", background: "rgba(22, 19, 39, 0.65)", borderRadius: "16px"}}>
                <div style={{display: "flex", justifyContent: "space-between", alignItems: "flex-start"}}>
                  <span style={{fontSize: "12px", color: "#c4bed6", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700}}>
                    Créditos IA Liberados
                  </span>
                  <div style={{width: "36px", height: "36px", borderRadius: "10px", background: "rgba(236, 72, 153, 0.15)", display: "grid", placeItems: "center"}}>
                    <Bot size={18} color="#ec4899"/>
                  </div>
                </div>
                <strong style={{display: "block", fontSize: "34px", color: "#fff", marginTop: "8px", fontWeight: 900}}>
                  {adminRecharges.filter(r => r.status === "paid").reduce((s, r) => s + (Number(r.messagesAdded) || 0), 0).toLocaleString("pt-BR")}
                </strong>
                <small style={{color: "#aba8bf", fontSize: "12px"}}>Mensagens extras de IA ativadas</small>
              </div>
            </div>

            {/* Painel da Chave PIX Ativa */}
            <div className="op-card" style={{
              padding: "20px 24px",
              background: "linear-gradient(135deg, rgba(236, 72, 153, 0.12), rgba(139, 92, 246, 0.1))",
              border: "1px solid rgba(236, 72, 153, 0.35)",
              borderRadius: "16px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "16px"
            }}>
              <div>
                <span style={{fontSize: "11px", color: "#ec4899", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px"}}>
                  Chave PIX Vigente da NovaesWeb (Visível para todos os lojistas)
                </span>
                <div style={{display: "flex", alignItems: "center", gap: "10px", marginTop: "4px"}}>
                  <strong style={{fontSize: "18px", color: "#fff"}}>{pixConfig.pixKey}</strong>
                  <span style={{fontSize: "11px", background: "rgba(255,255,255,0.1)", padding: "2px 8px", borderRadius: "6px", color: "#d1c8e6", textTransform: "uppercase", fontWeight: 700}}>
                    {pixConfig.keyType}
                  </span>
                </div>
                <div style={{fontSize: "13px", color: "#c4bed6", marginTop: "4px"}}>
                  <span>Favorecido: <strong>{pixConfig.beneficiaryName}</strong></span>
                  {pixConfig.bankName && <span style={{marginLeft: "12px"}}>Banco: <strong>{pixConfig.bankName}</strong></span>}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPixModalOpen(true)}
                className="op-primary"
                style={{padding: "10px 18px", borderRadius: "10px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px"}}
              >
                <Edit3 size={15}/> Alterar Chave PIX
              </button>
            </div>

            {/* Tabela de Solicitações */}
            <div className="op-card" style={{padding: "24px", borderRadius: "16px"}}>
              <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px", flexWrap: "wrap", gap: "12px"}}>
                <div>
                  <h3 style={{margin: 0, fontSize: "18px", fontWeight: 800, color: "#fff"}}>
                    Fila de Solicitações de Recarga
                  </h3>
                  <span style={{fontSize: "12px", color: "#c4bed6"}}>
                    Clique em &quot;Aprovar&quot; após conferir o recebimento do valor na sua conta bancária.
                  </span>
                </div>

                {/* Filtros */}
                <div style={{display: "flex", gap: "8px", flexWrap: "wrap"}}>
                  {[
                    { id: "all", label: `Todas (${adminRecharges.length})` },
                    { id: "pending", label: `⏳ Pendentes (${adminRecharges.filter(r => r.status === "pending").length})`, highlight: adminRecharges.filter(r => r.status === "pending").length > 0 },
                    { id: "paid", label: `✅ Aprovadas (${adminRecharges.filter(r => r.status === "paid").length})` },
                    { id: "rejected", label: `❌ Recusadas (${adminRecharges.filter(r => r.status === "rejected").length})` }
                  ].map(f => {
                    const isSelected = rechargeFilter === f.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setRechargeFilter(f.id as typeof rechargeFilter)}
                        style={{
                          padding: "6px 12px",
                          borderRadius: "8px",
                          border: isSelected ? "1px solid #ec4899" : "1px solid rgba(255, 255, 255, 0.1)",
                          background: isSelected ? "var(--grad-primary)" : f.highlight ? "rgba(245, 158, 11, 0.15)" : "transparent",
                          color: isSelected ? "#fff" : f.highlight ? "#fcd34d" : "#c4bed6",
                          fontSize: "12px",
                          fontWeight: 700,
                          cursor: "pointer"
                        }}
                      >
                        {f.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {adminRecharges.filter(r => rechargeFilter === "all" ? true : r.status === rechargeFilter).length === 0 ? (
                <div style={{textAlign: "center", padding: "40px 20px", color: "#aba8bf", fontSize: "14px", border: "1px dashed rgba(255, 255, 255, 0.08)", borderRadius: "12px"}}>
                  Nenhuma solicitação de recarga encontrada neste filtro.
                </div>
              ) : (
                <div className="op-table-wrapper" style={{overflowX: "auto"}}>
                  <table style={{width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left"}}>
                    <thead>
                      <tr style={{borderBottom: "1px solid rgba(255, 255, 255, 0.1)", color: "#aba8bf"}}>
                        <th style={{padding: "12px 14px"}}>Data / Hora</th>
                        <th style={{padding: "12px 14px"}}>Loja / Solicitante</th>
                        <th style={{padding: "12px 14px"}}>Pacote</th>
                        <th style={{padding: "12px 14px"}}>Valor</th>
                        <th style={{padding: "12px 14px"}}>Identificação PIX</th>
                        <th style={{padding: "12px 14px"}}>Status</th>
                        <th style={{padding: "12px 14px", textAlign: "right"}}>Ações Financeiras</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminRecharges.filter(r => rechargeFilter === "all" ? true : r.status === rechargeFilter).map(rec => (
                        <tr key={rec.id} style={{borderBottom: "1px solid rgba(255, 255, 255, 0.04)", color: "#fff"}}>
                          <td style={{padding: "12px 14px", color: "#c4bed6", whiteSpace: "nowrap"}}>
                            {rec.purchasedAt ? new Date(rec.purchasedAt).toLocaleString("pt-BR") : "—"}
                          </td>
                          <td style={{padding: "12px 14px"}}>
                            <strong style={{color: "#fff", display: "block"}}>{rec.tenantName}</strong>
                            <span style={{fontSize: "11px", color: "#aba8bf"}}>{rec.tenantEmail}</span>
                          </td>
                          <td style={{padding: "12px 14px", color: "#ec4899", fontWeight: 700}}>
                            +{rec.messagesAdded} mensagens IA
                          </td>
                          <td style={{padding: "12px 14px", color: "#00db8c", fontWeight: 800}}>
                            R$ {Number(rec.pricePaid || 0).toFixed(2).replace(".", ",")}
                          </td>
                          <td style={{padding: "12px 14px", color: "#c4bed6", maxWidth: "200px"}}>
                            {rec.clientNotes ? (
                              <span style={{background: "rgba(255,255,255,0.06)", padding: "4px 8px", borderRadius: "6px", display: "inline-block", fontSize: "12px"}}>
                                📝 {rec.clientNotes}
                              </span>
                            ) : (
                              <span style={{color: "#6b7280"}}>Nenhuma observação</span>
                            )}
                          </td>
                          <td style={{padding: "12px 14px"}}>
                            <span style={{
                              padding: "4px 10px",
                              borderRadius: "999px",
                              fontSize: "11px",
                              fontWeight: 800,
                              background: rec.status === "paid" ? "rgba(0, 219, 140, 0.15)" : rec.status === "rejected" ? "rgba(239, 68, 68, 0.15)" : "rgba(245, 158, 11, 0.18)",
                              color: rec.status === "paid" ? "#00db8c" : rec.status === "rejected" ? "#fca5a5" : "#fcd34d",
                              border: `1px solid ${rec.status === "paid" ? "rgba(0, 219, 140, 0.35)" : rec.status === "rejected" ? "rgba(239, 68, 68, 0.35)" : "rgba(245, 158, 11, 0.4)"}`
                            }}>
                              {rec.status === "paid" ? "✅ Aprovado" : rec.status === "rejected" ? "❌ Recusado" : "⏳ Pendente"}
                            </span>
                          </td>
                          <td style={{padding: "12px 14px", textAlign: "right"}}>
                            {rec.status === "pending" ? (
                              <div style={{display: "inline-flex", gap: "8px", justifyContent: "flex-end"}}>
                                <button
                                  type="button"
                                  disabled={approvingRechargeId === rec.id}
                                  onClick={() => handleApproveRecharge(rec.tenantId, rec.id)}
                                  className="op-primary"
                                  style={{padding: "6px 12px", fontSize: "12px", borderRadius: "8px", fontWeight: 700, background: "#00db8c", color: "#000"}}
                                  title="Confirmar recebimento do PIX e creditar mensagens"
                                >
                                  {approvingRechargeId === rec.id ? "Aprovando..." : "✅ Aprovar e Creditar"}
                                </button>
                                <button
                                  type="button"
                                  disabled={approvingRechargeId === rec.id}
                                  onClick={() => {
                                    setTargetRechargeForReject(rec);
                                    setRejectionReasonInput("");
                                    setRejectionModalOpen(true);
                                  }}
                                  className="op-refresh"
                                  style={{padding: "6px 12px", fontSize: "12px", borderRadius: "8px", color: "#fca5a5", borderColor: "#ef4444"}}
                                  title="Recusar solicitação"
                                >
                                  ❌ Recusar
                                </button>
                              </div>
                            ) : rec.status === "paid" ? (
                              <span style={{fontSize: "11px", color: "#00db8c"}}>
                                Aprovado em {rec.approvedAt ? new Date(rec.approvedAt).toLocaleDateString("pt-BR") : "—"}
                              </span>
                            ) : (
                              <span style={{fontSize: "11px", color: "#f87171"}} title={rec.rejectionReason}>
                                Recusado: {rec.rejectionReason || "PIX não identificado"}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ===================== SEÇÃO: SEGURANÇA & RECUPERAÇÃO DE SENHA ===================== */}
        {currentNav === "security" && (
          <section className="op-section animate-fade-in" style={{ display: "grid", gap: "24px" }}>
            {/* CARDS DE STATUS RÁPIDO */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
              <div className="op-card" style={{ padding: "20px", borderRadius: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{ width: "42px", height: "42px", borderRadius: "12px", background: "rgba(168, 85, 247, 0.15)", display: "grid", placeItems: "center" }}>
                    <Smartphone size={20} color="#c084fc" />
                  </div>
                  <div>
                    <span style={{ fontSize: "11px", color: "#a855f7", fontWeight: 800, textTransform: "uppercase" }}>WhatsApp Cadastrado</span>
                    <strong style={{ display: "block", fontSize: "18px", color: "#fff", marginTop: "2px" }}>
                      {masterRecoveryMasked || "Nenhum número cadastrado"}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="op-card" style={{ padding: "20px", borderRadius: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{ width: "42px", height: "42px", borderRadius: "12px", background: masterRecoveryVerified ? "rgba(16, 185, 129, 0.15)" : "rgba(245, 158, 11, 0.15)", display: "grid", placeItems: "center" }}>
                    {masterRecoveryVerified ? <ShieldCheck size={20} color="#34d399" /> : <AlertTriangle size={20} color="#f59e0b" />}
                  </div>
                  <div>
                    <span style={{ fontSize: "11px", color: masterRecoveryVerified ? "#34d399" : "#f59e0b", fontWeight: 800, textTransform: "uppercase" }}>Status da Verificação</span>
                    <strong style={{ display: "block", fontSize: "18px", color: masterRecoveryVerified ? "#34d399" : "#f59e0b", marginTop: "2px" }}>
                      {masterRecoveryVerified ? "WhatsApp Verificado ✅" : "Pendente de Validação ⚠️"}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="op-card" style={{ padding: "20px", borderRadius: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{ width: "42px", height: "42px", borderRadius: "12px", background: "rgba(236, 72, 153, 0.15)", display: "grid", placeItems: "center" }}>
                    <KeyRound size={20} color="#f472b6" />
                  </div>
                  <div>
                    <span style={{ fontSize: "11px", color: "#f472b6", fontWeight: 800, textTransform: "uppercase" }}>Proteção de Autenticação</span>
                    <strong style={{ display: "block", fontSize: "18px", color: "#fff", marginTop: "2px" }}>
                      Bloqueio em 5 tentativas
                    </strong>
                  </div>
                </div>
              </div>
            </div>

            {/* CARD PRINCIPAL */}
            <div className="op-card" style={{
              padding: "28px",
              borderRadius: "20px",
              background: "linear-gradient(135deg, rgba(26, 20, 48, 0.95), rgba(18, 12, 33, 0.98))",
              border: "1px solid rgba(168, 85, 247, 0.3)",
              boxShadow: "0 12px 36px rgba(0,0,0,0.4)"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px", marginBottom: "20px" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <KeyRound size={22} color="#ec4899" />
                    <h3 style={{ margin: 0, fontSize: "20px", fontWeight: 800, color: "#fff" }}>
                      Recuperação de Senha do Administrador Master
                    </h3>
                  </div>
                  <p style={{ margin: "6px 0 0", fontSize: "13px", color: "#c4bed6", maxWidth: "680px", lineHeight: "1.5" }}>
                    Vincule o WhatsApp exclusivo do administrador autorizado para receber o código seguro de 6 dígitos em caso de bloqueio por tentativas incorretas ou redefinição autorizada.
                  </p>
                </div>

                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => {
                      setNewMasterPhoneInput("");
                      setMasterVerificationCode("");
                      setMasterSecurityStep(1);
                      setMasterSecurityErr("");
                      setMasterSecurityMsg("");
                      setSecurityModalOpen(true);
                    }}
                    className="op-primary"
                    style={{
                      padding: "10px 18px",
                      borderRadius: "10px",
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      background: "linear-gradient(135deg, #a855f7, #ec4899)"
                    }}
                  >
                    <Smartphone size={16} />
                    {masterRecoveryPhone ? "Alterar Número de WhatsApp" : "Cadastrar WhatsApp"}
                  </button>

                  {masterRecoveryVerified && (
                    <button
                      type="button"
                      disabled={masterSecurityLoading}
                      onClick={() => void handleTestMasterRecoveryOtp()}
                      className="op-refresh"
                      style={{
                        padding: "10px 18px",
                        borderRadius: "10px",
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        border: "1px solid rgba(255, 255, 255, 0.15)",
                        background: "rgba(255, 255, 255, 0.05)",
                        color: "#fff"
                      }}
                    >
                      <RefreshCw size={15} className={masterSecurityLoading ? "animate-spin" : ""} />
                      {masterSecurityLoading ? "Enviando..." : "Testar Envio no WhatsApp"}
                    </button>
                  )}
                </div>
              </div>

              {/* MENSAGENS DE FEEDBACK */}
              {masterSecurityMsg && (
                <div style={{
                  padding: "12px 16px",
                  borderRadius: "10px",
                  background: "rgba(16, 185, 129, 0.15)",
                  border: "1px solid rgba(16, 185, 129, 0.4)",
                  color: "#34d399",
                  fontSize: "13px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "16px"
                }}>
                  <CheckCircle2 size={16} />
                  <span>{masterSecurityMsg}</span>
                </div>
              )}

              {masterSecurityErr && (
                <div style={{
                  padding: "12px 16px",
                  borderRadius: "10px",
                  background: "rgba(244, 63, 94, 0.15)",
                  border: "1px solid rgba(244, 63, 94, 0.4)",
                  color: "#f87171",
                  fontSize: "13px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "16px"
                }}>
                  <AlertTriangle size={16} />
                  <span>{masterSecurityErr}</span>
                </div>
              )}

              {/* QUADRO DE POLÍTICA DE SEGURANÇA */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: "14px",
                padding: "18px",
                borderRadius: "14px",
                background: "rgba(15, 11, 28, 0.6)",
                border: "1px solid rgba(255, 255, 255, 0.08)"
              }}>
                <div>
                  <strong style={{ fontSize: "13px", color: "#e2e8f0", display: "flex", alignItems: "center", gap: "6px" }}>
                    <ShieldCheck size={15} color="#c084fc" /> Código Criptográfico de 6 Dígitos
                  </strong>
                  <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#94a3b8", lineHeight: "1.4" }}>
                    Gerado com entropia criptográfica e enviado instantaneamente via canal oficial da Evolution API.
                  </p>
                </div>
                <div>
                  <strong style={{ fontSize: "13px", color: "#e2e8f0", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Lock size={15} color="#f472b6" /> Validade &amp; Uso Único
                  </strong>
                  <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#94a3b8", lineHeight: "1.4" }}>
                    Válido por 10 minutos, com limite máximo de 3 tentativas para evitar força bruta.
                  </p>
                </div>
                <div>
                  <strong style={{ fontSize: "13px", color: "#e2e8f0", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Check size={15} color="#34d399" /> Nova Senha Definitiva
                  </strong>
                  <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#94a3b8", lineHeight: "1.4" }}>
                    A nova senha é definitiva, permanente e nunca expira por tempo decorrido.
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ===================== MODAIS ===================== */}

        {/* MODAL CONFIGURAR CHAVE PIX */}
        {pixModalOpen && (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(9, 7, 20, 0.82)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
            display: "grid", placeItems: "center", zIndex: 120, padding: "20px"
          }}>
            <div className="op-card" style={{width: "100%", maxWidth: "520px", padding: "28px", borderColor: "#ec4899", borderRadius: "20px", boxShadow: "0 20px 50px rgba(0, 0, 0, 0.7)"}}>
              <div style={{display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px"}}>
                <Coins size={22} color="#ec4899"/>
                <h3 style={{margin: 0, fontSize: "20px", fontWeight: 800}}>Configurar Chave PIX Oficial</h3>
              </div>
              <p style={{margin: "0 0 16px", fontSize: "13px", color: "#c4bed6"}}>
                Esta chave e dados de pagamento serão exibidos imediatamente para todos os lojistas que solicitarem recarga de créditos.
              </p>

              <form onSubmit={handleSavePixConfig} style={{display: "flex", flexDirection: "column", gap: "14px"}}>
                <div>
                  <label style={{fontSize: "12px", color: "#aba8bf", display: "block", marginBottom: "4px"}}>Tipo de Chave PIX</label>
                  <select
                    value={pixConfig.keyType}
                    onChange={e => setPixConfig({ ...pixConfig, keyType: e.target.value as typeof pixConfig.keyType })}
                    style={{width: "100%", padding: "10px", borderRadius: "8px", background: "#1c182c", border: "1px solid #4a3c68", color: "#fff", fontSize: "13px"}}
                  >
                    <option value="cnpj">CNPJ</option>
                    <option value="email">E-mail</option>
                    <option value="phone">Telefone (Celular)</option>
                    <option value="random">Chave Aleatória (EVP)</option>
                  </select>
                </div>

                <div>
                  <label style={{fontSize: "12px", color: "#aba8bf", display: "block", marginBottom: "4px"}}>Chave PIX</label>
                  <input
                    type="text"
                    required
                    value={pixConfig.pixKey}
                    onChange={e => setPixConfig({ ...pixConfig, pixKey: e.target.value })}
                    placeholder="Ex: 58.742.894/0001-40 ou financeiro@novaesweb.com.br"
                    style={{width: "100%", padding: "10px", borderRadius: "8px", background: "#1c182c", border: "1px solid #4a3c68", color: "#fff", fontSize: "13px"}}
                  />
                </div>

                <div>
                  <label style={{fontSize: "12px", color: "#aba8bf", display: "block", marginBottom: "4px"}}>Nome do Favorecido / Beneficiário</label>
                  <input
                    type="text"
                    required
                    value={pixConfig.beneficiaryName}
                    onChange={e => setPixConfig({ ...pixConfig, beneficiaryName: e.target.value })}
                    placeholder="Ex: NovaesWeb Soluções Digitais Ltda"
                    style={{width: "100%", padding: "10px", borderRadius: "8px", background: "#1c182c", border: "1px solid #4a3c68", color: "#fff", fontSize: "13px"}}
                  />
                </div>

                <div>
                  <label style={{fontSize: "12px", color: "#aba8bf", display: "block", marginBottom: "4px"}}>Banco / Instituição (Opcional)</label>
                  <input
                    type="text"
                    value={pixConfig.bankName || ""}
                    onChange={e => setPixConfig({ ...pixConfig, bankName: e.target.value })}
                    placeholder="Ex: Banco Inter / NuBank"
                    style={{width: "100%", padding: "10px", borderRadius: "8px", background: "#1c182c", border: "1px solid #4a3c68", color: "#fff", fontSize: "13px"}}
                  />
                </div>

                <div>
                  <label style={{fontSize: "12px", color: "#aba8bf", display: "block", marginBottom: "4px"}}>Instruções para o Lojista</label>
                  <textarea
                    rows={3}
                    value={pixConfig.instructions || ""}
                    onChange={e => setPixConfig({ ...pixConfig, instructions: e.target.value })}
                    placeholder="Ex: Realize a transferência PIX e clique em 'Informar Pagamento'. Os créditos serão liberados em minutos."
                    style={{width: "100%", padding: "10px", borderRadius: "8px", background: "#1c182c", border: "1px solid #4a3c68", color: "#fff", fontSize: "13px"}}
                  />
                </div>

                <div style={{display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px"}}>
                  <button
                    type="button"
                    onClick={() => setPixModalOpen(false)}
                    className="op-refresh"
                    style={{padding: "8px 16px", borderRadius: "8px"}}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={savingPix}
                    className="op-primary"
                    style={{padding: "8px 20px", borderRadius: "8px", fontWeight: 800}}
                  >
                    {savingPix ? "Salvando..." : "Salvar Configurações de PIX"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL RECUSAR RECARGA */}
        {rejectionModalOpen && targetRechargeForReject && (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(9, 7, 20, 0.82)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
            display: "grid", placeItems: "center", zIndex: 120, padding: "20px"
          }}>
            <div className="op-card" style={{width: "100%", maxWidth: "460px", padding: "26px", borderColor: "#f43f5e", borderRadius: "20px", boxShadow: "0 20px 50px rgba(0, 0, 0, 0.7)"}}>
              <h3 style={{margin: "0 0 8px", fontSize: "18px", fontWeight: 800, color: "#fff"}}>
                Recusar Recarga — {targetRechargeForReject.tenantName}
              </h3>
              <p style={{margin: "0 0 16px", fontSize: "13px", color: "#c4bed6"}}>
                Valor solicitado: <strong>R$ {Number(targetRechargeForReject.pricePaid).toFixed(2).replace(".", ",")}</strong> (+{targetRechargeForReject.messagesAdded} msgs).
              </p>

              <div>
                <label style={{fontSize: "12px", color: "#aba8bf", display: "block", marginBottom: "6px"}}>
                  Motivo da Recusa (visível para o cliente no histórico):
                </label>
                <input
                  type="text"
                  value={rejectionReasonInput}
                  onChange={e => setRejectionReasonInput(e.target.value)}
                  placeholder="Ex: Comprovante não anexado / PIX não localizado"
                  style={{width: "100%", padding: "10px", borderRadius: "8px", background: "#1c182c", border: "1px solid #4a3c68", color: "#fff", fontSize: "13px"}}
                />
              </div>

              <div style={{display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "18px"}}>
                <button
                  type="button"
                  onClick={() => {
                    setRejectionModalOpen(false);
                    setTargetRechargeForReject(null);
                  }}
                  className="op-refresh"
                  style={{padding: "8px 16px", borderRadius: "8px"}}
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={handleRejectRecharge}
                  className="op-primary"
                  style={{padding: "8px 18px", borderRadius: "8px", fontWeight: 800, background: "#ef4444"}}
                >
                  Confirmar Recusa
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 1: EDITAR / CRIAR PLANO */}
        {editPlanModalOpen && (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(9, 7, 20, 0.82)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
            display: "grid", placeItems: "center", zIndex: 100, padding: "20px"
          }}>
            <div className="op-card" style={{
              width: "100%", maxWidth: "620px", maxHeight: "90vh", overflowY: "auto",
              padding: "28px", borderColor: "#ec4899"
            }}>
              <div style={{display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px"}}>
                <Edit3 size={22} color="#ec4899"/>
                <h3 style={{margin: 0, fontSize: "20px", fontWeight: 800}}>
                  {isCreatingNewPlan ? "Criar Novo Plano Comercial" : `Editar Plano: ${editingPlan.name}`}
                </h3>
              </div>

              <div style={{display: "flex", flexDirection: "column", gap: "14px"}}>
                <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px"}}>
                  <div>
                    <label style={{fontSize: "12px", color: "#a599c2", display: "block", marginBottom: "4px"}}>ID do Plano (Slug estável)</label>
                    <input
                      type="text"
                      disabled={!isCreatingNewPlan}
                      value={editingPlan.id}
                      onChange={e => setEditingPlan({ ...editingPlan, id: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") })}
                      style={{width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #443c5e", background: isCreatingNewPlan ? "#121222" : "#1a1628", color: "white", fontFamily: "monospace"}}
                    />
                  </div>
                  <div>
                    <label style={{fontSize: "12px", color: "#a599c2", display: "block", marginBottom: "4px"}}>Nome Comercial</label>
                    <input
                      type="text"
                      value={editingPlan.name}
                      onChange={e => setEditingPlan({ ...editingPlan, name: e.target.value })}
                      style={{width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white"}}
                    />
                  </div>
                </div>

                <div style={{display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px"}}>
                  <div>
                    <label style={{fontSize: "12px", color: "#a599c2", display: "block", marginBottom: "4px"}}>Preço Mensal (R$)</label>
                    <input
                      type="text"
                      value={editingPlan.price}
                      onChange={e => setEditingPlan({ ...editingPlan, price: e.target.value })}
                      style={{width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white"}}
                    />
                  </div>
                  <div>
                    <label style={{fontSize: "12px", color: "#a599c2", display: "block", marginBottom: "4px"}}>Franquia (Msgs/mês)</label>
                    <input
                      type="number"
                      value={editingPlan.quotaLimit}
                      onChange={e => setEditingPlan({ ...editingPlan, quotaLimit: Number(e.target.value) })}
                      style={{width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white"}}
                    />
                  </div>
                  <div>
                    <label style={{fontSize: "12px", color: "#a599c2", display: "block", marginBottom: "4px"}}>Max WhatsApps (1-5)</label>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={editingPlan.maxWhatsAppConnections || 1}
                      onChange={e => setEditingPlan({ ...editingPlan, maxWhatsAppConnections: Math.min(5, Math.max(1, Number(e.target.value))) })}
                      style={{width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white"}}
                    />
                  </div>
                  <div>
                    <label style={{fontSize: "12px", color: "#a599c2", display: "block", marginBottom: "4px"}}>Max Operadores</label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={editingPlan.maxOperators || 1}
                      onChange={e => setEditingPlan({ ...editingPlan, maxOperators: Math.max(1, Number(e.target.value)) })}
                      style={{width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white"}}
                    />
                  </div>
                </div>

                <div>
                  <label style={{fontSize: "12px", color: "#a599c2", display: "block", marginBottom: "4px"}}>Descrição Comercial</label>
                  <input
                    type="text"
                    value={editingPlan.description}
                    onChange={e => setEditingPlan({ ...editingPlan, description: e.target.value })}
                    style={{width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white"}}
                  />
                </div>

                {/* Checklist dos 9 Recursos Técnicos */}
                <div style={{background: "rgba(255,255,255,0.03)", padding: "14px", borderRadius: "10px", border: "1px solid #3d344f"}}>
                  <strong style={{fontSize: "13px", color: "#fff", display: "block", marginBottom: "10px"}}>
                    Habilitar Recursos Técnicos para este Plano:
                  </strong>
                  <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "10px"}}>
                    {TECHNICAL_FEATURES_LIST.map(feat => {
                      const isChecked = Boolean(feat.isCore) || (editingPlan.allowedFeatures || []).includes(feat.id);
                      return (
                        <div
                          key={feat.id}
                          role="checkbox"
                          aria-checked={isChecked || Boolean(feat.isCore)}
                          aria-disabled={Boolean(feat.isCore)}
                          tabIndex={feat.isCore ? -1 : 0}
                          onKeyDown={event => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); handleToggleFeatureInEditor(feat.id); } }}
                          onClick={() => handleToggleFeatureInEditor(feat.id)}
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "8px",
                            cursor: "pointer",
                            padding: "6px 8px",
                            borderRadius: "6px",
                            background: isChecked ? "rgba(236,72,153,0.1)" : "transparent"
                          }}
                        >
                          {isChecked ? (
                            <CheckSquare size={16} color="#ec4899" style={{marginTop: "2px", flexShrink: 0}}/>
                          ) : (
                            <Square size={16} color="#6b7280" style={{marginTop: "2px", flexShrink: 0}}/>
                          )}
                          <div>
                            <span style={{fontSize: "12px", fontWeight: 700, color: isChecked ? "white" : "#9ca3af", display: "block"}}>
                              {feat.name}{feat.isCore ? " · Sempre incluído" : ""}
                            </span>
                            <small style={{fontSize: "11px", color: "#8e87a2", lineHeight: "1.2", display: "block"}}>
                              {feat.description}
                            </small>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label style={{fontSize: "12px", color: "#a599c2", display: "block", marginBottom: "4px"}}>
                    Itens da Lista Comercial (1 benefício por linha)
                  </label>
                  <textarea
                    rows={4}
                    value={editingFeaturesText}
                    onChange={e => setEditingFeaturesText(e.target.value)}
                    style={{width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white", fontSize: "13px"}}
                  />
                </div>

                <div style={{display: "flex", alignItems: "center", gap: "8px"}}>
                  <input
                    type="checkbox"
                    id="isPopular"
                    checked={editingPlan.isPopular || false}
                    onChange={e => setEditingPlan({ ...editingPlan, isPopular: e.target.checked })}
                    style={{width: "16px", height: "16px", accentColor: "#ec4899"}}
                  />
                  <label htmlFor="isPopular" style={{fontSize: "13px", color: "#e2e8f0", cursor: "pointer"}}>
                    Destacar como <strong>MAIS VENDIDO</strong> no catálogo
                  </label>
                </div>
              </div>

              <div style={{display: "flex", gap: "10px", justifyContent: "space-between", marginTop: "24px"}}>
                <div style={{display: "flex", gap: "8px", alignItems: "center"}}>
                  <button
                    type="button"
                    className="op-refresh"
                    onClick={() => setEditPlanModalOpen(false)}
                  >
                    Cancelar
                  </button>
                  {!isCreatingNewPlan && editingPlan.id !== "crm-trial" && editingPlan.id !== "crm-premium" && (
                    <button
                      type="button"
                      style={{
                        padding: "8px 14px",
                        borderRadius: "8px",
                        background: "rgba(244, 63, 94, 0.12)",
                        border: "1px solid rgba(244, 63, 94, 0.4)",
                        color: "#f43f5e",
                        fontWeight: 700,
                        fontSize: "13px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px"
                      }}
                      onClick={async () => {
                        setEditPlanModalOpen(false);
                        await handleDeletePlan(editingPlan);
                      }}
                    >
                      <Trash2 size={14} /> Excluir Plano
                    </button>
                  )}
                </div>
                <div style={{display: "flex", gap: "10px"}}>
                  <button
                    type="button"
                    className="op-refresh"
                    onClick={handleSavePlanDraft}
                  >
                    Salvar como Rascunho
                  </button>
                  <button
                    type="button"
                    className="op-primary"
                    onClick={handleTriggerApplyPlan}
                  >
                    Salvar e Aplicar...
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 2: CONFIRMAÇÃO DE IMPACTO E APLICAÇÃO EM LOTE */}
        {impactModalOpen && planToApply && (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(9, 7, 20, 0.82)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
            display: "grid", placeItems: "center", zIndex: 110, padding: "20px"
          }}>
            <div className="op-card" style={{width: "100%", maxWidth: "560px", padding: "28px", borderColor: "#ec4899"}}>
              <div style={{display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px"}}>
                <Zap size={22} color="#ec4899"/>
                <h3 style={{margin: 0, fontSize: "20px", fontWeight: 800}}>Confirmar Aplicação e Sincronização</h3>
              </div>

              <p style={{fontSize: "13px", color: "#c2bed4", marginTop: 0}}>
                Você está prestes a aplicar as novas definições do plano <strong>{planToApply.name}</strong>.
              </p>

              {/* Comparativo DE -> PARA */}
              <div style={{background: "rgba(255,255,255,0.03)", borderRadius: "10px", padding: "14px", marginBottom: "16px", border: "1px solid #3d344f"}}>
                <strong style={{fontSize: "13px", color: "white", display: "block", marginBottom: "8px"}}>
                  Resumo das Alterações (De ➔ Para):
                </strong>
                <div style={{display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px"}}>
                  <div style={{display: "flex", justifyContent: "space-between"}}>
                    <span style={{color: "#9ca3af"}}>Preço:</span>
                    <span>
                      <s style={{color: "#6b7280"}}>R$ {originalPlan?.price || "—"}</s> ➔ <strong style={{color: "white"}}>R$ {planToApply.price}</strong>
                    </span>
                  </div>
                  <div style={{display: "flex", justifyContent: "space-between"}}>
                    <span style={{color: "#9ca3af"}}>Franquia Mensal:</span>
                    <span>
                      <s style={{color: "#6b7280"}}>{originalPlan?.quotaLimit?.toLocaleString("pt-BR") || "—"} msgs</s> ➔ <strong style={{color: "#ec4899"}}>{planToApply.quotaLimit.toLocaleString("pt-BR")} msgs</strong>
                    </span>
                  </div>
                  <div style={{display: "flex", justifyContent: "space-between"}}>
                    <span style={{color: "#9ca3af"}}>Recursos Habilitados:</span>
                    <span><strong style={{color: "#00db8c"}}>{(planToApply.allowedFeatures || []).length} ativos</strong></span>
                  </div>
                </div>
              </div>

              {/* Lojas Elegíveis Afetadas */}
              <div style={{background: "rgba(236,72,153,0.06)", borderRadius: "10px", padding: "14px", marginBottom: "16px", border: "1px solid rgba(236,72,153,0.2)"}}>
                <strong style={{fontSize: "13px", color: "#ec4899", display: "block", marginBottom: "6px"}}>
                  Lojas Vinculadas Elegíveis ({enrolledStoresMap[planToApply.id]?.length || clientCountsMap[planToApply.id] || 0}):
                </strong>
                {(enrolledStoresMap[planToApply.id]?.length || 0) > 0 ? (
                  <div style={{maxHeight: "100px", overflowY: "auto", fontSize: "12px", color: "#d1d5db", display: "flex", flexDirection: "column", gap: "4px"}}>
                    {enrolledStoresMap[planToApply.id].map(s => (
                      <div key={s.id} style={{display: "flex", justifyContent: "space-between"}}>
                        <span>• {s.name}</span>
                        {s.customQuotaOverride && (
                          <span style={{color: "#f59e0b", fontSize: "11px"}}>
                            (Mantém exceção: {s.customQuotaOverride} msgs)
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <span style={{fontSize: "12px", color: "#9ca3af"}}>
                    Nenhuma loja cadastrada vinculada a este plano no momento. Novos clientes receberão as regras vigentes automaticamente.
                  </span>
                )}
              </div>

              {/* Escolha de Vigência */}
              <div style={{marginBottom: "20px"}}>
                <label style={{fontSize: "13px", color: "#e2e8f0", fontWeight: 700, display: "block", marginBottom: "8px"}}>
                  Vigência da Aplicação:
                </label>
                <div style={{display: "flex", flexDirection: "column", gap: "8px"}}>
                  <label style={{display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#d1d5db", cursor: "pointer"}}>
                    <input
                      type="radio"
                      name="vigencia"
                      value="immediate"
                      checked={vigencia === "immediate"}
                      onChange={() => setVigencia("immediate")}
                      style={{accentColor: "#ec4899"}}
                    />
                    <span><strong>Imediata:</strong> Sincronizar em todas as lojas vinculadas elegíveis agora mesmo.</span>
                  </label>

                  <label style={{display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#d1d5db", cursor: "pointer"}}>
                    <input
                      type="radio"
                      name="vigencia"
                      value="new_clients"
                      checked={vigencia === "new_clients"}
                      onChange={() => setVigencia("new_clients")}
                      style={{accentColor: "#ec4899"}}
                    />
                    <span><strong>Apenas Novos Clientes:</strong> Manter lojas existentes como estão.</span>
                  </label>

                  <label style={{display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#d1d5db", cursor: "pointer"}}>
                    <input
                      type="radio"
                      name="vigencia"
                      value="next_cycle"
                      checked={vigencia === "next_cycle"}
                      onChange={() => setVigencia("next_cycle")}
                      style={{accentColor: "#ec4899"}}
                    />
                    <span><strong>Na Próxima Renovação:</strong> Atualizar no próximo vencimento/ciclo.</span>
                  </label>
                </div>
              </div>

              <div style={{display: "flex", gap: "10px", justifyContent: "flex-end"}}>
                <button
                  type="button"
                  className="op-refresh"
                  onClick={() => setImpactModalOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="op-primary"
                  disabled={applyingPlan}
                  onClick={handleConfirmApplyPlan}
                >
                  {applyingPlan ? "Sincronizando..." : "Confirmar e Sincronizar em Lote"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 3: DUPLICAR PLANO */}
        {duplicateModalOpen && sourcePlanForDuplicate && (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(9, 7, 20, 0.82)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
            display: "grid", placeItems: "center", zIndex: 110, padding: "20px"
          }}>
            <div className="op-card" style={{width: "100%", maxWidth: "440px", padding: "26px", borderColor: "#ec4899"}}>
              <div style={{display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px"}}>
                <Copy size={20} color="#ec4899"/>
                <h3 style={{margin: 0, fontSize: "18px", fontWeight: 800}}>Duplicar Plano Comercial</h3>
              </div>
              <p style={{fontSize: "13px", color: "#c2bed4", marginTop: 0}}>
                Copiar a estrutura do plano <strong>{sourcePlanForDuplicate.name}</strong> para criar uma nova versão.
              </p>

              <div style={{display: "flex", flexDirection: "column", gap: "12px", marginBottom: "18px"}}>
                <div>
                  <label style={{fontSize: "12px", color: "#a599c2", display: "block", marginBottom: "4px"}}>Novo ID (slug único)</label>
                  <input
                    type="text"
                    value={duplicateNewId}
                    onChange={e => setDuplicateNewId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
                    style={{width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white", fontFamily: "monospace"}}
                  />
                </div>
                <div>
                  <label style={{fontSize: "12px", color: "#a599c2", display: "block", marginBottom: "4px"}}>Novo Nome Comercial</label>
                  <input
                    type="text"
                    value={duplicateNewName}
                    onChange={e => setDuplicateNewName(e.target.value)}
                    style={{width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white"}}
                  />
                </div>
              </div>

              <div style={{display: "flex", gap: "10px", justifyContent: "flex-end"}}>
                <button
                  type="button"
                  className="op-refresh"
                  onClick={() => setDuplicateModalOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="op-primary"
                  disabled={duplicating || !duplicateNewId.trim()}
                  onClick={handleConfirmDuplicate}
                >
                  {duplicating ? "Copiando..." : "Criar Cópia"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 4: VER LOJAS VINCULADAS */}
        {enrolledModalOpen && selectedPlanForStores && (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(9, 7, 20, 0.82)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
            display: "grid", placeItems: "center", zIndex: 110, padding: "20px"
          }}>
            <div className="op-card" style={{width: "100%", maxWidth: "520px", padding: "26px", borderColor: "#ec4899"}}>
              <div style={{display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px"}}>
                <Building2 size={20} color="#ec4899"/>
                <h3 style={{margin: 0, fontSize: "18px", fontWeight: 800}}>
                  Lojas Vinculadas ao {selectedPlanForStores.name}
                </h3>
              </div>

              <div style={{maxHeight: "340px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px", marginBottom: "18px"}}>
                {((enrolledStoresMap[selectedPlanForStores.id]) || []).length === 0 ? (
                  <p style={{fontSize: "13px", color: "#9ca3af", textAlign: "center", padding: "20px 0"}}>
                    Nenhuma loja cadastrada vinculada a este plano no momento.
                  </p>
                ) : (
                  enrolledStoresMap[selectedPlanForStores.id].map(st => (
                    <div
                      key={st.id}
                      style={{
                        padding: "10px 14px",
                        background: "rgba(255,255,255,0.03)",
                        borderRadius: "8px",
                        border: "1px solid #332b49",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center"
                      }}
                    >
                      <div>
                        <strong style={{color: "white", display: "block", fontSize: "14px"}}>{st.name}</strong>
                        {st.customQuotaOverride && (
                          <small style={{color: "#f59e0b", fontSize: "11px"}}>
                            ⚠️ Exceção: {st.customQuotaOverride} msgs ({st.exceptionReason || "Customizado"})
                          </small>
                        )}
                      </div>
                      <span style={{fontSize: "12px", color: "#a599c2"}}>
                        {st.customQuotaOverride || selectedPlanForStores.quotaLimit} msgs/mês
                      </span>
                    </div>
                  ))
                )}
              </div>

              <div style={{display: "flex", justifyContent: "flex-end"}}>
                <button
                  type="button"
                  className="op-primary"
                  onClick={() => setEnrolledModalOpen(false)}
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 5: HISTÓRICO DE AUDITORIA */}
        {historyModalOpen && (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(9, 7, 20, 0.82)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
            display: "grid", placeItems: "center", zIndex: 110, padding: "20px"
          }}>
            <div className="op-card" style={{
              width: "100%", maxWidth: "660px", maxHeight: "85vh", overflowY: "auto",
              padding: "26px", borderColor: "#ec4899"
            }}>
              <div style={{display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px"}}>
                <History size={22} color="#ec4899"/>
                <h3 style={{margin: 0, fontSize: "20px", fontWeight: 800}}>Histórico de Alterações de Planos</h3>
              </div>

              {loadingHistory ? (
                <p style={{textAlign: "center", color: "#9ca3af", padding: "30px 0"}}>Carregando histórico...</p>
              ) : auditLogs.length === 0 ? (
                <p style={{textAlign: "center", color: "#9ca3af", padding: "30px 0"}}>Nenhuma alteração registrada ainda.</p>
              ) : (
                <div style={{display: "flex", flexDirection: "column", gap: "10px", marginBottom: "18px"}}>
                  {auditLogs.map(entry => (
                    <div
                      key={entry.id}
                      style={{
                        padding: "12px 16px",
                        background: "rgba(255,255,255,0.03)",
                        borderRadius: "10px",
                        border: "1px solid #332b49"
                      }}
                    >
                      <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px"}}>
                        <strong style={{color: "white", fontSize: "14px"}}>{entry.planName || entry.planId}</strong>
                        <span style={{fontSize: "11px", color: "#8e87a2"}}>
                          {new Date(entry.timestamp).toLocaleString("pt-BR")}
                        </span>
                      </div>
                      <div style={{fontSize: "12px", color: "#ec4899", fontWeight: 600}}>
                        Ação: {entry.action} {entry.vigencia ? `• Vigência: ${entry.vigencia}` : ""}
                        {entry.impactedCount ? ` • ${entry.impactedCount} loja(s) impactada(s)` : ""}
                      </div>
                      {entry.diffSummary && (
                        <p style={{margin: "4px 0 0", fontSize: "12px", color: "#d1d5db"}}>{entry.diffSummary}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div style={{display: "flex", justifyContent: "flex-end"}}>
                <button
                  type="button"
                  className="op-primary"
                  onClick={() => setHistoryModalOpen(false)}
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 6: ALTERAR PLANO DA LOJA (COM SUPORTE A EXCEÇÃO CONTRATUAL) */}
        {changePlanModalOpen && selectedClientForPlan && (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(9, 7, 20, 0.82)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
            display: "grid", placeItems: "center", zIndex: 100, padding: "20px"
          }}>
            <div className="op-card" style={{width: "100%", maxWidth: "480px", padding: "28px", borderColor: "#ec4899"}}>
              <div style={{display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px"}}>
                <CreditCard size={22} color="#ec4899"/>
                <h3 style={{margin: 0, fontSize: "18px"}}>Alterar Plano da Loja</h3>
              </div>
              <p style={{fontSize: "13px", color: "#c2bed4", marginTop: 0}}>
                Selecione o novo plano comercial para a loja <strong>{selectedClientForPlan.name}</strong>:
              </p>

              <div style={{display: "flex", flexDirection: "column", gap: "10px", marginBottom: "16px"}}>
                {plans.map(p => (
                  <div
                    key={p.id}
                    onClick={() => {
                      setTargetPlanToAssign(p);
                      if (!customQuotaChecked) setCustomQuotaValue(p.quotaLimit);
                    }}
                    style={{
                      padding: "12px 16px",
                      borderRadius: "10px",
                      border: "1px solid",
                      borderColor: targetPlanToAssign.id === p.id ? "#ec4899" : "#3d344f",
                      background: targetPlanToAssign.id === p.id ? "rgba(236, 72, 153, 0.15)" : "#161325",
                      cursor: "pointer",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center"
                    }}
                  >
                    <div>
                      <strong style={{color: "white", display: "block"}}>{p.name}</strong>
                      <small style={{color: "#9ca3af"}}>{p.quotaLimit.toLocaleString("pt-BR")} mensagens IA/mês</small>
                    </div>
                    <strong style={{color: "#ec4899"}}>R$ {p.price}/mês</strong>
                  </div>
                ))}
              </div>

              {/* Exceção Contratual Individual */}
              <div style={{
                background: "rgba(255,255,255,0.03)",
                borderRadius: "10px",
                padding: "14px",
                marginBottom: "20px",
                border: "1px solid #3d344f"
              }}>
                <label style={{display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "white", cursor: "pointer", fontWeight: 700}}>
                  <input
                    type="checkbox"
                    checked={customQuotaChecked}
                    onChange={e => {
                      setCustomQuotaChecked(e.target.checked);
                      if (e.target.checked && !customQuotaValue) {
                        setCustomQuotaValue(targetPlanToAssign.quotaLimit);
                      }
                    }}
                    style={{width: "16px", height: "16px", accentColor: "#ec4899"}}
                  />
                  <span>Exceção Contratual Individual</span>
                </label>
                <small style={{color: "#8e87a2", fontSize: "11px", display: "block", marginTop: "2px", marginBottom: "8px"}}>
                  Define uma franquia mensal exclusiva para esta loja. Não será sobrescrita por atualizações gerais do plano.
                </small>

                {customQuotaChecked && (
                  <div style={{display: "flex", flexDirection: "column", gap: "8px", marginTop: "10px"}}>
                    <div>
                      <label style={{fontSize: "11px", color: "#a599c2", display: "block", marginBottom: "2px"}}>Franquia Customizada (Msgs/mês)</label>
                      <input
                        type="number"
                        value={customQuotaValue}
                        onChange={e => setCustomQuotaValue(Number(e.target.value))}
                        style={{width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #443c5e", background: "#121222", color: "white"}}
                      />
                    </div>
                    <div>
                      <label style={{fontSize: "11px", color: "#a599c2", display: "block", marginBottom: "2px"}}>Motivo da Exceção</label>
                      <input
                        type="text"
                        placeholder="Ex: Acordo anual VIP com franquia ampliada"
                        value={customQuotaReason}
                        onChange={e => setCustomQuotaReason(e.target.value)}
                        style={{width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #443c5e", background: "#121222", color: "white"}}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div style={{display: "flex", gap: "10px", justifyContent: "flex-end"}}>
                <button
                  type="button"
                  className="op-refresh"
                  onClick={() => setChangePlanModalOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="op-primary"
                  disabled={assigningPlan}
                  onClick={handleAssignPlan}
                >
                  {assigningPlan ? "Salvando..." : "Confirmar Alteração"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 7: REDEFINIR SENHA DO CLIENTE */}
        {resetModalOpen && (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(9, 7, 20, 0.82)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
            display: "grid", placeItems: "center", zIndex: 100, padding: "20px"
          }}>
            <div className="op-card" style={{width: "100%", maxWidth: "420px", padding: "28px", borderColor: "#ec4899"}}>
              <div style={{display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px"}}>
                <KeyRound size={22} color="#ec4899"/>
                <h3 style={{margin: 0, fontSize: "18px"}}>Redefinir Senha do Cliente</h3>
              </div>
              <p style={{fontSize: "13px", color: "#c2bed4", marginTop: 0}}>
                Defina uma nova senha para o acesso da loja <strong>{resetStoreName}</strong>.
              </p>
              <form onSubmit={handleResetPassword} style={{display: "flex", flexDirection: "column", gap: "14px"}}>
                <input
                  type="password"
                  placeholder="Nova senha (mínimo 6 caracteres)"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  minLength={6}
                  required
                  style={{width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white"}}
                />
                <div style={{display: "flex", gap: "10px", justifyContent: "flex-end"}}>
                  <button
                    type="button"
                    className="op-refresh"
                    onClick={() => setResetModalOpen(false)}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="op-primary"
                    disabled={resetting || newPassword.length < 6}
                  >
                    {resetting ? "Gravando..." : "Salvar Nova Senha"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        {/* MODAL 8: SUSPENSÃO ADMINISTRATIVA / DESBLOQUEIO COM MOTIVO PÚBLICO E NOTA INTERNA */}
        {blockModalOpen && clientToBlock && (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(9, 7, 20, 0.82)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
            display: "grid", placeItems: "center", zIndex: 120, padding: "20px"
          }}>
            <div className="op-card" style={{width: "100%", maxWidth: "480px", padding: "28px", borderColor: clientToBlock.status === "suspended" ? "#00db8c" : "#f43f5e"}}>
              <div style={{display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px"}}>
                {clientToBlock.status === "suspended" ? (
                  <RotateCcw size={22} color="#00db8c"/>
                ) : (
                  <Ban size={22} color="#f43f5e"/>
                )}
                <h3 style={{margin: 0, fontSize: "19px", fontWeight: 800}}>
                  {clientToBlock.status === "suspended"
                    ? `Desbloquear Loja: ${clientToBlock.name}`
                    : `Suspender Administrativamente: ${clientToBlock.name}`}
                </h3>
              </div>

              <p style={{fontSize: "13px", color: "#c2bed4", marginTop: 0}}>
                {clientToBlock.status === "suspended"
                  ? "Ao confirmar o desbloqueio, os recursos do plano contratado e o atendimento da IA voltarão a operar imediatamente."
                  : "A suspensão administrativa pausa o atendimento automático da IA e exibe o motivo público no painel do cliente. O histórico e os dados permanecem 100% preservados."}
              </p>

              {clientToBlock.status !== "suspended" && (
                <div style={{display: "flex", flexDirection: "column", gap: "12px", marginBottom: "18px"}}>
                  <div>
                    <label style={{fontSize: "12px", color: "#fda4af", fontWeight: 700, display: "block", marginBottom: "4px"}}>
                      Motivo Público (exibido ao cliente no painel)
                    </label>
                    <input
                      type="text"
                      value={blockPublicReason}
                      onChange={e => setBlockPublicReason(e.target.value)}
                      placeholder="Ex: Mensalidade em aberto. Entre em contato com o financeiro NovaesWeb."
                      style={{width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid rgba(244, 63, 94, 0.45)", background: "#121222", color: "white", fontSize: "13px"}}
                    />
                  </div>
                  <div>
                    <label style={{fontSize: "12px", color: "#fbbf24", fontWeight: 700, display: "block", marginBottom: "4px"}}>
                      Observação Interna Master (visível somente para a NovaesWeb)
                    </label>
                    <textarea
                      rows={3}
                      value={blockInternalNote}
                      onChange={e => setBlockInternalNote(e.target.value)}
                      placeholder="Ex: Aguardando compensação de boleto / combinado retorno na segunda-feira."
                      style={{width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white", fontSize: "13px"}}
                    />
                  </div>
                </div>
              )}

              <div style={{display: "flex", gap: "10px", justifyContent: "flex-end"}}>
                <button
                  type="button"
                  className="op-refresh"
                  onClick={() => {
                    setBlockModalOpen(false);
                    setClientToBlock(null);
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="op-primary"
                  disabled={togglingBlock}
                  onClick={handleConfirmToggleBlock}
                  style={{
                    background: clientToBlock.status === "suspended" ? "#00db8c" : "#f43f5e",
                    color: clientToBlock.status === "suspended" ? "#052e16" : "#fff",
                    fontWeight: 800
                  }}
                >
                  {togglingBlock
                    ? "Processando..."
                    : clientToBlock.status === "suspended"
                      ? "Confirmar Desbloqueio"
                      : "Confirmar Suspensão"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL FICHA FINANCEIRA DO CLIENTE */}
        {financeModalClient && (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(9, 7, 20, 0.85)", backdropFilter: "blur(12px)",
            display: "grid", placeItems: "center", zIndex: 125, padding: "20px"
          }}>
            <div className="op-card" style={{
              width: "100%", maxWidth: "680px", maxHeight: "90vh", overflowY: "auto", padding: "28px",
              borderColor: "#ec4899", borderRadius: "20px", boxShadow: "0 25px 60px rgba(0,0,0,0.75)"
            }}>
              <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px"}}>
                <div style={{display: "flex", alignItems: "center", gap: "10px"}}>
                  <div style={{width: "40px", height: "40px", borderRadius: "10px", background: "rgba(236,72,153,0.15)", display: "grid", placeItems: "center"}}>
                    <DollarSign size={20} color="#ec4899"/>
                  </div>
                  <div>
                    <h3 style={{margin: 0, fontSize: "18px", fontWeight: 800, color: "#fff"}}>
                      Ficha Financeira: {financeModalClient.name}
                    </h3>
                    <span style={{fontSize: "12px", color: "#a1a1aa"}}>
                      Responsável: {financeModalClient.businessDetails?.ownerName || financeModalClient.ownerName || "Não informado"}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setFinanceModalClient(null)}
                  style={{background: "none", border: "none", color: "#94a3b8", cursor: "pointer"}}
                >
                  <X size={20}/>
                </button>
              </div>

              {/* Bento Grid da Situação Atual */}
              <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", marginBottom: "18px"}}>
                <div style={{padding: "12px", borderRadius: "10px", background: "#18142a", border: "1px solid #2d264a"}}>
                  <span style={{fontSize: "11px", color: "#9ca3af", textTransform: "uppercase"}}>Plano Atual</span>
                  <strong style={{display: "block", fontSize: "16px", color: "#fff", marginTop: "2px"}}>{financeModalClient.plan.name}</strong>
                  <small style={{color: "#ec4899"}}>R$ {financeModalClient.plan.price}/mês</small>
                </div>
                <div style={{padding: "12px", borderRadius: "10px", background: "#18142a", border: "1px solid #2d264a"}}>
                  <span style={{fontSize: "11px", color: "#9ca3af", textTransform: "uppercase"}}>Situação</span>
                  <strong style={{
                    display: "block", fontSize: "16px", marginTop: "2px",
                    color: financeModalClient.plan.status === "paid" ? "#00db8c" : (financeModalClient.plan.isOverdue ? "#f43f5e" : "#fcd34d")
                  }}>
                    {financeModalClient.plan.status === "paid" ? "🟢 Em Dia" : (financeModalClient.plan.isOverdue ? "🔴 Em Atraso" : "🟡 Pendente")}
                  </strong>
                  <small style={{color: "#9ca3af"}}>Vencimento: {financeModalClient.plan.dueDate || "—"}</small>
                </div>
                <div style={{padding: "12px", borderRadius: "10px", background: "#18142a", border: "1px solid #2d264a"}}>
                  <span style={{fontSize: "11px", color: "#9ca3af", textTransform: "uppercase"}}>WhatsApp Comercial</span>
                  <strong style={{display: "block", fontSize: "14px", color: "#fff", marginTop: "2px"}}>
                    {financeModalClient.businessDetails?.businessWhatsapp || "Não informado"}
                  </strong>
                  <small style={{color: "#9ca3af"}}>{financeModalClient.businessDetails?.document || "Sem CNPJ/CPF"}</small>
                </div>
              </div>

              {/* Ações Administrativas Rápidas */}
              <div style={{display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "20px"}}>
                {financeModalClient.plan.status === "paid" ? (
                  <button
                    type="button"
                    className="op-refresh"
                    onClick={async () => {
                      await handleSetPaymentStatus(financeModalClient, "pending");
                      setFinanceModalClient(null);
                    }}
                    style={{fontSize: "12px", padding: "8px 12px", color: "#f59e0b"}}
                  >
                    Marcar como Pendente
                  </button>
                ) : (
                  <button
                    type="button"
                    className="op-primary"
                    onClick={async () => {
                      await handleSetPaymentStatus(financeModalClient, "paid");
                      setFinanceModalClient(null);
                    }}
                    style={{fontSize: "12px", padding: "8px 12px", background: "#00db8c", color: "#000"}}
                  >
                    Confirmar Pagamento Recebido
                  </button>
                )}

                <button
                  type="button"
                  className="op-refresh"
                  onClick={() => {
                    setExtensionNewDueDate(financeModalClient.plan.dueDate || "");
                    setExtensionGraceDays(3);
                    setExtensionReason("Acordo comercial");
                    setExtensionModalOpen(true);
                  }}
                  style={{fontSize: "12px", padding: "8px 12px"}}
                >
                  Conceder Prazo Adicional
                </button>

                <button
                  type="button"
                  className="op-refresh"
                  onClick={() => {
                    setDiscountNewPrice(financeModalClient.plan.price || "");
                    setDiscountReason("Desconto de fidelidade");
                    setDiscountModalOpen(true);
                  }}
                  style={{fontSize: "12px", padding: "8px 12px"}}
                >
                  Aplicar Desconto
                </button>

                <button
                  type="button"
                  className="op-refresh"
                  onClick={() => {
                    const name = financeModalClient.businessDetails?.ownerName || financeModalClient.name;
                    const phone = (financeModalClient.businessDetails?.businessWhatsapp || "").replace(/\D/g, "");
                    const msg = `Olá, ${name}! Tudo bem?\nSua mensalidade da NovaesWeb CRM AI referente à empresa ${financeModalClient.name} (R$ ${financeModalClient.plan.price}) venceu ou está com pendência.\nSe precisar, podemos encaminhar a chave PIX para pagamento: ${pixConfig.pixKey} (${pixConfig.beneficiaryName}).\nQualquer dúvida, estamos à disposição!`;
                    if (phone) window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(msg)}`, "_blank");
                    else alert("WhatsApp comercial não informado no cadastro desta empresa.");
                  }}
                  style={{fontSize: "12px", padding: "8px 12px", color: "#22c55e", borderColor: "rgba(34,197,94,0.4)"}}
                >
                  Cobrar no WhatsApp
                </button>
              </div>

              {/* Histórico de Pagamentos Confirmados */}
              <div>
                <h4 style={{fontSize: "14px", fontWeight: 700, margin: "0 0 8px", color: "#fff"}}>Histórico de Pagamentos</h4>
                {(financeModalClient.paymentHistory || []).length === 0 ? (
                  <p style={{fontSize: "12px", color: "#71717a", margin: 0}}>Nenhum pagamento registrado no histórico desta loja.</p>
                ) : (
                  <div style={{display: "flex", flexDirection: "column", gap: "6px"}}>
                    {(financeModalClient.paymentHistory || []).map((p, idx) => (
                      <div key={idx} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "8px 12px", borderRadius: "8px", background: "rgba(255,255,255,0.03)", fontSize: "12px"
                      }}>
                        <div>
                          <strong style={{color: "#00db8c"}}>R$ {String(p.amount || "0,00")}</strong>
                          <span style={{color: "#9ca3af", marginLeft: "10px"}}>Vencimento: {String(p.dueDate || "—")}</span>
                        </div>
                        <span style={{color: "#71717a"}}>
                          Pago em: {p.paidAt ? new Date(String(p.paidAt)).toLocaleDateString("pt-BR") : "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* MODAL CONCEDER PRAZO ADICIONAL */}
        {extensionModalOpen && financeModalClient && (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(9, 7, 20, 0.85)", backdropFilter: "blur(12px)",
            display: "grid", placeItems: "center", zIndex: 135, padding: "20px"
          }}>
            <div className="op-card" style={{width: "100%", maxWidth: "460px", padding: "24px", borderRadius: "16px"}}>
              <h3 style={{margin: "0 0 12px", fontSize: "16px", fontWeight: 800, color: "#fff"}}>
                Conceder Prazo Adicional: {financeModalClient.name}
              </h3>
              <p style={{fontSize: "12px", color: "#9ca3af", marginBottom: "16px"}}>
                Altere a data de vencimento ou defina dias de carência sem suspender o atendimento do cliente. A operação será registrada na auditoria.
              </p>
              <div style={{display: "flex", flexDirection: "column", gap: "12px"}}>
                <div>
                  <label style={{fontSize: "12px", color: "#9ca3af", display: "block", marginBottom: "4px"}}>Nova Data de Vencimento</label>
                  <input
                    type="date"
                    value={extensionNewDueDate}
                    onChange={e => setExtensionNewDueDate(e.target.value)}
                    style={{width: "100%", padding: "10px", borderRadius: "8px", background: "#121222", border: "1px solid #443c5e", color: "#fff"}}
                  />
                </div>
                <div>
                  <label style={{fontSize: "12px", color: "#9ca3af", display: "block", marginBottom: "4px"}}>Dias de Carência (Grace Period)</label>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={extensionGraceDays}
                    onChange={e => setExtensionGraceDays(Number(e.target.value))}
                    style={{width: "100%", padding: "10px", borderRadius: "8px", background: "#121222", border: "1px solid #443c5e", color: "#fff"}}
                  />
                </div>
                <div>
                  <label style={{fontSize: "12px", color: "#9ca3af", display: "block", marginBottom: "4px"}}>Motivo da Concessão</label>
                  <input
                    type="text"
                    value={extensionReason}
                    onChange={e => setExtensionReason(e.target.value)}
                    placeholder="Ex: Cliente solicitou 5 dias a mais para faturar"
                    style={{width: "100%", padding: "10px", borderRadius: "8px", background: "#121222", border: "1px solid #443c5e", color: "#fff"}}
                  />
                </div>
              </div>

              <div style={{display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "20px"}}>
                <button
                  type="button"
                  className="op-refresh"
                  onClick={() => setExtensionModalOpen(false)}
                  style={{padding: "8px 14px", borderRadius: "8px"}}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={savingExtension}
                  className="op-primary"
                  onClick={async () => {
                    setSavingExtension(true);
                    try {
                      const res = await fetch("/api/crm/admin/clients", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          tenantId: financeModalClient.id,
                          action: "extend_due_date",
                          newDueDate: extensionNewDueDate,
                          graceDays: extensionGraceDays,
                          reason: extensionReason
                        })
                      });
                      if (res.ok) {
                        setNotice(`Prazo adicional concedido para ${financeModalClient.name}!`);
                        setExtensionModalOpen(false);
                        setFinanceModalClient(null);
                        await fetchClients();
                      } else {
                        setError("Falha ao conceder prazo adicional.");
                      }
                    } finally {
                      setSavingExtension(false);
                    }
                  }}
                  style={{padding: "8px 16px", borderRadius: "8px", fontWeight: 700}}
                >
                  {savingExtension ? "Salvando..." : "Confirmar Prazo"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL APLICAR DESCONTO */}
        {discountModalOpen && financeModalClient && (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(9, 7, 20, 0.85)", backdropFilter: "blur(12px)",
            display: "grid", placeItems: "center", zIndex: 135, padding: "20px"
          }}>
            <div className="op-card" style={{width: "100%", maxWidth: "440px", padding: "24px", borderRadius: "16px"}}>
              <h3 style={{margin: "0 0 12px", fontSize: "16px", fontWeight: 800, color: "#fff"}}>
                Aplicar Desconto: {financeModalClient.name}
              </h3>
              <p style={{fontSize: "12px", color: "#9ca3af", marginBottom: "16px"}}>
                Altere o valor da mensalidade contratada do cliente. A alteração afeta o MRR real e é auditada.
              </p>
              <div style={{display: "flex", flexDirection: "column", gap: "12px"}}>
                <div>
                  <label style={{fontSize: "12px", color: "#9ca3af", display: "block", marginBottom: "4px"}}>Novo Valor da Mensalidade (R$)</label>
                  <input
                    type="text"
                    value={discountNewPrice}
                    onChange={e => setDiscountNewPrice(e.target.value)}
                    placeholder="Ex: 119,90"
                    style={{width: "100%", padding: "10px", borderRadius: "8px", background: "#121222", border: "1px solid #443c5e", color: "#fff"}}
                  />
                </div>
                <div>
                  <label style={{fontSize: "12px", color: "#9ca3af", display: "block", marginBottom: "4px"}}>Justificativa do Desconto</label>
                  <input
                    type="text"
                    value={discountReason}
                    onChange={e => setDiscountReason(e.target.value)}
                    placeholder="Ex: Parceria anual, cupom promocional"
                    style={{width: "100%", padding: "10px", borderRadius: "8px", background: "#121222", border: "1px solid #443c5e", color: "#fff"}}
                  />
                </div>
              </div>

              <div style={{display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "20px"}}>
                <button
                  type="button"
                  className="op-refresh"
                  onClick={() => setDiscountModalOpen(false)}
                  style={{padding: "8px 14px", borderRadius: "8px"}}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={savingDiscount || !discountNewPrice}
                  className="op-primary"
                  onClick={async () => {
                    setSavingDiscount(true);
                    try {
                      const res = await fetch("/api/crm/admin/clients", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          tenantId: financeModalClient.id,
                          action: "apply_discount",
                          discountPrice: discountNewPrice,
                          reason: discountReason
                        })
                      });
                      if (res.ok) {
                        setNotice(`Desconto aplicado para ${financeModalClient.name}!`);
                        setDiscountModalOpen(false);
                        setFinanceModalClient(null);
                        await fetchClients();
                      } else {
                        setError("Falha ao aplicar desconto.");
                      }
                    } finally {
                      setSavingDiscount(false);
                    }
                  }}
                  style={{padding: "8px 16px", borderRadius: "8px", fontWeight: 700}}
                >
                  {savingDiscount ? "Salvando..." : "Aplicar Desconto"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL NOVA DESPESA OPERACIONAL */}
        {expenseModalOpen && (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(9, 7, 20, 0.85)", backdropFilter: "blur(12px)",
            display: "grid", placeItems: "center", zIndex: 130, padding: "20px"
          }}>
            <div className="op-card" style={{width: "100%", maxWidth: "480px", padding: "26px", borderRadius: "18px"}}>
              <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px"}}>
                <h3 style={{margin: 0, fontSize: "16px", fontWeight: 800, color: "#fff"}}>
                  Cadastrar Despesa Operacional
                </h3>
                <button type="button" onClick={() => setExpenseModalOpen(false)} style={{background: "none", border: "none", color: "#9ca3af", cursor: "pointer"}}>
                  <X size={18}/>
                </button>
              </div>

              <div style={{display: "flex", flexDirection: "column", gap: "12px"}}>
                <div>
                  <label style={{fontSize: "12px", color: "#9ca3af", display: "block", marginBottom: "4px"}}>Descrição da Despesa</label>
                  <input
                    type="text"
                    value={newExpDesc}
                    onChange={e => setNewExpDesc(e.target.value)}
                    placeholder="Ex: API OpenAI / Anthropic, Servidor VPS, etc."
                    style={{width: "100%", padding: "10px", borderRadius: "8px", background: "#121222", border: "1px solid #443c5e", color: "#fff"}}
                  />
                </div>

                <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px"}}>
                  <div>
                    <label style={{fontSize: "12px", color: "#9ca3af", display: "block", marginBottom: "4px"}}>Categoria</label>
                    <select
                      value={newExpCat}
                      onChange={e => setNewExpCat(e.target.value as OperationalExpense["category"])}
                      style={{width: "100%", padding: "10px", borderRadius: "8px", background: "#121222", border: "1px solid #443c5e", color: "#fff"}}
                    >
                      <option value="ai">Provedores de IA</option>
                      <option value="servers">Servidores / VPS</option>
                      <option value="database">Banco de Dados</option>
                      <option value="whatsapp">Serviços WhatsApp</option>
                      <option value="apis">APIs Externas</option>
                      <option value="domains">Domínios</option>
                      <option value="marketing">Marketing</option>
                      <option value="taxes">Impostos</option>
                      <option value="tools">Ferramentas</option>
                      <option value="other">Outros</option>
                    </select>
                  </div>
                  <div>
                    <label style={{fontSize: "12px", color: "#9ca3af", display: "block", marginBottom: "4px"}}>Valor (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={newExpAmount}
                      onChange={e => setNewExpAmount(e.target.value)}
                      placeholder="Ex: 250.00"
                      style={{width: "100%", padding: "10px", borderRadius: "8px", background: "#121222", border: "1px solid #443c5e", color: "#fff"}}
                    />
                  </div>
                </div>

                <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px"}}>
                  <div>
                    <label style={{fontSize: "12px", color: "#9ca3af", display: "block", marginBottom: "4px"}}>Vencimento</label>
                    <input
                      type="date"
                      value={newExpDueDate}
                      onChange={e => setNewExpDueDate(e.target.value)}
                      style={{width: "100%", padding: "10px", borderRadius: "8px", background: "#121222", border: "1px solid #443c5e", color: "#fff"}}
                    />
                  </div>
                  <div>
                    <label style={{fontSize: "12px", color: "#9ca3af", display: "block", marginBottom: "4px"}}>Fornecedor (Opcional)</label>
                    <input
                      type="text"
                      value={newExpSupplier}
                      onChange={e => setNewExpSupplier(e.target.value)}
                      placeholder="Ex: Hetzner, Vercel"
                      style={{width: "100%", padding: "10px", borderRadius: "8px", background: "#121222", border: "1px solid #443c5e", color: "#fff"}}
                    />
                  </div>
                </div>

                <div style={{display: "flex", alignItems: "center", gap: "8px", marginTop: "4px"}}>
                  <input
                    type="checkbox"
                    id="exp_paid"
                    checked={newExpPaid}
                    onChange={e => setNewExpPaid(e.target.checked)}
                  />
                  <label htmlFor="exp_paid" style={{fontSize: "12px", color: "#c4bed6", cursor: "pointer"}}>
                    Despesa já está paga
                  </label>
                </div>
              </div>

              <div style={{display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "20px"}}>
                <button
                  type="button"
                  className="op-refresh"
                  onClick={() => setExpenseModalOpen(false)}
                  style={{padding: "8px 14px", borderRadius: "8px"}}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={savingExpense || !newExpDesc || !newExpAmount}
                  className="op-primary"
                  onClick={async () => {
                    setSavingExpense(true);
                    try {
                      const res = await fetch("/api/crm/admin/finance", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          action: "add_expense",
                          description: newExpDesc,
                          category: newExpCat,
                          amount: Number(newExpAmount),
                          dueDate: newExpDueDate || new Date().toISOString().slice(0, 10),
                          status: newExpPaid ? "paid" : "pending",
                          supplier: newExpSupplier
                        })
                      });
                      if (res.ok) {
                        setNotice("Despesa cadastrada com sucesso!");
                        setExpenseModalOpen(false);
                        setNewExpDesc("");
                        setNewExpAmount("");
                        setNewExpSupplier("");
                        await fetchFinanceSettings();
                      } else {
                        setError("Falha ao salvar despesa.");
                      }
                    } finally {
                      setSavingExpense(false);
                    }
                  }}
                  style={{padding: "8px 16px", borderRadius: "8px", fontWeight: 700}}
                >
                  {savingExpense ? "Salvando..." : "Salvar Despesa"}
                </button>
              </div>
            </div>
          </div>
        )}
        {securityModalOpen && (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(9, 7, 20, 0.82)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
            display: "grid", placeItems: "center", zIndex: 120, padding: "20px"
          }}>
            <div className="op-card" style={{
              width: "100%", maxWidth: "480px", padding: "28px",
              borderColor: "#ec4899", borderRadius: "20px",
              boxShadow: "0 20px 50px rgba(0, 0, 0, 0.7)"
            }}>
              <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px"}}>
                <div style={{display: "flex", alignItems: "center", gap: "10px"}}>
                  <div style={{width: "36px", height: "36px", borderRadius: "10px", background: "rgba(236,72,153,0.15)", display: "grid", placeItems: "center"}}>
                    <KeyRound size={20} color="#ec4899"/>
                  </div>
                  <div>
                    <h3 style={{margin: 0, fontSize: "18px", fontWeight: 800, color: "#fff"}}>
                      {masterSecurityStep === 1 ? "WhatsApp de Recuperação Master" : "Confirmar Código de Segurança"}
                    </h3>
                    <span style={{fontSize: "12px", color: "#c4bed6"}}>
                      {masterSecurityStep === 1 ? "Passo 1 de 2: Informe o número" : "Passo 2 de 2: Validação por OTP"}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSecurityModalOpen(false)}
                  style={{background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: "4px"}}
                >
                  <X size={20} />
                </button>
              </div>

              {masterSecurityMsg && (
                <div style={{
                  padding: "10px 14px", borderRadius: "8px",
                  background: "rgba(16, 185, 129, 0.15)", border: "1px solid rgba(16, 185, 129, 0.4)",
                  color: "#34d399", fontSize: "12px", marginBottom: "14px"
                }}>
                  {masterSecurityMsg}
                </div>
              )}

              {masterSecurityErr && (
                <div style={{
                  padding: "10px 14px", borderRadius: "8px",
                  background: "rgba(244, 63, 94, 0.15)", border: "1px solid rgba(244, 63, 94, 0.4)",
                  color: "#f87171", fontSize: "12px", marginBottom: "14px"
                }}>
                  {masterSecurityErr}
                </div>
              )}

              {masterSecurityStep === 1 ? (
                <form onSubmit={handleRequestMasterPhoneChange} style={{display: "flex", flexDirection: "column", gap: "14px"}}>
                  <p style={{margin: 0, fontSize: "13px", color: "#c4bed6", lineHeight: "1.5"}}>
                    Digite o número de WhatsApp com DDD para vincular à conta Master. Um código de 6 dígitos será enviado instantaneamente para comprovar a posse do aparelho.
                  </p>
                  <div>
                    <label style={{fontSize: "12px", color: "#aba8bf", display: "block", marginBottom: "6px", fontWeight: 700}}>
                      Número de WhatsApp (com DDD)
                    </label>
                    <input
                      type="tel"
                      required
                      value={newMasterPhoneInput}
                      onChange={e => setNewMasterPhoneInput(e.target.value)}
                      placeholder="(51) 99118-9293"
                      style={{
                        width: "100%", padding: "12px", borderRadius: "10px",
                        background: "#1c182c", border: "1px solid #4a3c68",
                        color: "#fff", fontSize: "15px", letterSpacing: "0.5px"
                      }}
                    />
                  </div>

                  <div style={{display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "8px"}}>
                    <button
                      type="button"
                      className="op-refresh"
                      onClick={() => setSecurityModalOpen(false)}
                      style={{padding: "10px 16px", borderRadius: "10px"}}
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={masterSecurityLoading || !newMasterPhoneInput.trim()}
                      className="op-primary"
                      style={{
                        padding: "10px 20px", borderRadius: "10px", fontWeight: 800,
                        background: "linear-gradient(135deg, #a855f7, #ec4899)",
                        color: "#fff", display: "flex", alignItems: "center", gap: "8px"
                      }}
                    >
                      {masterSecurityLoading ? (
                        <>
                          <RefreshCw size={15} className="animate-spin" />
                          <span>Enviando código...</span>
                        </>
                      ) : (
                        <>
                          <span>Receber Código no WhatsApp</span>
                          <ChevronRight size={16} />
                        </>
                      )}
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleConfirmMasterPhoneCode} style={{display: "flex", flexDirection: "column", gap: "14px"}}>
                  <p style={{margin: 0, fontSize: "13px", color: "#c4bed6", lineHeight: "1.5"}}>
                    Insira o código de 6 dígitos que enviamos no WhatsApp <strong>{newMasterPhoneInput}</strong> para concluir a vinculação.
                  </p>
                  <div>
                    <label style={{fontSize: "12px", color: "#aba8bf", display: "block", marginBottom: "6px", fontWeight: 700}}>
                      Código de 6 dígitos
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      required
                      autoFocus
                      value={masterVerificationCode}
                      onChange={e => setMasterVerificationCode(e.target.value.replace(/\D/g, ""))}
                      placeholder="123456"
                      style={{
                        width: "100%", padding: "14px", borderRadius: "10px",
                        background: "#120e24", border: "1px solid #a855f7",
                        color: "#fff", fontSize: "24px", letterSpacing: "8px",
                        textAlign: "center", fontWeight: 800
                      }}
                    />
                  </div>

                  <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "8px"}}>
                    <button
                      type="button"
                      onClick={() => {
                        setMasterSecurityStep(1);
                        setMasterVerificationCode("");
                      }}
                      style={{background: "none", border: "none", color: "#a855f7", fontSize: "12px", cursor: "pointer", textDecoration: "underline"}}
                    >
                      Voltar e trocar número
                    </button>

                    <div style={{display: "flex", gap: "10px"}}>
                      <button
                        type="button"
                        className="op-refresh"
                        onClick={() => setSecurityModalOpen(false)}
                        style={{padding: "10px 16px", borderRadius: "10px"}}
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={masterSecurityLoading || masterVerificationCode.length < 6}
                        className="op-primary"
                        style={{
                          padding: "10px 20px", borderRadius: "10px", fontWeight: 800,
                          background: "linear-gradient(135deg, #10b981, #059669)",
                          color: "#fff", display: "flex", alignItems: "center", gap: "8px"
                        }}
                      >
                        {masterSecurityLoading ? (
                          <>
                            <RefreshCw size={15} className="animate-spin" />
                            <span>Validando...</span>
                          </>
                        ) : (
                          <>
                            <ShieldCheck size={16} />
                            <span>Confirmar e Ativar</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* MODAL ENVIAR ACESSO VIA WHATSAPP */}
        {whatsappModalData && (() => {
          const clientName = whatsappModalData.clientName;
          const storeName = whatsappModalData.storeName || "Sua Loja";
          const email = whatsappModalData.email;
          const rawPhone = whatsappModalData.phone || "";
          const cleanPhone = rawPhone.replace(/\D/g, "");
          const formattedPhone = (cleanPhone.length === 10 || cleanPhone.length === 11) ? `55${cleanPhone}` : cleanPhone;
          const messageText = `Olá, ${clientName}! Seu acesso ao CRM AI da ${storeName} foi configurado com sucesso.\n\n🌐 Painel de Acesso: https://crm.novaesweb.com.br/login\n📧 Seu E-mail: ${email}\n🔑 Senha: Se você ainda não definiu sua senha ou deseja redefini-la com segurança, utilize a opção "Esqueci minha senha" na tela de login.\n\nQualquer dúvida, estamos à disposição para te apoiar!`;
          const waUrl = formattedPhone ? `https://wa.me/${formattedPhone}?text=${encodeURIComponent(messageText)}` : `https://wa.me/?text=${encodeURIComponent(messageText)}`;

          return (
            <div style={{
              position: "fixed", inset: 0, background: "rgba(9, 7, 20, 0.85)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
              display: "grid", placeItems: "center", zIndex: 130, padding: "20px"
            }}>
              <div className="op-card" style={{
                width: "100%", maxWidth: "560px", padding: "28px",
                borderColor: "#22c55e", borderRadius: "20px",
                boxShadow: "0 25px 60px rgba(0, 0, 0, 0.75)"
              }}>
                <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px"}}>
                  <div style={{display: "flex", alignItems: "center", gap: "10px"}}>
                    <div style={{width: "38px", height: "38px", borderRadius: "10px", background: "rgba(34,197,94,0.15)", display: "grid", placeItems: "center"}}>
                      <Smartphone size={20} color="#22c55e"/>
                    </div>
                    <div>
                      <h3 style={{margin: 0, fontSize: "18px", fontWeight: 800, color: "#fff"}}>
                        Enviar Acesso por WhatsApp
                      </h3>
                      <span style={{fontSize: "12px", color: "#a1a1aa"}}>
                        Compartilhe as instruções de login de forma segura e sem expor senhas.
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setWhatsappModalData(null); setWhatsappCopied(false); }}
                    style={{background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: "4px"}}
                  >
                    <X size={20} />
                  </button>
                </div>

                <div style={{
                  padding: "12px 14px", borderRadius: "10px", background: "#18142a",
                  border: "1px solid #2d264a", marginBottom: "16px", display: "grid",
                  gridTemplateColumns: "1fr 1fr", gap: "10px", fontSize: "12px"
                }}>
                  <div>
                    <span style={{color: "#858199", display: "block"}}>Cliente</span>
                    <strong style={{color: "#fff"}}>{clientName}</strong>
                  </div>
                  <div>
                    <span style={{color: "#858199", display: "block"}}>Loja / Empresa</span>
                    <strong style={{color: "#22c55e"}}>{storeName}</strong>
                  </div>
                  <div>
                    <span style={{color: "#858199", display: "block"}}>E-mail de Login</span>
                    <span style={{color: "#c4bed6"}}>{email}</span>
                  </div>
                  <div>
                    <span style={{color: "#858199", display: "block"}}>WhatsApp Destino</span>
                    <span style={{color: rawPhone ? "#fff" : "#f59e0b", fontWeight: rawPhone ? 600 : 400}}>
                      {rawPhone || "Não informado no cadastro"}
                    </span>
                  </div>
                </div>

                <div style={{marginBottom: "16px"}}>
                  <label style={{fontSize: "12px", color: "#aba8bf", display: "block", marginBottom: "6px", fontWeight: 700}}>
                    Mensagem Pré-formatada
                  </label>
                  <textarea
                    readOnly
                    value={messageText}
                    rows={7}
                    style={{
                      width: "100%", padding: "12px", borderRadius: "10px",
                      background: "#120e24", border: "1px solid #3b335a",
                      color: "#e4e4e7", fontSize: "13px", lineHeight: "1.5",
                      resize: "none", fontFamily: "monospace"
                    }}
                  />
                  <span style={{fontSize: "11px", color: "#71717a", marginTop: "4px", display: "block"}}>
                    🔒 <strong>Segurança:</strong> A senha nunca é enviada em texto puro. O cliente é instruído a usar o fluxo oficial de login ou recuperação.
                  </span>
                </div>

                <div style={{display: "flex", gap: "10px", justifyContent: "flex-end", flexWrap: "wrap"}}>
                  <button
                    type="button"
                    className="op-refresh"
                    onClick={() => { setWhatsappModalData(null); setWhatsappCopied(false); }}
                    style={{padding: "10px 16px", borderRadius: "10px"}}
                  >
                    Fechar
                  </button>

                  <button
                    type="button"
                    className="op-refresh"
                    onClick={() => {
                      navigator.clipboard.writeText(messageText);
                      setWhatsappCopied(true);
                      setTimeout(() => setWhatsappCopied(false), 2500);
                    }}
                    style={{
                      padding: "10px 16px", borderRadius: "10px",
                      color: whatsappCopied ? "#22c55e" : "#c4bed6",
                      borderColor: whatsappCopied ? "#22c55e" : "#4a3c68",
                      display: "flex", alignItems: "center", gap: "6px"
                    }}
                  >
                    {whatsappCopied ? <Check size={16} color="#22c55e" /> : <Copy size={16} />}
                    <span>{whatsappCopied ? "Copiado com Sucesso!" : "Copiar Texto"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => window.open(waUrl, "_blank")}
                    className="op-primary"
                    style={{
                      padding: "10px 20px", borderRadius: "10px", fontWeight: 800,
                      background: "linear-gradient(135deg, #22c55e, #16a34a)",
                      color: "#fff", display: "flex", alignItems: "center", gap: "8px"
                    }}
                  >
                    <Smartphone size={16} />
                    <span>Abrir no WhatsApp</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </main>
    </div>
  );
}
