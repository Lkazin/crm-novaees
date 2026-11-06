"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Building2, CheckCircle2, CircleAlert, Inbox, LockKeyhole, LogOut,
  Mail, MessageSquare, RefreshCw, Search, ShieldCheck, Users, UserPlus,
  Smartphone, QrCode, BookOpen, Bot, Sparkles, HelpCircle, ShieldAlert, Save, Trash2, Ban,
  Calendar, CreditCard, ChevronRight, HelpCircle as InfoIcon, Play, Clock, Zap, Send,
  Trash
} from "lucide-react";

type Tenant = { id: string; name: string; status: string };
type Contact = { id: string; phone: string; display_name: string | null; created_at: string };
type Conversation = { id: string; contact_id: string; status: string; mode: string; last_message_at: string | null; assigned_to: string | null };
type Message = { id: string; conversation_id: string; direction: string; sender_type: string; body: string; created_at: string };
type EscalationItem = { category: string; reason: string; text?: string; timestamp?: string };
type Data = {
  tenants: Tenant[];
  selectedTenant: string | null;
  isSuspended?: boolean;
  suspensionReason?: string;
  plan?: { name: string; price: string; dueDate: string; status: string; autoBlock: boolean; quotaLimit?: number; quotaUsed?: number };
  contacts: Contact[];
  conversations: Conversation[];
  messages: Message[];
  escalations?: Record<string, EscalationItem>;
  note?: string;
};

type Tab = "whatsapp" | "conhecimento" | "simulador" | "horarios" | "atendimentos" | "contatos";

function dateTime(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

const INDUSTRY_PRESETS = [
  {
    label: "🍕 Pizzaria & Lanchonete",
    agentName: "Bia - Atendente Bella Pizza",
    instructions: "Você é a atendente virtual da Bella Pizza no WhatsApp. Atenda com simpatia e agilidade, use emojis leves, ajude o cliente a escolher a pizza ou lanche, confirme o tamanho e sabor, pergunte se deseja adicionar bebidas e solicite o endereço completo de entrega. Seja objetiva, cordial e prestativa.",
    storeInfo: `🍕 CARDÁPIO DE PIZZAS:
- Pizza Calabresa (Grande 8 fatias): R$ 49,90 | (Média 6 fatias): R$ 39,90
- Pizza 4 Queijos (Grande): R$ 54,90 | (Média): R$ 44,90
- Pizza Frango com Catupiry (Grande): R$ 52,90 | (Média): R$ 42,90
- Pizza Bacon Especial (Grande): R$ 56,90 | (Média): R$ 45,90
- Borda Recheada (Catupiry ou Cheddar): R$ 8,00

🥤 BEBIDAS:
- Coca-Cola 2 Litros: R$ 13,00
- Guaraná Antarctica 2L: R$ 11,00
- Cerveja Heineken Long Neck: R$ 9,50
- Água Mineral 500ml: R$ 4,50

🕒 HORÁRIO DE ATENDIMENTO:
- Terça a Domingo, das 18h00 às 23h30 (Segunda fechado)

🛵 ENTREGA & TAXAS:
- Centro: R$ 5,00 | Bairros vizinhos: R$ 8,00
- Tempo estimado: 40 a 55 minutos

💳 FORMAS DE PAGAMENTO:
- Pix (Chave: pix@bellapizza.com), Cartão na entrega ou Dinheiro`
  },
  {
    label: "👗 Loja de Roupas & Varejo",
    agentName: "Carol - Consultora de Moda",
    instructions: "Você é a consultora de vendas virtual da Loja Elegance no WhatsApp. Seja alegre, atenciosa e estilosa. Ajude as clientes a encontrar peças do seu tamanho, tire dúvidas sobre tecidos, caimento e prazo de envio. Incentive o envio de fotos do catálogo e feche a venda com carinho.",
    storeInfo: `✨ COLEÇÃO ATUAL:
- Vestido Midi Floral: R$ 149,90 (Tamanhos P, M, G)
- Calça Jeans Wide Leg: R$ 189,90 (Tamanhos 36 ao 44)
- Cropped Canelado Básico: R$ 49,90 (Cores: Preto, Branco, Fúcsia)
- Blazer Alfaiataria: R$ 229,90 (Tamanhos P, M, G)

📦 ENVIOS E RETIRADA:
- Enviamos para todo o Brasil via Correios (PAC e Sedex)
- Frete Grátis acima de R$ 250,00
- Retirada na loja física em até 2 horas úteis

🕒 HORÁRIO:
- Segunda a Sexta: 09h00 às 19h00 | Sábado: 09h00 às 17h00

💳 FORMAS DE PAGAMENTO:
- Pix com 5% de desconto ou Cartão em até 6x sem juros`
  },
  {
    label: "💼 Serviços & Agência",
    agentName: "Alex - Consultor de Projetos",
    instructions: "Você é o especialista de atendimento da Agência NovaesWeb. Entenda a necessidade do cliente (site, tráfego, automação, IA), tire dúvidas sobre metodologia e prazos, apresente os diferenciais da agência e convide para agendar uma demonstração ou orçamento personalizado.",
    storeInfo: `🚀 NOSSOS SERVIÇOS:
- Criação de Sites e Landing Pages de Alta Conversão (Entrega em 7 a 15 dias)
- Atendimento com IA e WhatsApp Automatizado (NovaesWeb CRM AI)
- Gestão de Tráfego Pago (Google Ads & Meta Ads)
- Automação de Processos e Chatbots

📋 COMO FUNCIONA O PROCESSO:
1. Diagnóstico gratuito das necessidades da sua empresa
2. Proposta comercial detalhada com cronograma e investimento
3. Execução ágil com alinhamentos semanais

🕒 HORÁRIO COMERCIAL:
- Segunda a Sexta: 08h30 às 18h30

💳 FORMAS DE PAGAMENTO:
- Pix, Boleto Bancário ou Cartão Corporativo parcelado`
  },
  {
    label: "🩺 Clínica & Consultório",
    agentName: "Juliana - Recepção & Agendamentos",
    instructions: "Você é a assistente virtual da Clínica Saúde & Bem-Estar no WhatsApp. Seja muito acolhedora, educada e cuidadosa. Tire dúvidas sobre as especialidades atendidas, informe os dias de consulta, orientações pré-exame e ajude o paciente a agendar o melhor horário.",
    storeInfo: `🏥 ESPECIALIDADES E CONSULTAS:
- Clínica Geral: R$ 180,00
- Dermatologia: R$ 250,00
- Nutrição Clínica & Esportiva: R$ 200,00
- Psicologia: R$ 170,00 por sessão

📋 CONVÊNIOS E PLANOS ACEITOS:
- Atendemos particular com emissão de recibo para reembolso
- Convênios parceiros: Unimed, Bradesco Saúde, Amil e SulAmérica

🕒 HORÁRIO DE ATENDIMENTO:
- Segunda a Sexta: 08h00 às 20h00 | Sábado: 08h00 às 13h00

📍 LOCALIZAÇÃO:
- Av. Central, 1000 - Cj. 52 - Centro Empresarial
- Estacionamento conveniado no local`
  }
];

export default function OperatorPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [tenant, setTenant] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("whatsapp");
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "ai" | "human" | "urgent">("all");
  const [newContactOpen, setNewContactOpen] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactNotice, setContactNotice] = useState("");
  const [handoffNotice, setHandoffNotice] = useState("");
  const [claiming, setClaiming] = useState(false);

  // Suspension state
  const [isSuspended, setIsSuspended] = useState(false);
  const [suspensionReason, setSuspensionReason] = useState("");

  // AI Configuration state (Store Owner inputs what the AI says)
  const [agentLabel, setAgentLabel] = useState("Assistente Virtual");
  const [instructions, setInstructions] = useState("");
  const [storeInfo, setStoreInfo] = useState("");
  const [aiEnabled, setAiEnabled] = useState(true);
  const [savingAi, setSavingAi] = useState(false);
  const [aiNotice, setAiNotice] = useState("");

  // Operating Hours state
  const [operatingHours, setOperatingHours] = useState<{
    enabled: boolean;
    openTime: string;
    closeTime: string;
    days: string[];
    closedMessage: string;
  }>({
    enabled: false,
    openTime: "18:00",
    closeTime: "23:30",
    days: ["ter", "qua", "qui", "sex", "sab", "dom"],
    closedMessage: "Olá! Nosso horário de atendimento é de terça a domingo, das 18h às 23h30. Deixe sua mensagem e responderemos assim que abrirmos! 😊"
  });
  const [hoursNotice, setHoursNotice] = useState("");
  const [savingHours, setSavingHours] = useState(false);

  // Quota state
  const [quotaData, setQuotaData] = useState<{
    quotaLimit: number;
    quotaUsed: number;
  }>({
    quotaLimit: 500,
    quotaUsed: 0
  });

  // Simulator state
  const [simMessages, setSimMessages] = useState<Array<{
    role: "user" | "assistant";
    content: string;
    time: string;
    latency?: number;
    isEscalation?: boolean;
    escalationReason?: string;
    escalationCategory?: string;
  }>>([
    {
      role: "assistant",
      content: "Olá! Sou a NovaesWeb IA configurada para a sua loja. Faça uma pergunta sobre seus produtos, cardápio ou horários para testar como eu converso com seus clientes!",
      time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    }
  ]);
  const [simInput, setSimInput] = useState("");
  const [simLoading, setSimLoading] = useState(false);

  // WhatsApp QR Code state
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [deletingQr, setDeletingQr] = useState(false);
  const [qrState, setQrState] = useState<"disconnected" | "connecting" | "open">("disconnected");
  const [qrNotice, setQrNotice] = useState("");

  const currentTenantObj = useMemo(() => data?.tenants?.find(t => t.id === tenant) ?? null, [data, tenant]);
  const instanceName = useMemo(() => {
    if (!currentTenantObj) return "novaesweb-ia-teste";
    const slug = currentTenantObj.name.toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 24);
    return slug.startsWith("novaesweb") ? "novaesweb-ia-teste" : `loja_${slug}`;
  }, [currentTenantObj]);

  const fetchAiSettings = useCallback(async (tenantId: string) => {
    if (!tenantId) return;
    try {
      const res = await fetch(`/api/crm/operator/ai-settings?tenant=${encodeURIComponent(tenantId)}`, { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        setAgentLabel(json.agentLabel || "Assistente Virtual");
        setInstructions(json.instructions || "");
        setStoreInfo(json.storeInfo || "");
        setAiEnabled(json.enabled !== false);
        if (json.operatingHours) {
          setOperatingHours(prev => ({ ...prev, ...json.operatingHours }));
        }
        if (json.plan) {
          setQuotaData({
            quotaLimit: json.plan.quotaLimit || 500,
            quotaUsed: json.plan.quotaUsed || 0
          });
        }
      }
    } catch {}
  }, []);

  const fetchData = useCallback(async (tenantId: string) => {
    setLoading(true);
    setError("");
    try {
      const url = "/api/crm/operator/data" + (tenantId ? "?tenant=" + encodeURIComponent(tenantId) : "");
      const response = await fetch(url, { cache: "no-store", credentials: "same-origin" });
      if (response.status === 401) {
        setAuthenticated(false);
        setData(null);
        setError("Sessão expirada. Entre novamente.");
        return;
      }
      if (!response.ok) throw Error(response.status === 403 ? "Empresa não autorizada." : "Falha ao consultar dados da empresa.");
      const json = await response.json() as Data;
      setData(json);
      setIsSuspended(json.isSuspended === true);
      setSuspensionReason(json.suspensionReason || "");

      const activeTenant = tenantId || (json.tenants?.length ? json.tenants[0].id : "");
      if (!tenantId && activeTenant) {
        setTenant(activeTenant);
      }
      if (activeTenant) {
        void fetchAiSettings(activeTenant);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar atendimentos.");
    } finally {
      setLoading(false);
    }
  }, [fetchAiSettings]);

  // Check connection state for this tenant
  const checkStatus = useCallback(async () => {
    if (!instanceName) return;
    try {
      const res = await fetch(`/api/crm/whatsapp/status?instance=${encodeURIComponent(instanceName)}`, { cache: "no-store" });
      if (res.ok) {
        const s = await res.json();
        if (s.connected || s.state === "open") {
          setQrState("open");
          setQrCode(null);
        } else {
          setQrState("disconnected");
        }
      }
    } catch {}
  }, [instanceName]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/crm/operator/session", { cache: "no-store", credentials: "same-origin" });
        const result = await res.json() as { authenticated: boolean };
        if (!active) return;
        setAuthenticated(result.authenticated);
        if (result.authenticated) void fetchData("");
      } catch {
        if (active) setError("Não foi possível verificar a sessão.");
      } finally {
        if (active) setChecking(false);
      }
    })();
    return () => { active = false; };
  }, [fetchData]);

  useEffect(() => {
    if (authenticated && instanceName) {
      void checkStatus();
    }
  }, [authenticated, instanceName, checkStatus]);

  async function signIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/crm/operator/session", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json() as { authenticated: boolean; error?: string };
      if (!res.ok) throw Error(data.error === "invalid_credentials" ? "E-mail ou senha incorretos." : "Não foi possível autenticar.");
      setAuthenticated(true);
      setEmail("");
      setPassword("");
      void fetchData("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na conexão.");
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    await fetch("/api/crm/operator/session", { method: "DELETE", credentials: "same-origin" });
    setAuthenticated(false);
    setData(null);
    setTenant("");
    setQrCode(null);
    setQrState("disconnected");
  }

  async function changeTenant(nextTenant: string) {
    setTenant(nextTenant);
    setSelected("");
    setQrCode(null);
    await fetchData(nextTenant);
  }

  // Connect WhatsApp: generate QR Code
  async function handleConnectWhatsApp() {
    if (!instanceName) return;
    setQrLoading(true);
    setQrNotice("");
    try {
      const res = await fetch("/api/crm/whatsapp/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instance: instanceName })
      });
      const data = await res.json();
      if (!res.ok) {
        setQrNotice(data.error === "evolution_unavailable" ? "Servidor de WhatsApp indisponível no momento." : "Falha ao conectar.");
        return;
      }
      if (data.connected || data.state === "open") {
        setQrState("open");
        setQrCode(null);
        setQrNotice("WhatsApp já conectado e funcionando!");
      } else if (data.qrcode) {
        setQrCode(data.qrcode);
        setQrState("connecting");
        setQrNotice("Escaneie o QR Code abaixo com seu WhatsApp em Aparelhos Conectados.");
      }
    } catch {
      setQrNotice("Falha de conexão com a central de WhatsApp.");
    } finally {
      setQrLoading(false);
    }
  }

  // Delete instance / Disconnect WhatsApp
  async function handleDeleteInstance() {
    if (!instanceName) return;
    if (!window.confirm(`Deseja realmente apagar a instância e desconectar o WhatsApp da loja "${currentTenantObj?.name || ""}"? O QR Code será cancelado e o número desconectado.`)) return;
    setDeletingQr(true);
    setQrNotice("Apagando instância e desconectando WhatsApp...");
    try {
      const res = await fetch(`/api/crm/whatsapp/connect?instance=${encodeURIComponent(instanceName)}`, {
        method: "DELETE"
      });
      if (res.ok) {
        setQrCode(null);
        setQrState("disconnected");
        setQrNotice("Instância apagada com sucesso! O WhatsApp foi desconectado.");
      } else {
        setQrNotice("Falha ao apagar instância.");
      }
    } catch {
      setQrNotice("Falha de conexão ao apagar instância.");
    } finally {
      setDeletingQr(false);
    }
  }

  // Poll status while connecting
  useEffect(() => {
    if (qrState !== "connecting") return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/crm/whatsapp/status?instance=${encodeURIComponent(instanceName)}`, { cache: "no-store" });
        if (res.ok) {
          const s = await res.json();
          if (s.connected || s.state === "open") {
            setQrState("open");
            setQrCode(null);
            setQrNotice("WhatsApp Conectado com Sucesso! A IA de atendimento da loja já está ativa.");
            clearInterval(interval);
          }
        }
      } catch {}
    }, 3000);
    return () => clearInterval(interval);
  }, [qrState, instanceName]);

  const handleSaveAiSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant) return;
    setSavingAi(true);
    setAiNotice("");
    try {
      const res = await fetch("/api/crm/operator/ai-settings", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: tenant,
          agentLabel,
          instructions,
          storeInfo,
          enabled: aiEnabled
        })
      });
      if (!res.ok) throw new Error();
      setAiNotice("Configurações salvas com sucesso! Sua IA já está respondendo no WhatsApp com os novos dados.");
    } catch {
      setAiNotice("Falha ao salvar configurações da IA.");
    } finally {
      setSavingAi(false);
    }
  };

  const handleSaveOperatingHours = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant) return;
    setSavingHours(true);
    setHoursNotice("");
    try {
      const res = await fetch("/api/crm/operator/ai-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: tenant,
          operatingHours
        })
      });
      if (!res.ok) throw new Error();
      setHoursNotice("Horários de atendimento salvos com sucesso! A IA respeitará esta janela no WhatsApp.");
      setTimeout(() => setHoursNotice(""), 6000);
    } catch {
      setHoursNotice("Falha ao salvar horários de atendimento.");
    } finally {
      setSavingHours(false);
    }
  };

  const handleSendSimulator = async (textToSend?: string) => {
    const prompt = (textToSend || simInput).trim();
    if (!prompt || !tenant || simLoading) return;
    setSimInput("");
    const userMsg = {
      role: "user" as const,
      content: prompt,
      time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    };
    const nextHistory = [...simMessages, userMsg];
    setSimMessages(nextHistory);
    setSimLoading(true);

    try {
      const res = await fetch("/api/crm/operator/simulator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: tenant,
          message: prompt,
          history: nextHistory.map(m => ({ role: m.role, content: m.content }))
        })
      });
      const data = await res.json();
      if (res.ok && data.answer) {
        setSimMessages(prev => [
          ...prev,
          {
            role: "assistant",
            content: data.answer,
            time: data.timestamp || new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
            latency: data.latencyMs,
            isEscalation: data.isEscalation,
            escalationReason: data.escalationReason,
            escalationCategory: data.escalationCategory
          }
        ]);
      } else {
        setSimMessages(prev => [
          ...prev,
          {
            role: "assistant",
            content: "Não foi possível simular a resposta no momento. Confira se você preencheu o cardápio e regras da loja na aba 'Minha IA'.",
            time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
          }
        ]);
      }
    } catch {
      setSimMessages(prev => [
        ...prev,
        {
          role: "assistant",
          content: "Falha na comunicação com o simulador.",
          time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
        }
      ]);
    } finally {
      setSimLoading(false);
    }
  };

  const applyPreset = (preset: typeof INDUSTRY_PRESETS[0]) => {
    setAgentLabel(preset.agentName);
    setInstructions(preset.instructions);
    setStoreInfo(preset.storeInfo);
    setAiNotice(`Modelo "${preset.label}" aplicado! Ajuste os preços e horários conforme sua loja e clique em Salvar.`);
  };

  async function registerContact(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setContactNotice("");
    try {
      const res = await fetch("/api/crm/operator/contacts", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: tenant, name: contactName, phone: contactPhone })
      });
      const json = await res.json() as { created: boolean; error?: string };
      if (!res.ok) throw Error(json.error === "phone_invalid" ? "Telefone inválido (use DDD + número)." : "Falha ao registrar contato.");
      setContactName("");
      setContactPhone("");
      setNewContactOpen(false);
      setContactNotice("Contato registrado com sucesso!");
      await fetchData(tenant);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar contato.");
    } finally {
      setLoading(false);
    }
  }

  // Resolve Urgency status
  async function resolveUrgency(conversationId: string) {
    try {
      const res = await fetch("/api/crm/operator/handoff", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: tenant, conversationId, action: "resolve_urgency" })
      });
      if (!res.ok) throw new Error("Falha ao resolver urgência.");
      setHandoffNotice("Status de urgência resolvido! O atendimento permanece com você ou pode ser devolvido para a IA quando desejar.");
      await fetchData(tenant);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao resolver urgência.");
    }
  }

  // Toggle Human Handoff (Take over or Return to AI)
  async function toggleConversationMode(conversationId: string, targetMode: "ai" | "human") {
    setClaiming(true);
    setHandoffNotice("");
    try {
      const res = await fetch("/api/crm/operator/handoff", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: tenant, conversationId, mode: targetMode })
      });
      const json = await res.json() as { claimed?: boolean; mode?: string; summary?: string; error?: string };
      if (!res.ok) throw Error(json.error || "Falha ao alterar modo de atendimento.");

      if (targetMode === "human") {
        setHandoffNotice(json.summary || "Atendimento assumido pelo atendente humano! A IA pausou as respostas nesta conversa.");
      } else {
        setHandoffNotice("Conversa devolvida para a NovaesWeb IA! Ela continuará atendendo automaticamente.");
      }
      await fetchData(tenant);
    } catch (e) {
      setHandoffNotice(e instanceof Error ? e.message : "Falha na transição de atendimento.");
    } finally {
      setClaiming(false);
    }
  }

  const contacts = useMemo(() => data?.contacts ?? [], [data]);
  const conversations = useMemo(() => data?.conversations ?? [], [data]);
  const messages = data?.messages ?? [];
  const byContact = useMemo(() => new Map(contacts.map(c => [c.id, c])), [contacts]);

  const urgentCount = useMemo(() => conversations.filter(c => c.status === "urgent").length, [conversations]);

  const filtered = useMemo(() => conversations.filter(c => {
    const contact = byContact.get(c.contact_id);
    const matchesSearch = (contact?.phone + " " + (contact?.display_name ?? "")).toLowerCase().includes(search.toLowerCase());
    const isUrgent = c.status === "urgent";
    const matchesFilter =
      filterMode === "all" ||
      (filterMode === "ai" && c.mode !== "human") ||
      (filterMode === "human" && c.mode === "human") ||
      (filterMode === "urgent" && isUrgent);
    return matchesSearch && matchesFilter;
  }), [conversations, byContact, search, filterMode]);

  const current = filtered.find(c => c.id === selected) ?? filtered[0] ?? null;
  const thread = current ? messages.filter(m => m.conversation_id === current.id).sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)) : [];

  // Quota percentage
  const quotaPercent = Math.min(100, Math.round(((quotaData.quotaUsed || 0) / (quotaData.quotaLimit || 500)) * 100));

  return (
    <div className="nw-layout-shell">
      {checking ? (
        <section className="op-card op-centered" style={{margin: "120px auto", maxWidth: "420px", textAlign: "center"}}>
          <RefreshCw size={36} className="spin" style={{margin: "0 auto 14px", color: "#ec4899"}}/>
          <h1 style={{fontSize: "20px"}}>Verificando acesso seguro...</h1>
        </section>
      ) : !authenticated ? (
        <main className="op-card op-login" style={{maxWidth: "460px", margin: "70px auto"}}>
          <div style={{display: "inline-grid", placeItems: "center", width: "62px", height: "62px", borderRadius: "18px", background: "var(--grad-primary)", margin: "0 auto 16px", boxShadow: "var(--glow-pink)"}}>
            <LockKeyhole size={30} color="#fff"/>
          </div>
          <h1 style={{fontSize: "26px", margin: "0 0 8px", textAlign: "center", fontWeight: 800}}>Painel da Loja</h1>
          <p style={{textAlign: "center", color: "#aba8bf", fontSize: "14px", lineHeight: "1.5", margin: "0 0 24px"}}>
            Acesse com seu e-mail e senha para gerenciar seus atendimentos, conectar seu WhatsApp e configurar a IA da sua empresa.
          </p>
          <form onSubmit={e => void signIn(e)} style={{display: "flex", flexDirection: "column", gap: "14px"}}>
            <label style={{fontSize: "13px", color: "#d1c8e6"}}>
              E-mail de Acesso
              <input
                type="email"
                autoComplete="username"
                required
                maxLength={254}
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="cliente@suaempresa.com"
                style={{width: "100%", padding: "12px 14px", marginTop: "6px", borderRadius: "10px", border: "1px solid #443c5e", background: "#121222", color: "white"}}
              />
            </label>
            <label style={{fontSize: "13px", color: "#d1c8e6"}}>
              Senha
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{width: "100%", padding: "12px 14px", marginTop: "6px", borderRadius: "10px", border: "1px solid #443c5e", background: "#121222", color: "white"}}
              />
            </label>
            <button className="op-primary" disabled={loading || !email || !password} style={{padding: "14px", borderRadius: "10px", marginTop: "8px", fontWeight: 700}}>
              {loading ? "Autenticando..." : "Entrar no Painel da Loja"}
            </button>
          </form>
          {error && <p className="op-alert" role="alert" style={{marginTop: "16px"}}><CircleAlert size={16}/>{error}</p>}
          <div className="op-notice" style={{marginTop: "20px", display: "flex", alignItems: "center", gap: "8px", justifyContent: "center", fontSize: "13px", color: "#9ca3af"}}>
            <ShieldCheck size={18} color="#00db8c"/> Ambiente individual e 100% seguro da sua loja.
          </div>
        </main>
      ) : (
        <>
          {/* MENU LATERAL FIXO (SIDEBAR) */}
          <aside className="nw-sidebar">
            <div className="nw-sidebar-brand">
              <div className="nw-sidebar-logo">N</div>
              <div>
                <strong style={{display: "block", fontSize: "16px", color: "#fff", letterSpacing: "-0.3px"}}>
                  NovaesWeb IA
                </strong>
                <small style={{display: "block", fontSize: "11px", color: "#ec4899", fontWeight: 700, letterSpacing: "0.5px"}}>
                  PAINEL DA LOJA
                </small>
              </div>
            </div>

            {/* Seletor de Loja (se houver mais de uma) */}
            {data && data.tenants.length > 1 && (
              <div style={{padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)"}}>
                <label style={{fontSize: "11px", color: "#9ca3af", textTransform: "uppercase", fontWeight: 700, display: "block", marginBottom: "6px"}}>
                  Empresa Ativa
                </label>
                <select
                  value={tenant}
                  onChange={e => void changeTenant(e.target.value)}
                  style={{width: "100%", padding: "8px 10px", borderRadius: "8px", background: "#1b172a", border: "1px solid #3c3254", color: "#fff", fontSize: "13px"}}
                >
                  {data.tenants.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Navegação Principal */}
            <nav className="nw-sidebar-nav">
              <button
                type="button"
                className={`nw-nav-button ${activeTab === "whatsapp" ? "active" : ""}`}
                onClick={() => setActiveTab("whatsapp")}
              >
                <Smartphone size={19}/>
                <span>Conectar WhatsApp</span>
                {qrState === "open" && (
                  <span style={{marginLeft: "auto", width: "8px", height: "8px", borderRadius: "50%", background: "#00db8c"}}/>
                )}
              </button>

              <button
                type="button"
                className={`nw-nav-button ${activeTab === "conhecimento" ? "active" : ""}`}
                onClick={() => setActiveTab("conhecimento")}
              >
                <Bot size={19}/>
                <span>Minha IA (O que ela fala)</span>
              </button>

              <button
                type="button"
                className={`nw-nav-button ${activeTab === "simulador" ? "active" : ""}`}
                onClick={() => setActiveTab("simulador")}
              >
                <Play size={19}/>
                <span>Chat de Teste (Simulador)</span>
                <span style={{marginLeft: "auto", background: "rgba(236, 72, 153, 0.2)", color: "#ec4899", padding: "2px 6px", borderRadius: "6px", fontSize: "10px", fontWeight: 800}}>
                  TESTAR
                </span>
              </button>

              <button
                type="button"
                className={`nw-nav-button ${activeTab === "horarios" ? "active" : ""}`}
                onClick={() => setActiveTab("horarios")}
              >
                <Clock size={19}/>
                <span>Horários de Atendimento</span>
              </button>

              <button
                type="button"
                className={`nw-nav-button ${activeTab === "atendimentos" ? "active" : ""}`}
                onClick={() => setActiveTab("atendimentos")}
              >
                <Inbox size={19}/>
                <span>Atendimentos ao Vivo</span>
                {conversations.length > 0 && (
                  <span style={{marginLeft: "auto", background: "rgba(255,255,255,0.2)", padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 700}}>
                    {conversations.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                className={`nw-nav-button ${activeTab === "contatos" ? "active" : ""}`}
                onClick={() => setActiveTab("contatos")}
              >
                <Users size={19}/>
                <span>Contatos da Loja</span>
                {contacts.length > 0 && (
                  <span style={{marginLeft: "auto", background: "rgba(255,255,255,0.2)", padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 700}}>
                    {contacts.length}
                  </span>
                )}
              </button>

              <div style={{height: "1px", background: "rgba(255,255,255,0.08)", margin: "10px 4px"}}/>

              <Link
                href="/operator/knowledge"
                className="nw-nav-button"
                style={{textDecoration: "none"}}
              >
                <BookOpen size={19}/>
                <span>Base de Conhecimento</span>
                <ChevronRight size={14} style={{marginLeft: "auto", opacity: 0.6}}/>
              </Link>
            </nav>

            {/* Rodapé do Menu Lateral */}
            <div className="nw-sidebar-footer">
              {/* Medidor de Franquia Visual */}
              <div style={{
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "12px",
                padding: "12px 14px",
                fontSize: "12px"
              }}>
                <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px"}}>
                  <span style={{color: "#c9bede", fontWeight: 600}}>Franquia do Mês</span>
                  <span style={{
                    fontSize: "11px",
                    fontWeight: 800,
                    color: quotaPercent > 90 ? "#f43f5e" : quotaPercent > 70 ? "#f59e0b" : "#00db8c"
                  }}>
                    {quotaData.quotaUsed} / {quotaData.quotaLimit}
                  </span>
                </div>
                {/* Barra de Progresso */}
                <div style={{width: "100%", height: "6px", background: "rgba(255,255,255,0.1)", borderRadius: "3px", overflow: "hidden"}}>
                  <div style={{
                    width: `${quotaPercent}%`,
                    height: "100%",
                    background: quotaPercent > 90
                      ? "#f43f5e"
                      : quotaPercent > 70
                        ? "#f59e0b"
                        : "linear-gradient(90deg, #ec4899, #8b5cf6)",
                    transition: "width 0.4s ease"
                  }}/>
                </div>
                <small style={{display: "block", color: "#8e87a2", fontSize: "10px", marginTop: "6px"}}>
                  Renovação mensal automática
                </small>
              </div>

              {/* Botão Sair */}
              <button
                type="button"
                onClick={() => void signOut()}
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
                <LogOut size={16}/> Sair do Painel
              </button>
            </div>
          </aside>

          {/* CONTEÚDO PRINCIPAL (MAIN CONTENT) */}
          <main className="nw-main-content">
            {/* Topbar com Nome da Loja */}
            <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "22px", flexWrap: "wrap", gap: "12px"}}>
              <div>
                <h1 style={{fontSize: "26px", fontWeight: 800, margin: 0, letterSpacing: "-0.5px"}}>
                  {currentTenantObj ? currentTenantObj.name : "Painel da Loja"}
                </h1>
                <p style={{color: "#aba8bf", margin: "4px 0 0", fontSize: "14px"}}>
                  Atendimento inteligente com <strong>NovaesWeb IA</strong> · Totalmente personalizado para o seu negócio.
                </p>
              </div>
              <div style={{display: "flex", gap: "10px", alignItems: "center"}}>
                <span style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "6px 14px",
                  borderRadius: "20px",
                  fontSize: "12px",
                  fontWeight: 700,
                  background: qrState === "open" ? "rgba(0, 219, 140, 0.15)" : "rgba(244, 63, 94, 0.15)",
                  color: qrState === "open" ? "#00db8c" : "#f43f5e",
                  border: `1px solid ${qrState === "open" ? "rgba(0, 219, 140, 0.4)" : "rgba(244, 63, 94, 0.4)"}`
                }}>
                  <span style={{width: "8px", height: "8px", borderRadius: "50%", background: qrState === "open" ? "#00db8c" : "#f43f5e"}}/>
                  {qrState === "open" ? "WhatsApp Conectado" : "WhatsApp Desconectado"}
                </span>

                <button className="op-refresh" onClick={() => void fetchData(tenant)} disabled={loading}>
                  <RefreshCw size={15}/> Atualizar
                </button>
              </div>
            </div>

            {/* ALERTA DE BLOQUEIO / SUSPENSÃO POR MENSALIDADE */}
            {isSuspended && (
              <section className="op-card" style={{
                background: "linear-gradient(135deg, rgba(80, 16, 28, 0.95), rgba(40, 10, 18, 0.95))",
                border: "2px solid #f43f5e",
                padding: "24px",
                marginBottom: "24px",
                boxShadow: "0 10px 40px rgba(244, 63, 94, 0.3)"
              }}>
                <div style={{display: "flex", alignItems: "center", gap: "14px", marginBottom: "12px"}}>
                  <ShieldAlert size={36} color="#f43f5e"/>
                  <div>
                    <h2 style={{margin: 0, color: "#fff", fontSize: "20px", fontWeight: 800}}>
                      {suspensionReason === "payment_overdue"
                        ? "Mensalidade do Plano Pendente — Respostas Automáticas em Pausa"
                        : "Acesso Administrativo Temporariamente Pausado"}
                    </h2>
                    <p style={{margin: "4px 0 0", color: "#ffccd5", fontSize: "14px"}}>
                      {suspensionReason === "payment_overdue"
                        ? "A data de vencimento da mensalidade expirou. Regularize seu pagamento para que a IA continue respondendo no WhatsApp."
                        : "Entre em contato com o suporte NovaesWeb para liberação da sua conta."}
                    </p>
                  </div>
                </div>
              </section>
            )}

            {/* SEÇÃO 1: CONECTAR WHATSAPP */}
            {activeTab === "whatsapp" && (
              <section style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "22px"}}>
                <div className="op-card" style={{display: "flex", flexDirection: "column", gap: "16px"}}>
                  <div style={{display: "flex", alignItems: "center", gap: "12px", borderBottom: "1px solid #372f4d", paddingBottom: "14px"}}>
                    <div style={{width: "44px", height: "44px", borderRadius: "12px", background: "var(--grad-primary)", display: "grid", placeItems: "center", boxShadow: "var(--glow-pink)"}}>
                      <Smartphone size={24} color="#fff"/>
                    </div>
                    <div>
                      <h2 style={{margin: 0, fontSize: "18px", color: "#fff"}}>Conexão Oficial com o WhatsApp</h2>
                      <small style={{color: "#aba8bf"}}>Instância: <code>{instanceName}</code></small>
                    </div>
                  </div>

                  <p style={{color: "#c2bed4", fontSize: "14px", lineHeight: "1.5", margin: 0}}>
                    Conecte o número de WhatsApp da sua loja para que a inteligência artificial responda seus clientes automaticamente com o cardápio e regras configuradas.
                  </p>

                  <div style={{display: "flex", gap: "10px", flexWrap: "wrap"}}>
                    <button
                      type="button"
                      className="op-primary"
                      disabled={qrLoading || isSuspended}
                      onClick={() => void handleConnectWhatsApp()}
                      style={{display: "inline-flex", alignItems: "center", gap: "8px", padding: "12px 20px", fontWeight: 700}}
                    >
                      <QrCode size={18}/> {qrLoading ? "Gerando QR Code..." : qrState === "open" ? "Reconectar WhatsApp" : "Gerar QR Code de Conexão"}
                    </button>

                    <button
                      type="button"
                      className="op-refresh"
                      disabled={deletingQr || isSuspended}
                      onClick={() => void handleDeleteInstance()}
                      style={{display: "inline-flex", alignItems: "center", gap: "8px", padding: "12px 18px", background: "#2e1218", color: "#ff859a", borderColor: "#f43f5e"}}
                      title="Apagar instância e desconectar número"
                    >
                      <Trash2 size={16}/> {deletingQr ? "Apagando..." : "Desconectar Número"}
                    </button>
                  </div>

                  {qrNotice && (
                    <div style={{padding: "12px 16px", borderRadius: "10px", background: "rgba(236, 72, 153, 0.15)", border: "1px solid #ec4899", color: "#fff", fontSize: "13px"}}>
                      {qrNotice}
                    </div>
                  )}

                  {qrCode && qrState !== "open" && (
                    <div style={{textAlign: "center", padding: "20px", background: "#fff", borderRadius: "16px", margin: "10px auto", maxWidth: "280px"}}>
                      <img src={qrCode} alt="QR Code WhatsApp" style={{width: "100%", height: "auto", display: "block"}}/>
                      <span style={{color: "#111", fontSize: "12px", fontWeight: 700, display: "block", marginTop: "10px"}}>
                        Aponte a câmera do seu WhatsApp aqui
                      </span>
                    </div>
                  )}
                </div>

                <div className="op-card" style={{display: "flex", flexDirection: "column", gap: "16px"}}>
                  <div style={{display: "flex", alignItems: "center", gap: "10px", borderBottom: "1px solid #372f4d", paddingBottom: "14px"}}>
                    <CheckCircle2 size={22} color="#00db8c"/>
                    <h2 style={{margin: 0, fontSize: "18px", color: "#fff"}}>Como Conectar em 6 Passos</h2>
                  </div>

                  <div style={{display: "flex", flexDirection: "column", gap: "14px", fontSize: "14px", color: "#d2cae4", lineHeight: "1.5"}}>
                    <div style={{display: "flex", gap: "12px", alignItems: "flex-start"}}>
                      <span style={{background: "#00db8c", color: "#002b1b", borderRadius: "50%", minWidth: "26px", height: "26px", display: "grid", placeItems: "center", fontWeight: 800, fontSize: "12px"}}>✓</span>
                      <span><strong>1. Login no Painel:</strong> Você já está autenticado no painel individual da sua loja.</span>
                    </div>
                    <div style={{display: "flex", gap: "12px", alignItems: "flex-start"}}>
                      <span style={{background: "#00db8c", color: "#002b1b", borderRadius: "50%", minWidth: "26px", height: "26px", display: "grid", placeItems: "center", fontWeight: 800, fontSize: "12px"}}>✓</span>
                      <span><strong>2. Acessar WhatsApp:</strong> Você já está na aba de conexão do WhatsApp.</span>
                    </div>
                    <div style={{display: "flex", gap: "12px", alignItems: "flex-start"}}>
                      <span style={{background: qrCode ? "#00db8c" : "var(--grad-primary)", color: qrCode ? "#002b1b" : "white", borderRadius: "50%", minWidth: "26px", height: "26px", display: "grid", placeItems: "center", fontWeight: 700, fontSize: "12px"}}>
                        {qrCode ? "✓" : "3"}
                      </span>
                      <span><strong>3. Gerar QR Code:</strong> Clique no botão <em>&quot;Gerar QR Code&quot;</em> ao lado.</span>
                    </div>
                    <div style={{display: "flex", gap: "12px", alignItems: "flex-start"}}>
                      <span style={{background: qrCode ? "#00db8c" : "var(--grad-primary)", color: qrCode ? "#002b1b" : "white", borderRadius: "50%", minWidth: "26px", height: "26px", display: "grid", placeItems: "center", fontWeight: 700, fontSize: "12px"}}>
                        {qrCode ? "✓" : "4"}
                      </span>
                      <span><strong>4. QR Code Gerado:</strong> O sistema gera o código exclusivo para a loja <em>{currentTenantObj?.name}</em>.</span>
                    </div>
                    <div style={{display: "flex", gap: "12px", alignItems: "flex-start"}}>
                      <span style={{background: qrState === "open" ? "#00db8c" : "var(--grad-primary)", color: qrState === "open" ? "#002b1b" : "white", borderRadius: "50%", minWidth: "26px", height: "26px", display: "grid", placeItems: "center", fontWeight: 700, fontSize: "12px"}}>
                        {qrState === "open" ? "✓" : "5"}
                      </span>
                      <span><strong>5. Escaneie no Celular:</strong> No WhatsApp &gt; <em>Aparelhos conectados</em> &gt; <em>Conectar um aparelho</em> e aponte para a tela.</span>
                    </div>
                    <div style={{display: "flex", gap: "12px", alignItems: "flex-start"}}>
                      <span style={{background: qrState === "open" ? "#00db8c" : "#3b3350", color: qrState === "open" ? "#002b1b" : "#888", borderRadius: "50%", minWidth: "26px", height: "26px", display: "grid", placeItems: "center", fontWeight: 800, fontSize: "12px"}}>
                        {qrState === "open" ? "✓" : "6"}
                      </span>
                      <span><strong>6. Pronto!</strong> Status muda para <em>Online</em> e a IA atende seus clientes automaticamente!</span>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* SEÇÃO 2: CONFIGURAR MINHA IA */}
            {activeTab === "conhecimento" && (
              <section className="op-card" style={{display: "flex", flexDirection: "column", gap: "22px"}}>
                <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #372f4d", paddingBottom: "16px", flexWrap: "wrap", gap: "12px"}}>
                  <div style={{display: "flex", alignItems: "center", gap: "14px"}}>
                    <div style={{width: "48px", height: "48px", borderRadius: "14px", background: "var(--grad-primary)", display: "grid", placeItems: "center", boxShadow: "var(--glow-pink)"}}>
                      <Sparkles size={26} color="#fff"/>
                    </div>
                    <div>
                      <h2 style={{margin: 0, fontSize: "20px", color: "#fff"}}>Configurar Minha IA: O que ela vai falar e responder</h2>
                      <small style={{color: "#c2bed4"}}>Você define o nome, a simpatia, os preços e todas as regras do atendimento.</small>
                    </div>
                  </div>
                </div>

                {/* Modelos Prontos por Nicho */}
                <div>
                  <label style={{fontSize: "13px", fontWeight: 700, color: "#ec4899", display: "block", marginBottom: "8px"}}>
                    Modelos Prontos (Clique para preencher automaticamente com exemplos reais):
                  </label>
                  <div style={{display: "flex", gap: "8px", flexWrap: "wrap"}}>
                    {INDUSTRY_PRESETS.map((p, idx) => (
                      <button
                        key={idx}
                        type="button"
                        className="preset-badge"
                        onClick={() => applyPreset(p)}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {aiNotice && (
                  <div style={{padding: "14px 18px", borderRadius: "12px", background: "rgba(10, 46, 32, 0.8)", border: "1px solid #00db8c", color: "#b6f5dd", display: "flex", alignItems: "center", gap: "10px"}}>
                    <CheckCircle2 size={20} color="#00db8c" style={{flexShrink: 0}}/>
                    <span style={{fontSize: "14px"}}>{aiNotice}</span>
                  </div>
                )}

                <form onSubmit={handleSaveAiSettings} style={{display: "flex", flexDirection: "column", gap: "18px"}}>
                  <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px"}}>
                    <div>
                      <label style={{fontSize: "13px", color: "#d1c8e6", display: "block", marginBottom: "6px", fontWeight: 600}}>
                        Nome do seu Assistente Virtual
                      </label>
                      <input
                        style={{width: "100%", padding: "12px 14px", borderRadius: "10px", border: "1px solid #443c5e", background: "#121222", color: "white", fontSize: "14px"}}
                        value={agentLabel}
                        onChange={e => setAgentLabel(e.target.value)}
                        placeholder="Ex.: Bia - Atendente da Bella Pizza"
                        required
                      />
                    </div>

                    <div style={{display: "flex", alignItems: "center", gap: "12px", marginTop: "24px"}}>
                      <label style={{display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", fontSize: "14px", color: "#fff", background: "rgba(236, 72, 153, 0.1)", border: "1px solid rgba(236, 72, 153, 0.3)", padding: "10px 16px", borderRadius: "10px"}}>
                        <input
                          type="checkbox"
                          checked={aiEnabled}
                          onChange={e => setAiEnabled(e.target.checked)}
                          style={{width: "20px", height: "20px", accentColor: "#ec4899"}}
                        />
                        <strong>Respostas automáticas da IA ativadas no WhatsApp</strong>
                      </label>
                    </div>
                  </div>

                  <div>
                    <label style={{fontSize: "13px", color: "#d1c8e6", display: "block", marginBottom: "6px", fontWeight: 600}}>
                      Como a IA deve se comportar (Tom de voz, simpatia e regras)
                    </label>
                    <textarea
                      style={{width: "100%", padding: "12px 14px", borderRadius: "10px", border: "1px solid #443c5e", background: "#121222", color: "white", minHeight: "95px", fontSize: "14px", lineHeight: "1.5"}}
                      value={instructions}
                      onChange={e => setInstructions(e.target.value)}
                      placeholder="Ex.: Você é a atendente virtual da Bella Pizza no WhatsApp. Responda com simpatia, use emojis leves, ajude o cliente a escolher a pizza e incentive o pedido. Seja rápida e clara."
                    />
                  </div>

                  <div>
                    <label style={{fontSize: "13px", color: "#d1c8e6", display: "block", marginBottom: "6px", fontWeight: 600}}>
                      Cardápio, Preços, Horários e Informações da sua Loja (A base de respostas da IA)
                    </label>
                    <textarea
                      style={{width: "100%", padding: "14px", borderRadius: "10px", border: "1px solid #443c5e", background: "#121222", color: "white", minHeight: "220px", fontSize: "14px", lineHeight: "1.6", fontFamily: "monospace"}}
                      value={storeInfo}
                      onChange={e => setStoreInfo(e.target.value)}
                      placeholder="Ex.: 
🍕 CARDÁPIO:
- Pizza Calabresa: R$ 49,90
- Pizza 4 Queijos: R$ 54,90
- Pizza Frango com Catupiry: R$ 52,90
- Refrigerante 2L: R$ 12,00

🕒 HORÁRIO DE ATENDIMENTO:
- Terça a Domingo, das 18h às 23h30

🛵 ENTREGA E PAGAMENTO:
- Taxa de entrega no Centro: R$ 5,00
- Formas de pagamento: Pix (chave: pix@bellapizza.com), Cartão de Crédito e Débito."
                    />
                  </div>

                  <div>
                    <button
                      type="submit"
                      className="op-primary"
                      disabled={savingAi || isSuspended}
                      style={{display: "inline-flex", alignItems: "center", gap: "10px", padding: "14px 28px", fontWeight: 700, fontSize: "15px", borderRadius: "12px"}}
                    >
                      <Save size={18}/> {savingAi ? "Salvando e atualizando IA..." : "Salvar Configurações da Minha IA"}
                    </button>
                  </div>
                </form>
              </section>
            )}

            {/* SEÇÃO NOVO: CHAT DE TESTE (SIMULADOR) */}
            {activeTab === "simulador" && (
              <section className="op-card" style={{display: "flex", flexDirection: "column", gap: "18px", minHeight: "600px"}}>
                <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #372f4d", paddingBottom: "14px", flexWrap: "wrap", gap: "10px"}}>
                  <div style={{display: "flex", alignItems: "center", gap: "12px"}}>
                    <div style={{width: "44px", height: "44px", borderRadius: "12px", background: "var(--grad-primary)", display: "grid", placeItems: "center", boxShadow: "var(--glow-pink)"}}>
                      <Play size={22} color="white"/>
                    </div>
                    <div>
                      <h2 style={{margin: 0, fontSize: "19px", color: "white"}}>Chat de Teste · Simulador da NovaesWeb IA</h2>
                      <small style={{color: "#c2bed4"}}>Simule em tempo real como a IA da sua loja conversa com os clientes sem gastar WhatsApp.</small>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="op-refresh"
                    onClick={() => setSimMessages([{
                      role: "assistant",
                      content: "Chat de teste reiniciado. O que você gostaria de perguntar?",
                      time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
                    }])}
                    style={{fontSize: "12px", padding: "6px 12px"}}
                  >
                    <Trash size={14}/> Limpar Conversa
                  </button>
                </div>

                {/* Perguntas Rápidas */}
                <div>
                  <span style={{fontSize: "12px", color: "#9ca3af", display: "block", marginBottom: "6px", fontWeight: 600}}>
                    Clique para testar perguntas comuns de clientes:
                  </span>
                  <div style={{display: "flex", gap: "8px", flexWrap: "wrap"}}>
                    <button
                      type="button"
                      className="preset-badge"
                      onClick={() => void handleSendSimulator("Quanto custa a pizza grande e quais os sabores?")}
                    >
                      🍕 Quanto custa a pizza grande?
                    </button>
                    <button
                      type="button"
                      className="preset-badge"
                      onClick={() => void handleSendSimulator("Qual é o horário de atendimento de vocês hoje?")}
                    >
                      🕒 Qual o horário de atendimento?
                    </button>
                    <button
                      type="button"
                      className="preset-badge"
                      onClick={() => void handleSendSimulator("Vocês fazem entrega no Centro e aceitam Pix?")}
                    >
                      🛵 Entrega no Centro e aceita Pix?
                    </button>
                    <button
                      type="button"
                      className="preset-badge"
                      onClick={() => void handleSendSimulator("Quero falar com um atendente humano agora")}
                    >
                      👤 Quero falar com um humano
                    </button>
                    <button
                      type="button"
                      className="preset-badge"
                      style={{borderColor: "rgba(239, 68, 68, 0.5)", color: "#fca5a5"}}
                      onClick={() => void handleSendSimulator("Meu pedido está 2 horas atrasado, absurdo, quero cancelamento imediato!")}
                    >
                      🚨 Reclamação: Pedido atrasado / Cancelar
                    </button>
                  </div>
                </div>

                {/* Balões de Conversa do Simulador */}
                <div style={{
                  flex: 1,
                  minHeight: "340px",
                  maxHeight: "440px",
                  overflowY: "auto",
                  padding: "16px",
                  background: "#141022",
                  borderRadius: "14px",
                  border: "1px solid #332b49",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px"
                }}>
                  {simMessages.map((m, idx) => (
                    <div
                      key={idx}
                      style={{
                        maxWidth: "75%",
                        alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                        padding: "12px 16px",
                        borderRadius: "14px",
                        background: m.role === "user" ? "var(--grad-primary)" : m.isEscalation ? "linear-gradient(135deg, #2b141e, #1a0f18)" : "#221c38",
                        border: "1px solid",
                        borderColor: m.role === "user" ? "#ec4899" : m.isEscalation ? "#ef4444" : "#443963",
                        color: "white"
                      }}
                    >
                      {m.isEscalation && (
                        <div style={{
                          background: "rgba(239, 68, 68, 0.2)",
                          border: "1px solid #ef4444",
                          borderRadius: "8px",
                          padding: "6px 10px",
                          marginBottom: "8px",
                          fontSize: "11px",
                          color: "#fca5a5",
                          fontWeight: 700,
                          display: "flex",
                          alignItems: "center",
                          gap: "6px"
                        }}>
                          <ShieldAlert size={14} color="#ef4444" />
                          <span>🚨 INSATISFAÇÃO DETECTADA: {m.escalationReason || "Urgente"} → Transferido para Humano</span>
                        </div>
                      )}
                      <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px", gap: "10px"}}>
                        <strong style={{fontSize: "11px", color: m.role === "user" ? "#fef08a" : m.isEscalation ? "#f87171" : "#ec4899"}}>
                          {m.role === "user" ? "Você (Cliente)" : m.isEscalation ? "🚨 Resposta de Acolhimento & Transição" : "🤖 NovaesWeb IA"}
                        </strong>
                        {m.latency && (
                          <span style={{fontSize: "10px", background: "rgba(0,0,0,0.3)", padding: "1px 6px", borderRadius: "6px", color: "#a78bfa"}}>
                            ⚡ {m.latency}ms
                          </span>
                        )}
                      </div>
                      <p style={{margin: 0, fontSize: "14px", lineHeight: "1.5", whiteSpace: "pre-wrap"}}>{m.content}</p>
                      <small style={{display: "block", fontSize: "10px", color: "rgba(255,255,255,0.5)", textAlign: "right", marginTop: "4px"}}>
                        {m.time}
                      </small>
                    </div>
                  ))}
                  {simLoading && (
                    <div style={{alignSelf: "flex-start", padding: "10px 14px", borderRadius: "12px", background: "#221c38", color: "#ec4899", fontSize: "13px", display: "flex", alignItems: "center", gap: "8px"}}>
                      <RefreshCw size={14} className="spin"/>
                      <span>NovaesWeb IA digitando...</span>
                    </div>
                  )}
                </div>

                {/* Input de Envio do Simulador */}
                <form
                  onSubmit={e => {
                    e.preventDefault();
                    void handleSendSimulator();
                  }}
                  style={{display: "flex", gap: "10px"}}
                >
                  <input
                    type="text"
                    placeholder="Digite uma mensagem como se você fosse seu cliente no WhatsApp..."
                    value={simInput}
                    onChange={e => setSimInput(e.target.value)}
                    disabled={simLoading}
                    style={{
                      flex: 1,
                      padding: "14px 16px",
                      borderRadius: "12px",
                      background: "#161325",
                      border: "1px solid #3d345c",
                      color: "white",
                      fontSize: "14px"
                    }}
                  />
                  <button
                    type="submit"
                    className="op-primary"
                    disabled={simLoading || !simInput.trim()}
                    style={{display: "inline-flex", alignItems: "center", gap: "8px", padding: "14px 22px", borderRadius: "12px", fontWeight: 700}}
                  >
                    <Send size={16}/> Enviar
                  </button>
                </form>
              </section>
            )}

            {/* SEÇÃO NOVO: HORÁRIOS DE ATENDIMENTO */}
            {activeTab === "horarios" && (
              <section className="op-card" style={{display: "flex", flexDirection: "column", gap: "20px"}}>
                <div style={{display: "flex", alignItems: "center", gap: "12px", borderBottom: "1px solid #372f4d", paddingBottom: "14px"}}>
                  <div style={{width: "44px", height: "44px", borderRadius: "12px", background: "var(--grad-primary)", display: "grid", placeItems: "center", boxShadow: "var(--glow-pink)"}}>
                    <Clock size={22} color="white"/>
                  </div>
                  <div>
                    <h2 style={{margin: 0, fontSize: "19px", color: "white"}}>Horários de Atendimento da IA</h2>
                    <small style={{color: "#c2bed4"}}>Configure em quais horários a IA responderá seus clientes e a mensagem enviada fora do expediente.</small>
                  </div>
                </div>

                {hoursNotice && (
                  <div style={{padding: "14px 18px", borderRadius: "12px", background: "rgba(10, 46, 32, 0.8)", border: "1px solid #00db8c", color: "#b6f5dd", display: "flex", alignItems: "center", gap: "10px"}}>
                    <CheckCircle2 size={20} color="#00db8c"/>
                    <span>{hoursNotice}</span>
                  </div>
                )}

                <form onSubmit={handleSaveOperatingHours} style={{display: "flex", flexDirection: "column", gap: "18px"}}>
                  {/* Switch Ativar/Desativar */}
                  <div style={{display: "flex", alignItems: "center", gap: "12px", background: "rgba(255,255,255,0.03)", padding: "14px 18px", borderRadius: "12px", border: "1px solid #3a3250"}}>
                    <input
                      type="checkbox"
                      id="opt-hours-toggle"
                      checked={operatingHours.enabled}
                      onChange={e => setOperatingHours(prev => ({ ...prev, enabled: e.target.checked }))}
                      style={{width: "20px", height: "20px", accentColor: "#ec4899"}}
                    />
                    <label htmlFor="opt-hours-toggle" style={{cursor: "pointer", fontSize: "14px", color: "white", fontWeight: 700}}>
                      Ativar controle de horários de funcionamento (fora deste horário, a IA informa que a loja está fechada)
                    </label>
                  </div>

                  {/* Dias da Semana */}
                  <div>
                    <label style={{fontSize: "13px", color: "#c2bed4", fontWeight: 700, display: "block", marginBottom: "8px"}}>
                      Dias em que a loja funciona:
                    </label>
                    <div style={{display: "flex", gap: "8px", flexWrap: "wrap"}}>
                      {[
                        { id: "seg", label: "Segunda" },
                        { id: "ter", label: "Terça" },
                        { id: "qua", label: "Quarta" },
                        { id: "qui", label: "Quinta" },
                        { id: "sex", label: "Sexta" },
                        { id: "sab", label: "Sábado" },
                        { id: "dom", label: "Domingo" }
                      ].map(d => {
                        const isChecked = operatingHours.days?.includes(d.id);
                        return (
                          <button
                            key={d.id}
                            type="button"
                            onClick={() => {
                              setOperatingHours(prev => {
                                const currentDays = prev.days || [];
                                const nextDays = currentDays.includes(d.id)
                                  ? currentDays.filter(x => x !== d.id)
                                  : [...currentDays, d.id];
                                return { ...prev, days: nextDays };
                              });
                            }}
                            style={{
                              padding: "8px 14px",
                              borderRadius: "10px",
                              border: "1px solid",
                              borderColor: isChecked ? "#ec4899" : "#3e3752",
                              background: isChecked ? "rgba(236, 72, 153, 0.2)" : "#161325",
                              color: isChecked ? "#ec4899" : "#9ca3af",
                              fontSize: "13px",
                              fontWeight: 700,
                              cursor: "pointer"
                            }}
                          >
                            {d.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Horários Abertura e Fechamento */}
                  <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px"}}>
                    <div>
                      <label style={{fontSize: "13px", color: "#c2bed4", display: "block", marginBottom: "6px", fontWeight: 600}}>
                        Horário de Abertura:
                      </label>
                      <input
                        type="time"
                        value={operatingHours.openTime}
                        onChange={e => setOperatingHours(prev => ({ ...prev, openTime: e.target.value }))}
                        style={{width: "100%", padding: "12px", borderRadius: "10px", background: "#161325", border: "1px solid #3d345c", color: "white", fontSize: "14px"}}
                      />
                    </div>
                    <div>
                      <label style={{fontSize: "13px", color: "#c2bed4", display: "block", marginBottom: "6px", fontWeight: 600}}>
                        Horário de Fechamento:
                      </label>
                      <input
                        type="time"
                        value={operatingHours.closeTime}
                        onChange={e => setOperatingHours(prev => ({ ...prev, closeTime: e.target.value }))}
                        style={{width: "100%", padding: "12px", borderRadius: "10px", background: "#161325", border: "1px solid #3d345c", color: "white", fontSize: "14px"}}
                      />
                    </div>
                  </div>

                  {/* Mensagem de Loja Fechada */}
                  <div>
                    <label style={{fontSize: "13px", color: "#c2bed4", display: "block", marginBottom: "6px", fontWeight: 600}}>
                      Mensagem automática enviada quando a loja estiver fechada:
                    </label>
                    <textarea
                      rows={3}
                      value={operatingHours.closedMessage}
                      onChange={e => setOperatingHours(prev => ({ ...prev, closedMessage: e.target.value }))}
                      style={{width: "100%", padding: "12px 14px", borderRadius: "10px", background: "#161325", border: "1px solid #3d345c", color: "white", fontSize: "14px", lineHeight: "1.5"}}
                    />
                  </div>

                  <div>
                    <button
                      type="submit"
                      className="op-primary"
                      disabled={savingHours}
                      style={{display: "inline-flex", alignItems: "center", gap: "8px", padding: "12px 24px", fontWeight: 700, borderRadius: "10px"}}
                    >
                      <Save size={16}/> {savingHours ? "Salvando horários..." : "Salvar Horários de Atendimento"}
                    </button>
                  </div>
                </form>
              </section>
            )}

            {/* SEÇÃO 3: ATENDIMENTOS E CONVERSAS */}
            {activeTab === "atendimentos" && (
              <>
                <section className="op-workspace" style={{minHeight: "620px"}}>
                  {/* Coluna Esquerda: Lista de Conversas */}
                  <aside className="op-card op-inbox" style={{display: "flex", flexDirection: "column"}}>
                    <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px"}}>
                      <h2 style={{margin: 0, fontSize: "18px"}}>Conversas WhatsApp</h2>
                      <span style={{fontSize: "12px", color: "#a59cb8"}}>{filtered.length} listadas</span>
                    </div>

                    <label className="op-search" style={{marginBottom: "10px"}}>
                      <Search size={16}/>
                      <input aria-label="Buscar contato" placeholder="Buscar por nome ou número..." value={search} onChange={e => setSearch(e.target.value)}/>
                    </label>

                    {/* Filtros Rápidos */}
                    <div style={{display: "flex", gap: "6px", marginBottom: "12px", flexWrap: "wrap"}}>
                      <button
                        type="button"
                        onClick={() => setFilterMode("all")}
                        style={{
                          padding: "6px 12px", borderRadius: "14px", border: "1px solid", fontSize: "12px", fontWeight: 600,
                          background: filterMode === "all" ? "var(--grad-primary)" : "transparent",
                          borderColor: filterMode === "all" ? "#ec4899" : "#3e3752",
                          color: "#fff"
                        }}
                      >
                        Todas
                      </button>
                      <button
                        type="button"
                        onClick={() => setFilterMode("ai")}
                        style={{
                          padding: "6px 12px", borderRadius: "14px", border: "1px solid", fontSize: "12px", fontWeight: 600,
                          background: filterMode === "ai" ? "rgba(0, 219, 140, 0.2)" : "transparent",
                          borderColor: filterMode === "ai" ? "#00db8c" : "#3e3752",
                          color: filterMode === "ai" ? "#00db8c" : "#aba8bf"
                        }}
                      >
                        🤖 IA
                      </button>
                      <button
                        type="button"
                        onClick={() => setFilterMode("human")}
                        style={{
                          padding: "6px 12px", borderRadius: "14px", border: "1px solid", fontSize: "12px", fontWeight: 600,
                          background: filterMode === "human" ? "rgba(245, 158, 11, 0.2)" : "transparent",
                          borderColor: filterMode === "human" ? "#f59e0b" : "#3e3752",
                          color: filterMode === "human" ? "#f59e0b" : "#aba8bf"
                        }}
                      >
                        👤 Humano
                      </button>
                      <button
                        type="button"
                        onClick={() => setFilterMode("urgent")}
                        style={{
                          padding: "6px 12px", borderRadius: "14px", border: "1px solid", fontSize: "12px", fontWeight: 700,
                          background: filterMode === "urgent" ? "linear-gradient(135deg, #ef4444, #dc2626)" : "transparent",
                          borderColor: filterMode === "urgent" ? "#ef4444" : "#4a1e28",
                          color: filterMode === "urgent" ? "#fff" : "#fca5a5",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px"
                        }}
                      >
                        <ShieldAlert size={13}/> Reclamações
                        {urgentCount > 0 && (
                          <span style={{
                            background: filterMode === "urgent" ? "rgba(0,0,0,0.3)" : "#ef4444",
                            color: "#fff",
                            fontSize: "10px",
                            padding: "1px 6px",
                            borderRadius: "10px",
                            fontWeight: 800
                          }}>
                            {urgentCount}
                          </span>
                        )}
                      </button>
                    </div>

                    <div className="op-list" style={{flex: 1, overflowY: "auto"}}>
                      {filtered.length ? filtered.map(c => {
                        const contact = byContact.get(c.contact_id);
                        const isSelected = (current?.id === c.id);
                        const isHumanMode = (c.mode === "human");
                        const isUrgent = (c.status === "urgent");
                        const escalation = data?.escalations?.[c.id];
                        return (
                          <button
                            key={c.id}
                            className={isSelected ? "op-contact active" : "op-contact"}
                            onClick={() => setSelected(c.id)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "12px",
                              padding: "12px",
                              borderRadius: "10px",
                              width: "100%",
                              textAlign: "left",
                              border: isUrgent ? "1px solid rgba(239, 68, 68, 0.4)" : undefined,
                              background: isUrgent && !isSelected ? "rgba(239, 68, 68, 0.05)" : undefined
                            }}
                          >
                            <div style={{
                              width: "40px",
                              height: "40px",
                              borderRadius: "50%",
                              background: isUrgent ? "linear-gradient(135deg, #ef4444, #991b1b)" : isHumanMode ? "linear-gradient(135deg, #b45309, #d97706)" : "var(--grad-primary)",
                              boxShadow: isUrgent ? "0 0 10px rgba(239, 68, 68, 0.7)" : "none",
                              display: "grid",
                              placeItems: "center",
                              fontWeight: 700,
                              fontSize: "14px",
                              color: "#fff",
                              flexShrink: 0
                            }}>
                              {(contact?.display_name || contact?.phone || "C").charAt(0).toUpperCase()}
                            </div>
                            <div style={{minWidth: 0, flex: 1}}>
                              <div style={{display: "flex", alignItems: "center", gap: "6px"}}>
                                <strong style={{fontSize: "14px", color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"}}>
                                  {contact?.display_name || contact?.phone || "Contato"}
                                </strong>
                              </div>
                              <span style={{fontSize: "12px", color: "#9ca3af", display: "flex", alignItems: "center", gap: "6px", marginTop: "3px", flexWrap: "wrap"}}>
                                {isUrgent ? (
                                  <span style={{
                                    fontSize: "10px",
                                    padding: "2px 6px",
                                    borderRadius: "6px",
                                    fontWeight: 800,
                                    background: "rgba(239, 68, 68, 0.25)",
                                    color: "#fca5a5",
                                    border: "1px solid #ef4444",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "3px"
                                  }}>
                                    🚨 {escalation?.reason || "URGENTE"}
                                  </span>
                                ) : (
                                  <span style={{
                                    fontSize: "10px",
                                    padding: "2px 6px",
                                    borderRadius: "6px",
                                    fontWeight: 700,
                                    background: isHumanMode ? "rgba(245, 158, 11, 0.2)" : "rgba(0, 219, 140, 0.15)",
                                    color: isHumanMode ? "#f59e0b" : "#00db8c"
                                  }}>
                                    {isHumanMode ? "Humano" : "IA"}
                                  </span>
                                )}
                                <span>{dateTime(c.last_message_at)}</span>
                              </span>
                            </div>
                          </button>
                        );
                      }) : (
                        <div className="op-empty" style={{textAlign: "center", padding: "40px 10px", color: "#8c879b"}}>
                          Nenhuma conversa encontrada nesta loja.
                        </div>
                      )}
                    </div>
                  </aside>

                  {/* Coluna Direita: Mensagens do WhatsApp */}
                  <article className="op-card op-thread" style={{display: "flex", flexDirection: "column"}}>
                    {current ? (
                      <>
                        <div className="op-thread-head" style={{display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", borderBottom: "1px solid #372f4d", paddingBottom: "14px"}}>
                          <div>
                            <strong style={{fontSize: "17px", color: "#fff", display: "block"}}>
                              {byContact.get(current.contact_id)?.display_name || byContact.get(current.contact_id)?.phone || "Contato"}
                            </strong>
                            <span style={{fontSize: "12px", color: "#aba8bf", display: "flex", alignItems: "center", gap: "6px", marginTop: "4px"}}>
                              <span>Status: {current.status}</span>
                              <span>·</span>
                              <span style={{
                                fontSize: "11px",
                                padding: "2px 8px",
                                borderRadius: "10px",
                                fontWeight: 700,
                                background: current.mode === "human" ? "rgba(245, 158, 11, 0.2)" : "rgba(0, 219, 140, 0.15)",
                                color: current.mode === "human" ? "#f59e0b" : "#00db8c"
                              }}>
                                {current.mode === "human" ? "👤 Atendimento Humano Ativo" : "🤖 Atendimento com IA Ativo"}
                              </span>
                            </span>
                          </div>

                          <div>
                            {current.mode === "human" ? (
                              <button
                                type="button"
                                className="op-refresh"
                                style={{background: "rgba(0, 219, 140, 0.15)", color: "#00db8c", borderColor: "#00db8c", fontWeight: 700}}
                                disabled={claiming || loading}
                                onClick={() => void toggleConversationMode(current.id, "ai")}
                              >
                                <Bot size={16}/> {claiming ? "Reativando..." : "Devolver para a IA"}
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="op-refresh"
                                style={{background: "rgba(245, 158, 11, 0.15)", color: "#f59e0b", borderColor: "#f59e0b", fontWeight: 700}}
                                disabled={claiming || loading}
                                onClick={() => void toggleConversationMode(current.id, "human")}
                              >
                                <Users size={16}/> {claiming ? "Assumindo..." : "Assumir Atendimento Humano"}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* ALERTA DE INSATISFAÇÃO / URGÊNCIA */}
                        {current.status === "urgent" && (
                          <div style={{
                            background: "linear-gradient(135deg, rgba(239, 68, 68, 0.22), rgba(185, 28, 28, 0.1))",
                            border: "1px solid rgba(239, 68, 68, 0.5)",
                            borderRadius: "12px",
                            padding: "12px 18px",
                            margin: "14px 0 0",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            flexWrap: "wrap",
                            gap: "10px"
                          }}>
                            <div style={{display: "flex", alignItems: "center", gap: "10px"}}>
                              <div style={{background: "#ef4444", borderRadius: "8px", width: "32px", height: "32px", display: "grid", placeItems: "center", color: "#fff", flexShrink: 0}}>
                                <ShieldAlert size={18} />
                              </div>
                              <div>
                                <strong style={{color: "#fca5a5", fontSize: "13px", display: "block"}}>
                                  🚨 INSATISFAÇÃO DO CLIENTE IDENTIFICADA PELA IA
                                </strong>
                                <span style={{color: "#fee2e2", fontSize: "12px"}}>
                                  Motivo: <strong>{data?.escalations?.[current.id]?.reason || "Reclamação ou Frustração Grave"}</strong>
                                  {" · "}Atendimento pausado pela IA e encaminhado para você resolver com prioridade.
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              className="op-refresh"
                              style={{background: "rgba(239, 68, 68, 0.25)", color: "#fca5a5", borderColor: "#ef4444", fontSize: "12px", fontWeight: 700}}
                              onClick={() => void resolveUrgency(current.id)}
                            >
                              <CheckCircle2 size={14} /> Marcar como Resolvido
                            </button>
                          </div>
                        )}

                        {/* RESUMO ESTRUTURADO DE 3 LINHAS QUANDO ASSUMIDO */}
                        {handoffNotice && (
                          <div style={{
                            background: "linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(217, 119, 6, 0.08))",
                            border: "1px solid rgba(245, 158, 11, 0.4)",
                            borderRadius: "12px",
                            padding: "14px 18px",
                            margin: "14px 0 0"
                          }}>
                            <div style={{color: "#f59e0b", fontSize: "12px", fontWeight: 800, textTransform: "uppercase", display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px"}}>
                              <Users size={15}/> Resumo Inteligente do Atendimento
                            </div>
                            <p style={{margin: 0, color: "#fef3c7", fontSize: "13px", lineHeight: "1.5", whiteSpace: "pre-wrap"}}>
                              {handoffNotice}
                            </p>
                          </div>
                        )}

                        <div className="op-bubbles" style={{flex: 1, overflowY: "auto", padding: "16px 0", display: "flex", flexDirection: "column", gap: "10px"}}>
                          {thread.length ? thread.map(m => (
                            <div
                              key={m.id}
                              className={m.direction === "outbound" ? "op-message sent" : "op-message"}
                              style={{
                                maxWidth: "80%",
                                alignSelf: m.direction === "outbound" ? "flex-end" : "flex-start",
                                padding: "12px 16px",
                                borderRadius: "14px",
                                background: m.direction === "outbound"
                                  ? (m.sender_type === "human" ? "linear-gradient(135deg, #1e3a8a, #2563eb)" : "var(--grad-primary)")
                                  : "#1e1e2f",
                                border: "1px solid",
                                borderColor: m.direction === "outbound"
                                  ? (m.sender_type === "human" ? "#3b82f6" : "#ec4899")
                                  : "#34344e"
                              }}
                            >
                              <span style={{
                                fontSize: "11px",
                                fontWeight: 700,
                                color: m.direction === "outbound" ? "#fff" : "#9ca3af",
                                display: "block",
                                marginBottom: "4px"
                              }}>
                                {m.sender_type === "human" ? "👤 Atendente Humano" : m.sender_type === "agent" ? "🤖 IA NovaesWeb" : "Cliente"}
                              </span>
                              <p style={{margin: 0, fontSize: "14px", lineHeight: "1.5", whiteSpace: "pre-wrap"}}>{m.body}</p>
                              <small style={{display: "block", fontSize: "10px", color: "rgba(255,255,255,0.6)", textAlign: "right", marginTop: "6px"}}>
                                {dateTime(m.created_at)}
                              </small>
                            </div>
                          )) : (
                            <div className="op-empty" style={{textAlign: "center", padding: "40px", color: "#8c879b"}}>
                              Nenhuma mensagem registrada nesta conversa ainda.
                            </div>
                          )}
                        </div>

                        <div className="op-readonly" style={{borderTop: "1px solid #372f4d", paddingTop: "12px", display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "#aba8bf"}}>
                          <ShieldCheck size={16} color="#00db8c"/>
                          <span>Histórico seguro da sua loja. O atendente humano pode assumir e devolver para a IA a qualquer momento.</span>
                        </div>
                      </>
                    ) : (
                      <div className="op-centered op-thread-empty" style={{textAlign: "center", padding: "60px 20px", color: "#8c879b"}}>
                        <MessageSquare size={36} color="#ec4899" style={{margin: "0 auto 12px"}}/>
                        <h2 style={{fontSize: "18px", color: "#fff"}}>Selecione uma conversa</h2>
                        <p style={{fontSize: "13px"}}>As mensagens recebidas no WhatsApp da loja aparecerão aqui em tempo real.</p>
                      </div>
                    )}
                  </article>
                </section>
              </>
            )}

            {/* SEÇÃO 4: CONTATOS */}
            {activeTab === "contatos" && (
              <section className="op-card op-contacts-section" aria-label="Cadastro de contatos">
                <div className="op-contact-heading" style={{display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #372f4d", paddingBottom: "16px", marginBottom: "16px"}}>
                  <div style={{display: "flex", alignItems: "center", gap: "10px"}}>
                    <UserPlus size={24} color="#ec4899"/>
                    <div>
                      <h2 style={{margin: 0, fontSize: "18px"}}>Contatos da Loja</h2>
                      <span style={{fontSize: "12px", color: "#aba8bf"}}>{contacts.length} cadastrados</span>
                    </div>
                  </div>
                  <button className="op-refresh" onClick={() => setNewContactOpen(v => !v)} aria-expanded={newContactOpen}>
                    {newContactOpen ? "Fechar formulário" : "+ Novo Contato"}
                  </button>
                </div>

                {newContactOpen && (
                  <form className="op-contact-form" onSubmit={e => void registerContact(e)} style={{marginBottom: "20px", background: "rgba(0,0,0,0.25)", padding: "18px", borderRadius: "12px"}}>
                    <h3 style={{margin: "0 0 12px", fontSize: "15px"}}>Cadastrar Novo Cliente</h3>
                    <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px", marginBottom: "12px"}}>
                      <label style={{fontSize: "13px", color: "#c2bed4"}}>
                        Nome do Cliente
                        <input
                          type="text"
                          required
                          value={contactName}
                          onChange={e => setContactName(e.target.value)}
                          placeholder="Ex.: Maria Souza"
                          style={{width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white", marginTop: "4px"}}
                        />
                      </label>
                      <label style={{fontSize: "13px", color: "#c2bed4"}}>
                        Telefone (WhatsApp com DDD)
                        <input
                          type="tel"
                          required
                          value={contactPhone}
                          onChange={e => setContactPhone(e.target.value)}
                          placeholder="Ex.: 51988887777"
                          style={{width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white", marginTop: "4px"}}
                        />
                      </label>
                    </div>
                    <button type="submit" className="op-primary" disabled={loading} style={{padding: "10px 20px", fontWeight: 700, borderRadius: "8px"}}>
                      Salvar Contato
                    </button>
                  </form>
                )}

                {contactNotice && (
                  <div style={{padding: "12px 16px", borderRadius: "10px", background: "rgba(10, 46, 32, 0.8)", border: "1px solid #00db8c", color: "#b6f5dd", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px"}}>
                    <CheckCircle2 size={16} color="#00db8c"/>
                    <span>{contactNotice}</span>
                  </div>
                )}

                <div style={{display: "flex", flexDirection: "column", gap: "10px"}}>
                  {contacts.length ? contacts.map(c => (
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
                        gap: "10px"
                      }}
                    >
                      <div style={{display: "flex", alignItems: "center", gap: "12px"}}>
                        <div style={{width: "38px", height: "38px", borderRadius: "50%", background: "var(--grad-primary)", display: "grid", placeItems: "center", fontWeight: 700, fontSize: "14px", color: "white"}}>
                          {(c.display_name || c.phone).charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <strong style={{color: "white", fontSize: "15px", display: "block"}}>{c.display_name || "Sem nome"}</strong>
                          <span style={{color: "#8e87a2", fontSize: "13px"}}>{c.phone}</span>
                        </div>
                      </div>
                      <span style={{fontSize: "12px", color: "#9ca3af"}}>
                        Cadastrado em {dateTime(c.created_at)}
                      </span>
                    </div>
                  )) : (
                    <div style={{textAlign: "center", padding: "40px", color: "#8c879b"}}>
                      Nenhum contato cadastrado ainda.
                    </div>
                  )}
                </div>
              </section>
            )}
          </main>
        </>
      )}
    </div>
  );
}
