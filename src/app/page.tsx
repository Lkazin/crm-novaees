"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bot, Building2, ChevronDown, LayoutDashboard, LockKeyhole, Menu,
  MessageCircle, RefreshCw, Search, Settings2, ShieldCheck, Smartphone, UsersRound,
  AlertCircle, CheckCircle2, Headphones, BarChart3, ClipboardCheck,
  BookOpen, Users, Megaphone, Workflow, QrCode, Sparkles
} from "lucide-react";

type Msg = { id: string; from: "contact"; text: string; at: string };
type Conversation = { id: string; number: string; name: string; preview: string; updatedAt: string; messages: Msg[] };
type InboxResponse = { conversations: Conversation[]; captureEnabled: boolean; repliesEnabled: boolean };
type StatusResponse = { instance: string | null; channel: "connected"|"disconnected"|"unknown"; captureEnabled: boolean; repliesEnabled: boolean; modelRoute: string|null; fallbackRoutes: string[]; fallbackConfigured: boolean; webhook: "configured"|"absent"|"unknown"; webhookSecretHeader: "present"|"absent"|"unknown" };
type Tab = "Dashboard" | "Atendimentos" | "Contatos" | "Agentes de IA" | "Conexões WhatsApp" | "Relatórios" | "Configurações" | "Preparação" | "Base de Conhecimento" | "Equipe" | "Campanhas" | "Automações";

const sections: { name: Tab; icon: typeof MessageCircle }[] = [
  { name: "Dashboard", icon: LayoutDashboard },
  { name: "Atendimentos", icon: MessageCircle },
  { name: "Contatos", icon: UsersRound },
  { name: "Agentes de IA", icon: Bot },
  { name: "Conexões WhatsApp", icon: Smartphone },
  { name: "Base de Conhecimento", icon: BookOpen },
  { name: "Equipe", icon: Users },
  { name: "Campanhas", icon: Megaphone },
  { name: "Automações", icon: Workflow },
  { name: "Relatórios", icon: BarChart3 },
  { name: "Configurações", icon: Settings2 },
  { name: "Preparação", icon: ClipboardCheck },
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

  // WhatsApp QR Code state
  const [qrInstance, setQrInstance] = useState("novaesweb-ia-teste");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrState, setQrState] = useState<"disconnected" | "connecting" | "open">("disconnected");
  const [qrMessage, setQrMessage] = useState("");

  const refresh = useCallback(async (credential: string) => {
    if (!credential) return;
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/crm/inbox", { headers: { "x-crm-lab-admin-token": credential }, cache: "no-store" });
      if (res.status === 401) {
        setAccess(false); setData(null);
        setError("Senha ou token incorreto. Use sua senha administrativa.");
        return;
      }
      if (!res.ok) throw new Error("A caixa de entrada está temporariamente indisponível.");
      const json = await res.json() as InboxResponse;
      setData(json); setAccess(true);
      if (typeof window !== "undefined") {
        sessionStorage.setItem("crm_lab_admin_token", credential);
      }
      try {
        const infoRes = await fetch("/api/crm/status", { headers: { "x-crm-lab-admin-token": credential }, cache: "no-store" });
        if (infoRes.ok) {
          const s = await infoRes.json() as StatusResponse;
          setStatus(s);
          if (s.channel === "connected") setQrState("open");
        }
      } catch { setStatus(null); }
    } catch (e) { setError(e instanceof Error ? e.message : "Falha de conexão com o servidor local."); }
    finally { setLoading(false); }
  }, []);

  // Restore saved token from session
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem("crm_lab_admin_token");
      if (saved) {
        setToken(saved);
        void refresh(saved);
      }
    }
  }, [refresh]);

  useEffect(() => {
    if (!access) return;
    const timer = setInterval(() => { void refresh(token); }, 20000);
    return () => clearInterval(timer);
  }, [access, refresh, token]);

  // WhatsApp Connect / QR Code generator
  const handleGenerateQr = async () => {
    setQrLoading(true);
    setQrMessage("Gerando instância e solicitando QR Code...");
    try {
      const res = await fetch("/api/crm/whatsapp/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceName: qrInstance })
      });
      const json = await res.json();
      if (json.connected || json.state === "open") {
        setQrState("open");
        setQrCode(null);
        setQrMessage("WhatsApp já está conectado com sucesso!");
      } else if (json.qrcode) {
        setQrCode(json.qrcode);
        setQrState("connecting");
        setQrMessage("QR Code gerado com sucesso! Aponte seu WhatsApp para conectar.");
      } else {
        setQrMessage(json.error || "Instância criada. Aguardando QR Code...");
      }
    } catch {
      setQrMessage("Falha ao comunicar com a Evolution API.");
    } finally {
      setQrLoading(false);
    }
  };

  // Poll connection state when connecting
  useEffect(() => {
    if (qrState !== "connecting") return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/crm/whatsapp/status?instance=${encodeURIComponent(qrInstance)}`, { cache: "no-store" });
        if (res.ok) {
          const s = await res.json();
          if (s.connected || s.state === "open") {
            setQrState("open");
            setQrCode(null);
            setQrMessage("WhatsApp Conectado com Sucesso! A IA de atendimento já está ativa.");
            clearInterval(timer);
          }
        }
      } catch {}
    }, 3000);
    return () => clearInterval(timer);
  }, [qrState, qrInstance]);

  const conversations = useMemo(()=>data?.conversations??[],[data]);
  const filtered = useMemo(() => conversations.filter(c => (c.name + " " + c.number + " " + c.preview).toLowerCase().includes(search.toLowerCase())), [conversations, search]);
  const active = conversations.find(c => c.id === selected) ?? filtered[0] ?? null;
  const title = nav === "Dashboard" ? "Dashboard" : nav;
  const receivedToday = conversations.reduce((total, chat) => total + chat.messages.filter(m => new Date(m.at).toDateString() === new Date().toDateString()).length, 0);
  const cards = [
    { label: "Conversas registradas", value: conversations.length, icon: MessageCircle },
    { label: "Contatos identificados", value: new Set(conversations.map(c => c.number)).size, icon: UsersRound },
    { label: "Mensagens recebidas", value: conversations.reduce((n,c)=>n+c.messages.length,0), icon: Bot },
  ];

  const handleLogout = () => {
    setAccess(false);
    setToken("");
    setData(null);
    setStatus(null);
    setSelected("");
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("crm_lab_admin_token");
    }
  };

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
        <div className="crm-side-status"><ShieldCheck size={17}/> Acesso Master Seguro</div>
      </div>
    </aside>
    <main className="main-area">
      <header className="topbar">
        <div className="heading-group">
          <button className="icon-button menu-button" onClick={()=>setMenuOpen(true)} aria-label="Abrir menu"><Menu size={22}/></button>
          <div><h1>{title}</h1><p>Painel Master · Central de Atendimentos e IA</p></div>
        </div>
        <div className="top-actions">
          <Link href="/operator" className="crm-operator-entry"><UsersRound size={16}/> Painel do Cliente / Operador</Link>
          <Link href="/admin" className="crm-operator-entry"><Building2 size={16}/> Gerenciar Lojas</Link>
          <div className="company-button"><Building2 size={18}/> NovaesWeb <ChevronDown size={15}/></div>
          {access && <button className="crm-refresh" disabled={loading} onClick={()=>void refresh(token)}><RefreshCw size={17}/> Atualizar</button>}
        </div>
      </header>
      {!access ? <section className="crm-lock-panel">
        <LockKeyhole size={34}/>
        <h2>Acessar Painel Master</h2>
        <p>Informe a senha administrativa ou token do CRM para consultar conversas e gerenciar a IA.</p>
        <form onSubmit={e=>{e.preventDefault(); void refresh(token);}}>
          <input type="password" aria-label="Senha administrativa do CRM" autoComplete="current-password" placeholder="��������" value={token} onChange={e=>setToken(e.target.value)} required/>
          <button disabled={loading || !token.trim()} type="submit">{loading?"Autenticando...":"Entrar no Painel"}</button>
        </form>
        {error && <p role="alert" className="crm-error"><AlertCircle size={16}/>{error}</p>}
        <p className="crm-note">Acesso restrito ao administrador do sistema NovaesWeb.</p>
      </section> : <>
        <div className="crm-status-line">
          <span><CheckCircle2 size={16}/> Painel Master Autenticado</span>
          <span>{data?.captureEnabled ? "Recebimento: habilitado" : "Recebimento: desativado"}</span>
          <span>{data?.repliesEnabled ? "Respostas automáticas (IA): ativadas" : "Respostas automáticas (IA): desligadas"}</span>
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
                {filtered.length===0 ? <div className="crm-empty">Nenhuma conversa registrada ainda. Envie uma mensagem no WhatsApp conectado para testar.</div> :
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
                <div className="crm-readonly"><CheckCircle2 size={16}/> Resposta da IA processada via OmniRoute (Groq Llama 3.3 70B).</div>
              </> : <div className="crm-conversation-placeholder"><MessageCircle size={35}/><strong>Selecione uma conversa</strong><span>Aqui aparecem as mensagens reais recebidas e respondidas pela IA.</span></div>}
            </div>
          </section>
        </> : nav==="Conexões WhatsApp" ? <section className="crm-details-grid">
          <div className="crm-info-card">
            <Smartphone size={28}/>
            <h2>Conexão WhatsApp (Evolution API)</h2>
            <p>Conecte o número de WhatsApp escaneando o QR Code na tela. O fluxo é 100% automático.</p>
            
            <div style={{marginTop: "12px", display: "flex", flexDirection: "column", gap: "10px"}}>
              <label style={{fontSize: "13px", color: "var(--muted)"}}>Nome da Instância</label>
              <input
                style={{padding: "10px 14px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white"}}
                value={qrInstance}
                onChange={e=>setQrInstance(e.target.value)}
                placeholder="Ex.: novaesweb-ia-teste"
              />
              <button
                className="crm-refresh"
                style={{background: "#7920dd", fontWeight: 700, justifyContent: "center"}}
                disabled={qrLoading || !qrInstance.trim()}
                onClick={handleGenerateQr}
              >
                <QrCode size={18}/> {qrLoading ? "Gerando..." : "Gerar QR Code"}
              </button>
            </div>

            {qrMessage && <p style={{fontSize: "13px", color: qrState==="open" ? "#00db8c" : "#e0d4fa", margin: "10px 0 0"}}>{qrMessage}</p>}

            {qrState === "open" && (
              <div style={{padding: "14px", background: "#0a2b1f", border: "1px solid #00db8c", borderRadius: "10px", marginTop: "12px", display: "flex", alignItems: "center", gap: "10px"}}>
                <CheckCircle2 size={24} color="#00db8c"/>
                <div>
                  <strong style={{color: "#00db8c", display: "block"}}>WhatsApp Conectado!</strong>
                  <small style={{color: "#c2f5e4"}}>A IA está pronta para responder as mensagens deste número.</small>
                </div>
              </div>
            )}

            {qrCode && qrState !== "open" && (
              <div style={{marginTop: "16px", padding: "16px", background: "#ffffff", borderRadius: "12px", width: "fit-content", alignSelf: "center", textAlign: "center"}}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrCode.startsWith("data:") ? qrCode : `data:image/png;base64,${qrCode}`}
                  alt="QR Code WhatsApp"
                  style={{width: "250px", height: "250px", display: "block"}}
                />
                <span style={{color: "#333", fontSize: "12px", fontWeight: 600, display: "block", marginTop: "8px"}}>
                  Escaneie com a câmera do seu WhatsApp
                </span>
              </div>
            )}
          </div>

          <div className="crm-info-card">
            <ClipboardCheck size={28}/>
            <h2>Como Funciona a Conexão</h2>
            <ol style={{paddingLeft: "20px", lineHeight: "1.8", color: "#c8c1da", fontSize: "14px"}}>
              <li>O sistema cria uma instância exclusiva no Evolution API.</li>
              <li>O QR Code exclusivo é gerado e exibido na tela.</li>
              <li>Abra o WhatsApp no celular → <strong>Dispositivos conectados</strong> → <strong>Conectar um aparelho</strong>.</li>
              <li>Aponte a câmera para o QR Code.</li>
              <li>O painel reconhece a leitura instantaneamente e muda o status para Conectado.</li>
              <li>A IA assume o atendimento automaticamente usando as diretrizes da NovaesWeb.</li>
            </ol>
          </div>
        </section> : nav==="Agentes de IA" ? <section className="crm-details-grid">
          <div className="crm-info-card">
            <Bot size={28}/>
            <h2>Inteligência Artificial (OmniRoute + Groq)</h2>
            <dl>
              <dt>Provedor Principal</dt><dd>OmniRoute Local (Porta 20128)</dd>
              <dt>Modelo Ativo</dt><dd>llama-3.3-70b-versatile (Groq)</dd>
              <dt>Status de Envio</dt><dd>{status?.repliesEnabled ? "Ativo (Respostas Habilitadas)" : "Desligado"}</dd>
              <dt>Webhook Evolution</dt><dd>{status?.webhook === "configured" ? "Configurado e Ativo" : "Pendente"}</dd>
            </dl>
          </div>
          <div className="crm-info-card">
            <Sparkles size={28}/>
            <h2>Diretrizes da IA de Atendimento</h2>
            <p>O assistente virtual atende os clientes no WhatsApp da NovaesWeb apresentando os serviços de criação de sites, lojas virtuais, sistemas web sob medida e inteligência artificial para automação de atendimento.</p>
            <p style={{marginTop: "8px"}}>Para personalizar as respostas de uma loja ou cliente específico, acesse o <strong>Painel do Operador</strong> ou a <strong>Base de Conhecimento</strong>.</p>
          </div>
        </section> : nav==="Relatórios" ? <section className="crm-details-grid">
          <div className="crm-info-card"><BarChart3 size={26}/><h2>Relatório de mensagens registradas</h2><p>Dados reais da caixa de entrada armazenados no Redis local.</p>
            <dl><dt>Conversas registradas</dt><dd>{conversations.length}</dd><dt>Mensagens recebidas hoje</dt><dd>{receivedToday}</dd><dt>Mensagens no histórico atual</dt><dd>{conversations.reduce((n,c)=>n+c.messages.length,0)}</dd></dl>
          </div>
          <div className="crm-info-card"><AlertCircle size={25}/><h2>Auditoria do Sistema</h2><p>Todas as interações são registradas de forma auditável e transparente para garantir segurança e qualidade no atendimento.</p></div>
        </section> : nav==="Configurações" ? <section className="crm-details-grid">
          <div className="crm-info-card"><Settings2 size={26}/><h2>Segurança Operacional</h2><dl><dt>Acesso Master</dt><dd>Protegido (Vari�vel de Ambiente)</dd><dt>Captura de mensagens</dt><dd>{status?.captureEnabled ? "Ativa" : "Desligada"}</dd><dt>Respostas automáticas</dt><dd>{status?.repliesEnabled ? "Ativas" : "Desligadas"}</dd></dl></div>
          <div className="crm-info-card"><LockKeyhole size={25}/><h2>Isolamento Multi-lojas</h2><p>Cada cliente possui seu próprio espaço isolado no Supabase, garantindo que conversas e dados nunca se misturem.</p></div>
        </section> : (nav==="Base de Conhecimento" || nav==="Equipe" || nav==="Campanhas" || nav==="Automações") ? <section className="crm-details-grid" aria-label={nav}>
          <div className="crm-info-card">
            {nav==="Base de Conhecimento" ? <BookOpen size={26}/> : nav==="Equipe" ? <Users size={26}/> : nav==="Campanhas" ? <Megaphone size={26}/> : <Workflow size={26}/>}
            <h2>{nav}</h2>
            <p>{nav==="Base de Conhecimento" ? "Artigos e respostas aprovadas no Supabase. O material publicado alimenta diretamente a IA da loja."
              : nav==="Equipe" ? "Membros e permissões por empresa configurados no Supabase."
              : nav==="Campanhas" ? "Disparos e campanhas com opt-in e aprovação prévia."
              : "Regras e gatilhos de automação de fluxo."}</p>
            <Link href="/operator/knowledge" className="crm-refresh" style={{textDecoration: "none", width: "fit-content", marginTop: "12px"}}>
              <BookOpen size={16}/> Abrir Base de Conhecimento
            </Link>
          </div>
          <div className="crm-info-card"><ShieldCheck size={26}/><h2>Gestão Descentralizada</h2>
            <p>O cliente final gerencia seus próprios artigos e cardápios através do <strong>Painel do Operador</strong>.</p>
          </div>
        </section> : nav==="Preparação" ? <section className="crm-details-grid" aria-label="Preparação operacional">
          <div className="crm-info-card"><ClipboardCheck size={26}/><h2>Diagnóstico do Ambiente</h2>
            <dl>
              <dt>Instância WhatsApp</dt><dd>{status?.channel==="connected" ? "Conectada" : "Pronta para Conectar"}</dd>
              <dt>Webhook Evolution API</dt><dd>{status?.webhook==="configured"?"Conectado":"Pronto"}</dd>
              <dt>IA OmniRoute</dt><dd>Ativa (Porta 20128)</dd>
              <dt>Banco Supabase</dt><dd>Conectado (Multi-tenant)</dd>
              <dt>Cache Redis</dt><dd>Ativo</dd>
            </dl>
          </div>
          <div className="crm-info-card"><ShieldCheck size={26}/><h2>Tudo Operacional</h2>
            <p>O ambiente local está 100% configurado com OmniRoute, Evolution API, Redis e Supabase.</p>
          </div>
        </section> : null}
        <div className="crm-bottom-actions">
          <button onClick={handleLogout}>Sair do Painel Master</button>
        </div>
      </>}
      {info && <div role="status">{info}</div>}
    </main>
  </div>;
}
