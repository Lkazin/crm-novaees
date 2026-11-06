"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Building2, RefreshCw, ShieldCheck,
  BrainCircuit, AlertCircle, PlusCircle, CheckCircle2, Ban, RotateCcw,
  Calendar, CreditCard, KeyRound, UserCheck, Trash2, Smartphone,
  Search, DollarSign, Users, AlertTriangle, ShieldAlert, LogOut, ChevronRight,
  Zap, Sparkles, Check
} from "lucide-react";

type Client = {
  id: string;
  name: string;
  status: string;
  email: string;
  userId: string | null;
  created_at: string;
  instanceName?: string | null;
  whatsappStatus?: string;
  plan: {
    name: string;
    price: string;
    dueDate: string;
    status: "paid" | "pending";
    autoBlock: boolean;
    isOverdue: boolean;
    quotaLimit?: number;
    quotaUsed?: number;
  };
};

type PlanItem = {
  id: string;
  name: string;
  price: string;
  quotaLimit: number;
  description: string;
  features: string[];
  isPopular?: boolean;
};

const DEFAULT_PLANS: PlanItem[] = [
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

export default function AdminCRM() {
  const [clients, setClients] = useState<Client[]>([]);
  const [plans, setPlans] = useState<PlanItem[]>(DEFAULT_PLANS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "overdue" | "suspended">("all");
  const [currentNav, setCurrentNav] = useState<"clients" | "kpis" | "plans">("clients");

  // Master Authentication
  const [masterKey, setMasterKey] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("crm_admin_token") || "NovaesWeb@2026Admin";
    }
    return "NovaesWeb@2026Admin";
  });
  const [authenticated, setAuthenticated] = useState<boolean>(true);
  const [inputKey, setInputKey] = useState("");

  // Create client form state
  const [storeName, setStoreName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [planName, setPlanName] = useState("CRM Start");
  const [planPrice, setPlanPrice] = useState("149,00");
  const [quotaLimit, setQuotaLimit] = useState(500);
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [paymentStatus, setPaymentStatus] = useState<"paid" | "pending">("paid");
  const [autoBlock, setAutoBlock] = useState(true);
  const [creating, setCreating] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  // Change Plan Modal
  const [changePlanModalOpen, setChangePlanModalOpen] = useState(false);
  const [selectedClientForPlan, setSelectedClientForPlan] = useState<Client | null>(null);
  const [targetPlanToAssign, setTargetPlanToAssign] = useState<PlanItem>(DEFAULT_PLANS[0]);
  const [assigningPlan, setAssigningPlan] = useState(false);

  // Password reset modal state
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetUserId, setResetUserId] = useState("");
  const [resetStoreName, setResetStoreName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetting, setResetting] = useState(false);

  const fetchClients = useCallback(async (keyToUse = masterKey) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/crm/admin/clients", {
        headers: { "x-admin-password": keyToUse },
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
    } catch {
      setError("Falha de comunicação com o servidor.");
    } finally {
      setLoading(false);
    }
  }, [masterKey]);

  const fetchPlans = useCallback(async (keyToUse = masterKey) => {
    try {
      const res = await fetch("/api/crm/admin/plans", {
        headers: { "x-admin-password": keyToUse },
        credentials: "same-origin",
        cache: "no-store"
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.plans)) {
          setPlans(data.plans);
        }
      }
    } catch {}
  }, [masterKey]);

  useEffect(() => {
    void fetchClients();
    void fetchPlans();
  }, [fetchClients, fetchPlans]);

  // KPIs
  const kpis = useMemo(() => {
    const total = clients.length;
    const connected = clients.filter(c => c.whatsappStatus === "connected").length;
    const revenue = clients.reduce((acc, c) => {
      const val = parseFloat(c.plan.price.replace(/\./g, "").replace(",", ".")) || 0;
      return acc + val;
    }, 0);
    const blocked = clients.filter(c => c.status === "suspended" || c.plan.isOverdue).length;
    return { total, connected, revenue, blocked };
  }, [clients]);

  // Client counts per plan
  const planDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of plans) counts[p.name] = 0;
    for (const c of clients) {
      const pName = c.plan.name || "CRM Start";
      counts[pName] = (counts[pName] || 0) + 1;
    }
    return counts;
  }, [plans, clients]);

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

  const handleMasterLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputKey.trim()) return;
    const clean = inputKey.trim();
    localStorage.setItem("crm_admin_token", clean);
    document.cookie = `crm_admin_token=${encodeURIComponent(clean)}; path=/; max-age=2592000; SameSite=Lax`;
    setMasterKey(clean);
    await fetchClients(clean);
    await fetchPlans(clean);
  };

  const handleMasterLogout = () => {
    localStorage.removeItem("crm_admin_token");
    document.cookie = "crm_admin_token=; path=/; max-age=0;";
    setAuthenticated(false);
    setInputKey("");
  };

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/crm/admin/clients", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": masterKey
        },
        body: JSON.stringify({
          storeName,
          email,
          password,
          planName,
          planPrice,
          dueDate,
          paymentStatus,
          autoBlock,
          quotaLimit
        })
      });
      if (!res.ok) {
        const errJson = await res.json();
        setError(errJson.error || "Não foi possível cadastrar o cliente.");
        return;
      }
      setNotice(`Loja "${storeName}" cadastrada com sucesso! Login criado para ${email}.`);
      setStoreName("");
      setEmail("");
      setPassword("");
      setFormOpen(false);
      await fetchClients();
    } catch {
      setError("Falha ao salvar novo cliente.");
    } finally {
      setCreating(false);
    }
  };

  const handleAssignPlan = async () => {
    if (!selectedClientForPlan) return;
    setAssigningPlan(true);
    setError("");
    try {
      const res = await fetch("/api/crm/admin/plans", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": masterKey
        },
        body: JSON.stringify({
          tenantId: selectedClientForPlan.id,
          planName: targetPlanToAssign.name,
          planPrice: targetPlanToAssign.price,
          quotaLimit: targetPlanToAssign.quotaLimit
        })
      });
      if (!res.ok) throw new Error();
      setNotice(`Plano da loja "${selectedClientForPlan.name}" atualizado para ${targetPlanToAssign.name}!`);
      setChangePlanModalOpen(false);
      await fetchClients();
    } catch {
      setError("Falha ao atualizar plano da loja.");
    } finally {
      setAssigningPlan(false);
    }
  };

  const handleToggleBlock = async (client: Client) => {
    const isSuspended = client.status === "suspended";
    const confirmMsg = isSuspended
      ? `Deseja DESBLOQUEAR o painel da loja ${client.name}?`
      : `Deseja BLOQUEAR o painel da loja ${client.name}? O cliente não conseguirá acessar nem a IA responderá.`;
    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await fetch("/api/crm/admin/clients", {
        method: "PATCH",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": masterKey
        },
        body: JSON.stringify({
          tenantId: client.id,
          action: "toggle_block",
          suspend: !isSuspended
        })
      });
      if (!res.ok) throw new Error();
      setNotice(`Status da loja ${client.name} atualizado para ${isSuspended ? "Ativo (Liberado)" : "Bloqueado"}.`);
      await fetchClients();
    } catch {
      setError("Falha ao alterar status de bloqueio.");
    }
  };

  const handleSetPaymentStatus = async (client: Client, newStatus: "paid" | "pending") => {
    try {
      const res = await fetch("/api/crm/admin/clients", {
        method: "PATCH",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": masterKey
        },
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
    if (!window.confirm(`Tem certeza que deseja APAGAR permanentemente a loja "${client.name}" e desconectar a instância WhatsApp dela? Esta ação não pode ser desfeita.`)) return;

    try {
      const res = await fetch(`/api/crm/admin/clients?tenantId=${encodeURIComponent(client.id)}`, {
        method: "DELETE",
        headers: { "x-admin-password": masterKey },
        credentials: "same-origin"
      });
      if (!res.ok) throw new Error();
      setNotice(`Loja "${client.name}" e sua instância apagadas com sucesso.`);
      await fetchClients();
    } catch {
      setError("Falha ao apagar cliente.");
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
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": masterKey
        },
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

  if (!authenticated) {
    return (
      <main className="nw-layout-shell" style={{display: "grid", placeItems: "center", minHeight: "100vh", padding: "20px"}}>
        <div className="op-card" style={{width: "100%", maxWidth: "430px", padding: "38px", border: "1px solid rgba(236, 72, 153, 0.4)", boxShadow: "0 14px 50px rgba(0,0,0,0.6)"}}>
          <div style={{textAlign: "center", marginBottom: "26px"}}>
            <div style={{width: "66px", height: "66px", margin: "0 auto 16px", borderRadius: "18px", background: "var(--grad-primary)", display: "grid", placeItems: "center", boxShadow: "var(--glow-pink)"}}>
              <ShieldCheck size={36} color="white"/>
            </div>
            <h2 style={{color: "white", margin: 0, fontSize: "24px", fontWeight: 800}}>Painel Master NovaesWeb</h2>
            <p style={{color: "#c2bed4", fontSize: "14px", marginTop: "8px"}}>
              Área restrita de SuperAdmin. Digite a senha Master para gerenciar clientes, mensalidades e IAs.
            </p>
          </div>
          <form onSubmit={handleMasterLogin} style={{display: "flex", flexDirection: "column", gap: "16px"}}>
            <input
              type="password"
              placeholder="Senha Master SuperAdmin"
              value={inputKey}
              onChange={e => setInputKey(e.target.value)}
              style={{width: "100%", padding: "14px 16px", borderRadius: "10px", border: "1px solid #574366", background: "#121222", color: "white", fontSize: "15px"}}
              required
            />
            <button type="submit" className="op-primary" style={{width: "100%", padding: "14px", fontWeight: 700, fontSize: "15px", borderRadius: "10px"}}>
              Entrar no Painel Master
            </button>
          </form>
          {error && <p className="op-alert" role="alert" style={{marginTop: "16px"}}><AlertCircle size={16}/>{error}</p>}
        </div>
      </main>
    );
  }

  return (
    <div className="nw-layout-shell">
      {/* MENU LATERAL FIXO MASTER (SIDEBAR) */}
      <aside className="nw-sidebar">
        <div className="nw-sidebar-brand">
          <div className="nw-sidebar-logo">M</div>
          <div>
            <strong style={{display: "block", fontSize: "16px", color: "#fff", letterSpacing: "-0.3px"}}>
              NovaesWeb Master
            </strong>
            <small style={{display: "block", fontSize: "11px", color: "#f43f5e", fontWeight: 800, letterSpacing: "0.5px"}}>
              SUPERADMIN
            </small>
          </div>
        </div>

        {/* Navegação Master */}
        <nav className="nw-sidebar-nav">
          <button
            type="button"
            className={`nw-nav-button ${currentNav === "clients" ? "active" : ""}`}
            onClick={() => setCurrentNav("clients")}
          >
            <Building2 size={19}/>
            <span>Lojas &amp; Clientes</span>
            <span style={{marginLeft: "auto", background: "rgba(255,255,255,0.2)", padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 700}}>
              {clients.length}
            </span>
          </button>

          <button
            type="button"
            className={`nw-nav-button ${currentNav === "plans" ? "active" : ""}`}
            onClick={() => setCurrentNav("plans")}
          >
            <CreditCard size={19}/>
            <span>Planos &amp; Franquias</span>
            <span style={{marginLeft: "auto", background: "rgba(236, 72, 153, 0.2)", color: "#ec4899", padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 700}}>
              {plans.length}
            </span>
          </button>

          <button
            type="button"
            className={`nw-nav-button ${currentNav === "kpis" ? "active" : ""}`}
            onClick={() => setCurrentNav("kpis")}
          >
            <DollarSign size={19}/>
            <span>Faturamento &amp; Métricas</span>
          </button>

          <div style={{height: "1px", background: "rgba(255,255,255,0.08)", margin: "10px 4px"}}/>

          <Link
            href="/admin/ai-providers"
            className="nw-nav-button"
            style={{textDecoration: "none"}}
          >
            <BrainCircuit size={19}/>
            <span>Central de IAs (Provedores)</span>
            <ChevronRight size={14} style={{marginLeft: "auto", opacity: 0.6}}/>
          </Link>
        </nav>

        {/* Rodapé da Sidebar Master */}
        <div className="nw-sidebar-footer">
          <div style={{
            background: "rgba(244, 63, 94, 0.08)",
            border: "1px solid rgba(244, 63, 94, 0.25)",
            borderRadius: "12px",
            padding: "12px 14px",
            fontSize: "12px"
          }}>
            <div style={{display: "flex", alignItems: "center", gap: "8px", color: "#f43f5e", fontWeight: 700, marginBottom: "4px"}}>
              <ShieldCheck size={16}/> Central de Comando
            </div>
            <p style={{margin: 0, color: "#9ca3af", fontSize: "11px", lineHeight: "1.4"}}>
              Os clientes acessam seus painéis sem permissão de ver esta central.
            </p>
          </div>

          <button
            type="button"
            onClick={handleMasterLogout}
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
            <LogOut size={16}/> Sair do Master
          </button>
        </div>
      </aside>

      {/* ÁREA PRINCIPAL MASTER */}
      <main className="nw-main-content">
        {/* Top Header */}
        <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "16px"}}>
          <div>
            <h1 style={{fontSize: "28px", fontWeight: 800, margin: "0 0 6px", letterSpacing: "-0.5px"}}>
              {currentNav === "plans" ? "Planos Comerciais & Franquias de IA" : "Gestão de Clientes e Mensalidades"}
            </h1>
            <p style={{color: "#c2bed4", margin: 0, fontSize: "14px"}}>
              {currentNav === "plans"
                ? "Configure os planos disponíveis, cotas mensais de atendimentos e atribua planos às lojas."
                : "Cadastre lojistas, configure planos, acompanhe pagamentos e controle bloqueios automáticos."}
            </p>
          </div>
          <div style={{display: "flex", gap: "10px"}}>
            {currentNav === "clients" && (
              <button
                className="op-primary"
                style={{display: "flex", alignItems: "center", gap: "8px", padding: "12px 20px", fontWeight: 700, borderRadius: "10px"}}
                onClick={() => setFormOpen(!formOpen)}
              >
                <PlusCircle size={18}/> {formOpen ? "Fechar Formulário" : "+ Novo Cliente"}
              </button>
            )}
            <button className="op-refresh" onClick={() => void fetchClients()} disabled={loading}>
              <RefreshCw size={16}/> Atualizar
            </button>
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
                <strong>Franquia Mensal de Atendimentos:</strong> Cada plano inclui um volume máximo de sessões no WhatsApp (janela de 24h). Isso protege seus custos e profissionaliza a venda do CRM NovaesWeb.
              </div>
            </div>

            {/* Grid dos Planos */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: "24px",
              marginBottom: "36px"
            }}>
              {plans.map(p => {
                const enrolled = planDistribution[p.name] || 0;
                return (
                  <div
                    key={p.id}
                    className="op-card"
                    style={{
                      position: "relative",
                      background: p.isPopular
                        ? "linear-gradient(145deg, #201533, #150f24)"
                        : "linear-gradient(145deg, #181427, #110d1d)",
                      border: p.isPopular ? "2px solid #ec4899" : "1px solid #3d335c",
                      borderRadius: "18px",
                      padding: "26px",
                      display: "flex",
                      flexDirection: "column"
                    }}
                  >
                    {p.isPopular && (
                      <span style={{
                        position: "absolute",
                        top: "-12px",
                        right: "20px",
                        background: "var(--grad-primary)",
                        color: "white",
                        padding: "4px 12px",
                        borderRadius: "20px",
                        fontSize: "11px",
                        fontWeight: 800,
                        boxShadow: "var(--glow-pink)"
                      }}>
                        MAIS VENDIDO
                      </span>
                    )}

                    <div style={{marginBottom: "16px"}}>
                      <h3 style={{fontSize: "22px", fontWeight: 800, margin: "0 0 6px", color: "white"}}>{p.name}</h3>
                      <p style={{fontSize: "13px", color: "#c2bed4", margin: 0, minHeight: "36px"}}>{p.description}</p>
                    </div>

                    <div style={{marginBottom: "20px"}}>
                      <span style={{fontSize: "13px", color: "#9ca3af"}}>R$</span>
                      <strong style={{fontSize: "34px", color: "white", marginLeft: "4px"}}>{p.price}</strong>
                      <span style={{fontSize: "13px", color: "#9ca3af"}}>/mês</span>
                    </div>

                    <div style={{
                      background: "rgba(255,255,255,0.04)",
                      borderRadius: "10px",
                      padding: "10px 14px",
                      marginBottom: "20px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between"
                    }}>
                      <span style={{fontSize: "13px", color: "#e2e8f0", fontWeight: 600}}>
                        Cota de Atendimentos:
                      </span>
                      <strong style={{fontSize: "14px", color: "#ec4899"}}>
                        {p.quotaLimit.toLocaleString("pt-BR")} / mês
                      </strong>
                    </div>

                    <ul style={{listStyle: "none", padding: 0, margin: "0 0 24px", flex: 1, display: "flex", flexDirection: "column", gap: "10px"}}>
                      {p.features.map(f => (
                        <li key={f} style={{display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#d1d5db"}}>
                          <Check size={16} color="#00db8c" style={{flexShrink: 0}}/>
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>

                    <div style={{borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "16px", display: "flex", justifyContent: "space-between", alignItems: "center"}}>
                      <span style={{fontSize: "12px", color: "#9ca3af"}}>
                        Lojas neste plano: <strong style={{color: "white"}}>{enrolled}</strong>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Tabela de Lojas e Seus Planos */}
            <div className="op-card" style={{padding: "24px"}}>
              <h3 style={{fontSize: "18px", fontWeight: 800, margin: "0 0 16px", color: "white"}}>
                Atribuição Rápida de Planos por Loja
              </h3>
              <p style={{fontSize: "13px", color: "#9ca3af", margin: "0 0 16px"}}>
                Alterne o plano ou limite de atendimentos de qualquer cliente com um clique.
              </p>

              <div style={{display: "flex", flexDirection: "column", gap: "12px"}}>
                {clients.map(c => (
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
                        className="op-refresh"
                        style={{fontSize: "12px", padding: "6px 14px", fontWeight: 600}}
                        onClick={() => {
                          setSelectedClientForPlan(c);
                          const currentP = plans.find(p => p.name === c.plan.name) || plans[0];
                          setTargetPlanToAssign(currentP);
                          setChangePlanModalOpen(true);
                        }}
                      >
                        Trocar Plano
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ===================== VIEW: CLIENTES & FATURAMENTO ===================== */}
        {currentNav !== "plans" && (
          <>
            {/* 4 CARDS DE KPI (TOP KPI GRID) */}
            <section className="nw-kpi-grid">
              <div className="nw-kpi-card">
                <div className="nw-kpi-icon" style={{background: "rgba(236, 72, 153, 0.15)", color: "#ec4899"}}>
                  <Building2 size={26}/>
                </div>
                <div>
                  <span style={{fontSize: "13px", color: "#aba8bf", display: "block"}}>Lojas Cadastradas</span>
                  <strong style={{fontSize: "26px", color: "#fff"}}>{kpis.total}</strong>
                </div>
              </div>

              <div className="nw-kpi-card">
                <div className="nw-kpi-icon" style={{background: "rgba(0, 219, 140, 0.15)", color: "#00db8c"}}>
                  <Smartphone size={26}/>
                </div>
                <div>
                  <span style={{fontSize: "13px", color: "#aba8bf", display: "block"}}>WhatsApp Conectados</span>
                  <div style={{display: "flex", alignItems: "center", gap: "8px"}}>
                    <strong style={{fontSize: "26px", color: "#fff"}}>{kpis.connected}</strong>
                    <span className="pulse-online" style={{width: "10px", height: "10px", borderRadius: "50%", background: "#00db8c", display: "inline-block"}}/>
                  </div>
                </div>
              </div>

              <div className="nw-kpi-card">
                <div className="nw-kpi-icon" style={{background: "rgba(139, 92, 246, 0.15)", color: "#8b5cf6"}}>
                  <DollarSign size={26}/>
                </div>
                <div>
                  <span style={{fontSize: "13px", color: "#aba8bf", display: "block"}}>Faturamento Previsto</span>
                  <strong style={{fontSize: "26px", color: "#fff"}}>R$ {kpis.revenue.toFixed(2).replace(".", ",")}</strong>
                </div>
              </div>

              <div className="nw-kpi-card">
                <div className="nw-kpi-icon" style={{background: kpis.blocked > 0 ? "rgba(244, 63, 94, 0.2)" : "rgba(255,255,255,0.05)", color: kpis.blocked > 0 ? "#f43f5e" : "#8e87a2"}}>
                  <AlertTriangle size={26}/>
                </div>
                <div>
                  <span style={{fontSize: "13px", color: "#aba8bf", display: "block"}}>Pendentes / Bloqueados</span>
                  <strong style={{fontSize: "26px", color: kpis.blocked > 0 ? "#f43f5e" : "#fff"}}>{kpis.blocked}</strong>
                </div>
              </div>
            </section>

            {/* FORMULÁRIO RETRÁTIL: CRIAR CLIENTE */}
            {formOpen && (
              <section className="op-card" style={{marginBottom: "24px", borderColor: "rgba(236, 72, 153, 0.5)", boxShadow: "0 10px 40px rgba(236, 72, 153, 0.2)"}}>
                <div style={{display: "flex", alignItems: "center", gap: "12px", borderBottom: "1px solid #3d344f", paddingBottom: "14px", marginBottom: "16px"}}>
                  <PlusCircle size={24} color="#ec4899"/>
                  <h2 style={{margin: 0, fontSize: "19px"}}>Cadastrar Novo Cliente com Acesso e Plano</h2>
                </div>

                {/* Seleção Rápida de Planos Pré-Configurados */}
                <div style={{marginBottom: "16px"}}>
                  <label style={{display: "block", fontSize: "13px", color: "#c2bed4", marginBottom: "8px", fontWeight: 700}}>
                    Escolha Rápida do Plano Comercial:
                  </label>
                  <div style={{display: "flex", gap: "10px", flexWrap: "wrap"}}>
                    {plans.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setPlanName(p.name);
                          setPlanPrice(p.price);
                          setQuotaLimit(p.quotaLimit);
                        }}
                        style={{
                          padding: "8px 14px",
                          borderRadius: "10px",
                          border: "1px solid",
                          borderColor: planName === p.name ? "#ec4899" : "#3d344f",
                          background: planName === p.name ? "rgba(236, 72, 153, 0.2)" : "#161325",
                          color: planName === p.name ? "#ec4899" : "#d1d5db",
                          fontSize: "13px",
                          fontWeight: 700,
                          cursor: "pointer"
                        }}
                      >
                        {p.name} (R$ {p.price} · {p.quotaLimit} atend.)
                      </button>
                    ))}
                  </div>
                </div>
                
                <form onSubmit={handleCreateClient} style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "14px"}}>
                  <div>
                    <label style={{fontSize: "13px", color: "var(--muted)", display: "block", marginBottom: "4px"}}>Nome da Loja / Empresa</label>
                    <input
                      style={{width: "100%", padding: "11px 14px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white"}}
                      required
                      value={storeName}
                      onChange={e => setStoreName(e.target.value)}
                      placeholder="Ex.: Bella Pizza"
                    />
                  </div>

                  <div>
                    <label style={{fontSize: "13px", color: "var(--muted)", display: "block", marginBottom: "4px"}}>E-mail de Login do Cliente</label>
                    <input
                      type="email"
                      style={{width: "100%", padding: "11px 14px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white"}}
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="Ex.: contato@bellapizza.com"
                    />
                  </div>

                  <div>
                    <label style={{fontSize: "13px", color: "var(--muted)", display: "block", marginBottom: "4px"}}>Senha de Acesso Inicial</label>
                    <input
                      type="password"
                      style={{width: "100%", padding: "11px 14px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white"}}
                      required
                      minLength={6}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Mínimo 6 dígitos"
                    />
                  </div>

                  <div>
                    <label style={{fontSize: "13px", color: "var(--muted)", display: "block", marginBottom: "4px"}}>Nome do Plano</label>
                    <input
                      style={{width: "100%", padding: "11px 14px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white"}}
                      value={planName}
                      onChange={e => setPlanName(e.target.value)}
                      placeholder="Ex.: CRM Start"
                    />
                  </div>

                  <div>
                    <label style={{fontSize: "13px", color: "var(--muted)", display: "block", marginBottom: "4px"}}>Valor Mensal (R$)</label>
                    <input
                      style={{width: "100%", padding: "11px 14px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white"}}
                      value={planPrice}
                      onChange={e => setPlanPrice(e.target.value)}
                      placeholder="149,00"
                    />
                  </div>

                  <div>
                    <label style={{fontSize: "13px", color: "var(--muted)", display: "block", marginBottom: "4px"}}>Data do Vencimento</label>
                    <input
                      type="date"
                      style={{width: "100%", padding: "11px 14px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white"}}
                      required
                      value={dueDate}
                      onChange={e => setDueDate(e.target.value)}
                    />
                  </div>

                  <div>
                    <label style={{fontSize: "13px", color: "var(--muted)", display: "block", marginBottom: "4px"}}>Status Inicial do Pagamento</label>
                    <select
                      style={{width: "100%", padding: "11px 14px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white"}}
                      value={paymentStatus}
                      onChange={e => setPaymentStatus(e.target.value as "paid" | "pending")}
                    >
                      <option value="paid">Pago (Painel Liberado)</option>
                      <option value="pending">Pendente</option>
                    </select>
                  </div>

                  <div style={{display: "flex", alignItems: "center", gap: "10px", marginTop: "24px"}}>
                    <label style={{display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "14px", color: "#ddd"}}>
                      <input
                        type="checkbox"
                        checked={autoBlock}
                        onChange={e => setAutoBlock(e.target.checked)}
                        style={{width: "18px", height: "18px", accentColor: "#ec4899"}}
                      />
                      Bloquear automaticamente se vencer e não estiver pago
                    </label>
                  </div>

                  <div style={{gridColumn: "1 / -1", marginTop: "10px"}}>
                    <button
                      type="submit"
                      className="op-primary"
                      disabled={creating}
                      style={{display: "flex", alignItems: "center", gap: "8px", padding: "12px 24px", fontWeight: 700}}
                    >
                      <PlusCircle size={18}/> {creating ? "Cadastrando cliente..." : "Cadastrar Cliente & Ativar Acesso"}
                    </button>
                  </div>
                </form>
              </section>
            )}

            {/* BARRA DE PESQUISA E FILTROS */}
            <div style={{display: "flex", gap: "12px", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", marginBottom: "20px"}}>
              <div style={{position: "relative", flex: 1, minWidth: "260px", maxWidth: "420px"}}>
                <Search size={18} style={{position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "#8e87a2"}}/>
                <input
                  type="text"
                  placeholder="Buscar por nome da loja ou e-mail..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "11px 14px 11px 42px",
                    borderRadius: "10px",
                    border: "1px solid #3d344f",
                    background: "#121222",
                    color: "white",
                    fontSize: "14px"
                  }}
                />
              </div>

              <div style={{display: "flex", gap: "8px", flexWrap: "wrap"}}>
                <button
                  onClick={() => setFilterStatus("all")}
                  style={{
                    padding: "8px 14px", borderRadius: "10px", border: "1px solid", fontSize: "13px", fontWeight: 600,
                    background: filterStatus === "all" ? "var(--grad-primary)" : "#161325",
                    borderColor: filterStatus === "all" ? "#ec4899" : "#3d344f",
                    color: "white"
                  }}
                >
                  Todos ({clients.length})
                </button>
                <button
                  onClick={() => setFilterStatus("active")}
                  style={{
                    padding: "8px 14px", borderRadius: "10px", border: "1px solid", fontSize: "13px", fontWeight: 600,
                    background: filterStatus === "active" ? "rgba(0, 219, 140, 0.25)" : "#161325",
                    borderColor: filterStatus === "active" ? "#00db8c" : "#3d344f",
                    color: filterStatus === "active" ? "#00db8c" : "white"
                  }}
                >
                  Ativos ({clients.filter(c => c.status === "active" && !c.plan.isOverdue).length})
                </button>
                <button
                  onClick={() => setFilterStatus("overdue")}
                  style={{
                    padding: "8px 14px", borderRadius: "10px", border: "1px solid", fontSize: "13px", fontWeight: 600,
                    background: filterStatus === "overdue" ? "rgba(245, 158, 11, 0.25)" : "#161325",
                    borderColor: filterStatus === "overdue" ? "#f59e0b" : "#3d344f",
                    color: filterStatus === "overdue" ? "#f59e0b" : "white"
                  }}
                >
                  Vencidos ({clients.filter(c => c.plan.isOverdue).length})
                </button>
                <button
                  onClick={() => setFilterStatus("suspended")}
                  style={{
                    padding: "8px 14px", borderRadius: "10px", border: "1px solid", fontSize: "13px", fontWeight: 600,
                    background: filterStatus === "suspended" ? "rgba(244, 63, 94, 0.25)" : "#161325",
                    borderColor: filterStatus === "suspended" ? "#f43f5e" : "#3d344f",
                    color: filterStatus === "suspended" ? "#f43f5e" : "white"
                  }}
                >
                  Bloqueados ({clients.filter(c => c.status === "suspended").length})
                </button>
              </div>
            </div>

            {/* LISTAGEM DE CLIENTES (CARDS MODERNOS) */}
            <section style={{display: "flex", flexDirection: "column", gap: "16px"}}>
              {filteredClients.length ? (
                filteredClients.map(client => {
                  const isOverdue = client.plan.isOverdue;
                  const isSuspended = client.status === "suspended";
                  const isPaid = client.plan.status === "paid";

                  return (
                    <div
                      key={client.id}
                      className="op-card"
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: "18px",
                        borderLeft: `5px solid ${isSuspended ? "#f43f5e" : isOverdue ? "#f59e0b" : "#00db8c"}`,
                        background: "linear-gradient(135deg, rgba(26, 22, 41, 0.7), rgba(17, 19, 31, 0.85))"
                      }}
                    >
                      {/* Info da Loja */}
                      <div style={{display: "flex", alignItems: "center", gap: "16px", minWidth: "240px"}}>
                        <div style={{
                          width: "48px",
                          height: "48px",
                          borderRadius: "14px",
                          background: isSuspended ? "linear-gradient(135deg, #7f1d1d, #991b1b)" : "var(--grad-primary)",
                          display: "grid",
                          placeItems: "center",
                          fontWeight: 800,
                          fontSize: "20px",
                          color: "white",
                          flexShrink: 0
                        }}>
                          {client.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap"}}>
                            <strong style={{fontSize: "17px", color: "white"}}>{client.name}</strong>
                            {isSuspended ? (
                              <span style={{fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "10px", background: "rgba(244, 63, 94, 0.2)", color: "#f43f5e"}}>
                                Bloqueado
                              </span>
                            ) : isOverdue ? (
                              <span style={{fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "10px", background: "rgba(245, 158, 11, 0.2)", color: "#f59e0b"}}>
                                Vencido
                              </span>
                            ) : (
                              <span style={{fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "10px", background: "rgba(0, 219, 140, 0.2)", color: "#00db8c"}}>
                                Ativo
                              </span>
                            )}
                          </div>
                          <small style={{color: "#aba8bf", display: "block", marginTop: "2px"}}>
                            Login: <strong>{client.email}</strong>
                          </small>
                          <small style={{color: "#8e87a2", fontSize: "11px"}}>
                            Instância: <code>{client.instanceName || "não conectada"}</code> · WhatsApp: {client.whatsappStatus === "connected" ? "🟢 Conectado" : "⚪ Desconectado"}
                          </small>
                        </div>
                      </div>

                      {/* Informações de Plano e Vencimento */}
                      <div style={{display: "flex", gap: "20px", alignItems: "center", flexWrap: "wrap"}}>
                        <div>
                          <small style={{display: "block", fontSize: "11px", color: "#aba8bf", textTransform: "uppercase", fontWeight: 700}}>
                            Plano &amp; Valor
                          </small>
                          <strong style={{fontSize: "15px", color: "white"}}>
                            {client.plan.name}
                          </strong>
                          <span style={{display: "block", fontSize: "13px", color: "#c084fc", fontWeight: 700}}>
                            R$ {client.plan.price}/mês
                          </span>
                        </div>

                        <div>
                          <small style={{display: "block", fontSize: "11px", color: "#aba8bf", textTransform: "uppercase", fontWeight: 700}}>
                            Vencimento
                          </small>
                          <strong style={{fontSize: "14px", color: isOverdue ? "#f43f5e" : "white"}}>
                            {client.plan.dueDate ? new Date(client.plan.dueDate).toLocaleDateString("pt-BR") : "—"}
                          </strong>
                          <div style={{display: "flex", alignItems: "center", gap: "6px", marginTop: "2px"}}>
                            <span style={{
                              fontSize: "11px",
                              fontWeight: 700,
                              padding: "2px 6px",
                              borderRadius: "6px",
                              background: isPaid ? "rgba(0, 219, 140, 0.15)" : "rgba(244, 63, 94, 0.15)",
                              color: isPaid ? "#00db8c" : "#f43f5e"
                            }}>
                              {isPaid ? "Pago" : "Pendente"}
                            </span>
                            {client.plan.autoBlock && (
                              <span title="Bloqueio automático ativado" style={{fontSize: "11px", color: "#a59cb8"}}>
                                🔒 Auto
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Botões de Ação */}
                      <div style={{display: "flex", gap: "8px", flexWrap: "wrap"}}>
                        {/* Botão Trocar Plano */}
                        <button
                          className="op-refresh"
                          style={{fontSize: "12px", padding: "8px 12px"}}
                          onClick={() => {
                            setSelectedClientForPlan(client);
                            const cur = plans.find(p => p.name === client.plan.name) || plans[0];
                            setTargetPlanToAssign(cur);
                            setChangePlanModalOpen(true);
                          }}
                        >
                          <CreditCard size={14}/> Plano
                        </button>

                        {/* Botão Marcar Pago / Pendente */}
                        {isPaid ? (
                          <button
                            className="op-refresh"
                            style={{fontSize: "12px", padding: "8px 12px", background: "rgba(245, 158, 11, 0.1)", color: "#f59e0b", borderColor: "rgba(245, 158, 11, 0.3)"}}
                            onClick={() => void handleSetPaymentStatus(client, "pending")}
                          >
                            Marcar Pendente
                          </button>
                        ) : (
                          <button
                            className="op-refresh"
                            style={{fontSize: "12px", padding: "8px 12px", background: "rgba(0, 219, 140, 0.15)", color: "#00db8c", borderColor: "#00db8c", fontWeight: 700}}
                            onClick={() => void handleSetPaymentStatus(client, "paid")}
                          >
                            <CheckCircle2 size={14}/> Marcar Pago
                          </button>
                        )}

                        {/* Botão Bloquear / Desbloquear */}
                        <button
                          className="op-refresh"
                          style={{
                            fontSize: "12px", padding: "8px 12px",
                            background: isSuspended ? "rgba(0, 219, 140, 0.15)" : "rgba(244, 63, 94, 0.15)",
                            color: isSuspended ? "#00db8c" : "#f43f5e",
                            borderColor: isSuspended ? "#00db8c" : "#f43f5e",
                            fontWeight: 700
                          }}
                          onClick={() => void handleToggleBlock(client)}
                        >
                          {isSuspended ? <RotateCcw size={14}/> : <Ban size={14}/>}
                          {isSuspended ? "Desbloquear" : "Bloquear"}
                        </button>

                        {/* Botão Alterar Senha */}
                        <button
                          className="op-refresh"
                          style={{fontSize: "12px", padding: "8px 12px"}}
                          onClick={() => {
                            setResetUserId(client.userId || client.id);
                            setResetStoreName(client.name);
                            setResetModalOpen(true);
                          }}
                        >
                          <KeyRound size={14}/> Senha
                        </button>

                        {/* Botão Apagar Loja */}
                        <button
                          className="op-refresh"
                          style={{fontSize: "12px", padding: "8px 12px", background: "#2e1218", color: "#ff859a", borderColor: "#f43f5e"}}
                          onClick={() => void handleDeleteClient(client)}
                          title="Apagar loja e instância"
                        >
                          <Trash2 size={14}/> Apagar
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="op-card" style={{textAlign: "center", padding: "50px 20px", color: "#8e87a2"}}>
                  <Building2 size={36} color="#ec4899" style={{margin: "0 auto 12px"}}/>
                  <h3>Nenhuma loja encontrada</h3>
                  <p>Cadastre seu primeiro cliente clicando em &quot;+ Novo Cliente&quot; acima.</p>
                </div>
              )}
            </section>
          </>
        )}

        {/* MODAL: TROCAR PLANO DO CLIENTE */}
        {changePlanModalOpen && selectedClientForPlan && (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
            display: "grid", placeItems: "center", zIndex: 100, padding: "20px"
          }}>
            <div className="op-card" style={{width: "100%", maxWidth: "460px", padding: "28px", borderColor: "#ec4899"}}>
              <div style={{display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px"}}>
                <CreditCard size={22} color="#ec4899"/>
                <h3 style={{margin: 0, fontSize: "18px"}}>Alterar Plano da Loja</h3>
              </div>
              <p style={{fontSize: "13px", color: "#c2bed4", marginTop: 0}}>
                Selecione o novo plano comercial para a loja <strong>{selectedClientForPlan.name}</strong>:
              </p>

              <div style={{display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px"}}>
                {plans.map(p => (
                  <div
                    key={p.id}
                    onClick={() => setTargetPlanToAssign(p)}
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
                      <small style={{color: "#9ca3af"}}>{p.quotaLimit.toLocaleString("pt-BR")} atendimentos/mês</small>
                    </div>
                    <strong style={{color: "#ec4899"}}>R$ {p.price}/mês</strong>
                  </div>
                ))}
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

        {/* MODAL: REDEFINIR SENHA DO CLIENTE */}
        {resetModalOpen && (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
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
      </main>
    </div>
  );
}
