"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bot, Building2, ChevronDown, Clock3, LayoutDashboard, LockKeyhole, Menu,
  MessageCircle, RefreshCw, Search, Settings2, ShieldCheck, Smartphone, UsersRound,
  AlertCircle, CheckCircle2, Headphones, BarChart3
} from "lucide-react";

type Msg = { id: string; from: "contact"; text: string; at: string };
type Conversation = { id: string; number: string; name: string; preview: string; updatedAt: string; messages: Msg[] };
type InboxResponse = { conversations: Conversation[]; captureEnabled: boolean; repliesEnabled: boolean };
type StatusResponse = { instance: string | null; channel: "connected"|"disconnected"|"unknown"; captureEnabled: boolean; repliesEnabled: boolean; modelRoute: string|null; fallbackRoutes: string[]; fallbackConfigured: boolean };
type Tab = "Dashboard" | "Atendimentos" | "Contatos" | "Agentes de IA" | "Conexões WhatsApp" | "Relatórios" | "Configurações";

const sections: { name: Tab; icon: typeof MessageCircle }[] = [
  { name: "Dashboard", icon: LayoutDashboard },
  { name: "Atendimentos", icon: MessageCircle },
  { name: "Contatos", icon: UsersRound },
  { name: "Agentes de IA", icon: Bot },
  { name: "Conexões WhatsApp", icon: Smartphone },
  { name: "Relatórios", icon: BarChart3 },
  { name: "Configurações", icon: Settings2 },
];
const displayTime = (value: string) => {
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
};
export default function Dashboard() {
  const [nav, setNav] = useState<Tab>("Dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [token, setToken] = useState("");
  const [access, setAccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<InboxResponse | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const [info, setInfo] = useState("");
  const refresh = useCallback(async (credential: string) => {
    if (!credential) return;
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/crm/inbox", { headers: { "x-crm-lab-admin-token": credential }, cache: "no-store" });
      if (res.status === 401) { setAccess(false); setData(null); setError("Token inválido. Confira CRM_LAB_ADMIN_TOKEN no arquivo local."); return; }
      if (!res.ok) throw new Error("A caixa de entrada está indisponível. Verifique o Redis e a instância configurada.");
      const json = await res.json() as InboxResponse;
      setData(json); setAccess(true);
      try {
        const info = await fetch("/api/crm/status", { headers: { "x-crm-lab-admin-token": credential }, cache: "no-store" });
        setStatus(info.ok ? await info.json() as StatusResponse : null);
      } catch { setStatus(null); }
    } catch (e) { setError(e instanceof Error ? e.message : "Falha de conexão"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    if (!access) return;
    const timer = setInterval(() => { void refresh(token); }, 15000);
    return () => clearInterval(timer);
  }, [access, refresh, token]);
  const conversations = data?.conversations ?? [];
  const filtered = useMemo(() => conversations.filter(c => (c.name + " " + c.number + " " + c.preview).toLowerCase().includes(search.toLowerCase())), [conversations, search]);
  const active = conversations.find(c => c.id === selected) ?? filtered[0] ?? null;
  const title = nav === "Dashboard" ? "Dashboard" : nav;
  const receivedToday = conversations.reduce((total, chat) => total + chat.messages.filter(m => new Date(m.at).toDateString() === new Date().toDateString()).length, 0);
  const cards = [
    { label: "Conversas registradas", value: conversations.length, icon: MessageCircle },
    { label: "Contatos identificados", value: new Set(conversations.map(c => c.number)).size, icon: UsersRound },
    { label: "Mensagens recebidas", value: conversations.reduce((n,c)=>n+c.messages.length,0), icon: Bot },
  ];
  return <div className="app-shell">
    {menuOpen && <button className="mobile-backdrop" aria-label="Fechar menu" onClick={() => setMenuOpen(false)} />}
    <aside className={`sidebar ${menuOpen ? "sidebar--open" : ""}`} aria-label="Navegação principal">
      <div className="brand" role="img" aria-label="NovaesWeb CRM AI">
        <span className="brand-mark">N</span><div><strong>NovaesWeb<span className="brand-star">✦</span></strong><span className="brand-pill">CRM AI</span></div>
      </div>
      <nav className="nav-list">
        {sections.map(({name,icon:Icon}) => <button key={name} className={`nav-item ${nav===name?"active":""}`} onClick={()=>{setNav(name);setMenuOpen(false);setInfo("");}}>
          <Icon size={20}/><span>{name}</span>
        </button>)}
      </nav>
      <div className="sidebar-footer">
        <span className="footer-label">NovaesWeb CRM AI</span>
        <div className="crm-side-status"><ShieldCheck size={17}/> Acesso privado · mensagens sem envio automático</div>
      </div>
    </aside>
    <main className="main-area">
      <header className="topbar">
        <div className="heading-group">
          <button className="icon-button menu-button" onClick={()=>setMenuOpen(true)} aria-label="Abrir menu"><Menu size={22}/></button>
          <div><h1>{title}</h1><p>Informações verificáveis, sem dados fictícios</p></div>
        </div>
        <div className="top-actions">
          <div className="company-button"><Building2 size={18}/> NovaesWeb <ChevronDown size={15}/></div>
          {access && <button className="crm-refresh" disabled={loading} onClick={()=>void refresh(token)}><RefreshCw size={17}/> Atualizar</button>}
        </div>
      </header>
      {!access ? <section className="crm-lock-panel">
        <LockKeyhole size={34}/>
        <h2>Acessar atendimentos reais</h2>
        <p>Informe o token administrativo do CRM para consultar conversas. A chave fica apenas na memória desta aba e não é salva no navegador.</p>
        <form onSubmit={e=>{e.preventDefault(); void refresh(token);}}>
          <input type="password" aria-label="Token administrativo do CRM" autoComplete="off" placeholder="CRM_LAB_ADMIN_TOKEN" value={token} onChange={e=>setToken(e.target.value)} required/>
          <button disabled={loading || !token.trim()} type="submit">{loading?"Conectando...":"Entrar no CRM"}</button>
        </form>
        {error && <p role="alert" className="crm-error"><AlertCircle size={16}/>{error}</p>}
        <p className="crm-note">O token está no arquivo .env.ai-lab do computador. Não compartilhe em mensagens ou capturas de tela.</p>
      </section> : <>
        <div className="crm-status-line">
          <span><CheckCircle2 size={16}/> Caixa de entrada autenticada</span>
          <span>{data?.captureEnabled ? "Recebimento: habilitado" : "Recebimento: não habilitado"}</span>
          <span>{data?.repliesEnabled ? "Respostas automáticas: ativadas" : "Respostas automáticas: desligadas"}</span>
        </div>
        {error && <p role="alert" className="crm-error">{error}</p>}
        {(nav==="Dashboard" || nav==="Atendimentos" || nav==="Contatos") ? <>
          {nav==="Dashboard" && <section className="stats-grid crm-live-stats">
            {cards.map(({label,value,icon:Icon}) => <div className="stat-card" key={label}><div className="stat-icon stat-icon--purple"><Icon size={25}/></div><div className="stat-content"><span className="stat-title">{label}</span><div className="stat-value-row"><strong>{value}</strong></div></div></div>)}
          </section>}
          <section className="crm-live-grid" aria-label="Caixa de Entrada">
            <div className="panel inbox-panel">
              <div className="panel-titlebar"><h2>{nav==="Contatos"?"Contatos":"Caixa de Entrada"}</h2><span className="count-badge">{conversations.length}</span></div>
              <label className="searchbox"><Search size={18}/><input aria-label="Buscar conversas" placeholder="Buscar contato ou número" value={search} onChange={e=>setSearch(e.target.value)}/></label>
              <div className="crm-chat-items">
                {filtered.length===0 ? <div className="crm-empty">Nenhuma conversa real registrada. O CRM não exibirá clientes fictícios.</div> :
                filtered.map(c=><button key={c.id} className={`crm-chat-button ${active?.id===c.id?"crm-chat-button--active":""}`} onClick={()=>setSelected(c.id)}>
                  <span className="crm-contact-avatar">{c.number.slice(-2)}</span>
                  <span><strong>{c.name}</strong><small>{c.preview}</small></span><time>{displayTime(c.updatedAt)}</time>
                </button>)}
              </div>
            </div>
            <div className="panel crm-conversation">
              {active ? <>
                <div className="crm-conversation-top"><div><strong>{active.number}</strong><small>WhatsApp · histórico recebido</small></div><Headphones size={20}/></div>
                <div className="crm-conversation-messages">
                  {active.messages.map((m,i)=><div key={m.id+"-"+i} className="crm-inbound-bubble"><p>{m.text}</p><small>{displayTime(m.at)}</small></div>)}
                </div>
                <div className="crm-readonly"><LockKeyhole size={16}/> Envio humano e transferência serão liberados após validação da segurança.</div>
              </> : <div className="crm-conversation-placeholder"><MessageCircle size={35}/><strong>Selecione uma conversa</strong><span>Aqui aparecem somente mensagens recebidas e registradas de verdade.</span></div>}
            </div>
          </section>
        </> : nav==="Relatórios" ? <section className="crm-details-grid">
          <div className="crm-info-card"><BarChart3 size={26}/><h2>Relatório de mensagens registradas</h2><p>Dados reais da caixa de entrada nos últimos sete dias, limitados aos registros disponíveis no Redis.</p>
            <dl><dt>Conversas registradas</dt><dd>{conversations.length}</dd><dt>Mensagens recebidas hoje</dt><dd>{receivedToday}</dd><dt>Mensagens no histórico atual</dt><dd>{conversations.reduce((n,c)=>n+c.messages.length,0)}</dd></dl>
          </div>
          <div className="crm-info-card"><AlertCircle size={25}/><h2>Limites do relatório</h2><p>Respostas da IA, tempo médio e taxa de resolução ainda não possuem auditoria confiável. Não exibimos números estimados como fatos.</p></div>
        </section> : nav==="Conexões WhatsApp" ? <section className="crm-details-grid">
          <div className="crm-info-card"><Smartphone size={26}/><h2>Evolution API</h2><dl><dt>Instância configurada</dt><dd>{status?.instance ?? "Não informada"}</dd><dt>Estado consultado</dt><dd>{status?.channel === "connected" ? "Conectada" : status?.channel === "disconnected" ? "Desconectada" : "Não confirmado"}</dd><dt>Recebimento de mensagens</dt><dd>{status?.captureEnabled ? "Autorizado no servidor" : "Desligado"}</dd></dl></div>
          <div className="crm-info-card"><ShieldCheck size={25}/><h2>Proteção das instâncias</h2><p>Esta página consulta apenas a instância configurada no CRM. Não desconecta ou altera outros WhatsApps. Webhook real precisa ser validado no Docker.</p></div>
        </section> : nav==="Agentes de IA" ? <section className="crm-details-grid">
          <div className="crm-info-card"><Bot size={26}/><h2>Roteamento de inteligência artificial</h2><dl><dt>Rota principal</dt><dd>{status?.modelRoute ?? "Não configurada"}</dd><dt>Rotas alternativas autorizadas</dt><dd>{status?.fallbackRoutes?.length ? status.fallbackRoutes.join(", ") : "Nenhuma ainda"}</dd><dt>Respostas automáticas</dt><dd>{status?.repliesEnabled ? "Ligadas" : "Desligadas"}</dd></dl></div>
          <div className="crm-info-card"><ShieldCheck size={25}/><h2>Alternância de IA</h2><p>O servidor já aceita rotas alternativas explicitamente configuradas. Cada provedor extra precisará ser conectado e autorizado no OmniRoute. Nenhum provedor pago será ativado por esta tela.</p></div>
        </section> : nav==="Configurações" ? <section className="crm-details-grid">
          <div className="crm-info-card"><Settings2 size={26}/><h2>Segurança operacional</h2><dl><dt>Acesso à caixa de entrada</dt><dd>Token administrativo local</dd><dt>Captura de mensagens</dt><dd>{status?.captureEnabled ? "Ativa" : "Desligada"}</dd><dt>Respostas automáticas</dt><dd>{status?.repliesEnabled ? "Ativas" : "Desligadas"}</dd></dl></div>
          <div className="crm-info-card"><LockKeyhole size={25}/><h2>Configuração protegida</h2><p>Credenciais, parâmetros de privacidade e ativação de canais são gerenciados no servidor. Ainda falta autenticação de operadores por usuário para uso público.</p></div>
        </section> : null}
        <div className="crm-bottom-actions"><button onClick={()=>{setAccess(false);setToken("");setData(null);setStatus(null);setSelected("");}}>Sair do painel</button></div>
      </>}
      {info && <div role="status">{info}</div>}
    </main>
  </div>;
}
