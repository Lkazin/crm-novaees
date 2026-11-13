"use client";

import React, { useId, useRef, useState } from "react";
import {
  Menu,
  X,
  Search,
  Smartphone,
  Bot,
  Play,
  Inbox,
  Clock,
  Users,
  UserPlus,
  BarChart3,
  CreditCard,
  KeyRound,
  BookOpen,
  LogOut,
  ChevronRight,
  ChevronLeft,
  Headphones,
  Store,
  ShieldCheck,
  Layers,
} from "lucide-react";
import styles from "./ClientSidebar.module.css";

function searchable(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
}

const SIDEBAR_ITEMS: Array<{ id: ClientTab; label: string; keywords: string }> = [
  { id: "whatsapp", label: "Conectar WhatsApp", keywords: "whatsapp qr code conexao numero" },
  { id: "conhecimento", label: "Minha IA (Cérebro da Loja)", keywords: "instruções comportamento treinamento informações empresa base ia" },
  { id: "simulador", label: "Chat de Teste (Simulador)", keywords: "simulador teste respostas" },
  { id: "atendimentos", label: "Atendimentos ao Vivo", keywords: "conversas humano chat atendimento" },
  { id: "horarios", label: "Horários de Atendimento", keywords: "horarios expediente funcionamento pausa" },
  { id: "contatos", label: "Contatos da Loja", keywords: "clientes leads exportar csv" },
  { id: "equipe", label: "Equipe & Operadores", keywords: "atendentes usuarios operadores" },
  { id: "relatorios", label: "Indicadores & Relatórios", keywords: "indicadores métricas desempenho graficos" },
  { id: "plano", label: "Meu Plano & Recargas", keywords: "assinatura franquia upgrade mensagens" },
  { id: "seguranca", label: "Recuperação de Senha", keywords: "senha acesso recuperação seguranca" },
  { id: "artigos", label: "Base de Conhecimento", keywords: "artigos documentos conhecimento" },
];

/** Mesmas secoes do workspace do cliente (ClientWorkspace > type Tab). */
export type ClientTab =
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

/** Loja do seletor de empresa. */
type SidebarTenant = { id: string; name: string };

/** Trecho dos dados do painel que a sidebar consome. */
interface SidebarData {
  plan?: { maxWhatsappConnections?: number; maxOperators?: number; isTrial?: boolean; trialDaysLeft?: number };
  tenants?: SidebarTenant[];
}

interface ClientSidebarProps {
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  activeTab: string;
  onSelectTab: (tab: ClientTab) => void;
  onSignOut: () => void;
  data: SidebarData | null;
  tenant: string;
  onChangeTenant?: (tenantId: string) => void;
  quotaData: { quotaUsed: number; quotaLimit: number; rechargeCreditsBalance?: number };
  quotaPercent: number;
  whatsappSlots: Array<{ status: string; unlocked: boolean }>;
  teamOperators: Array<{ status: string }>;
  clientRecoveryVerified?: boolean;
}

export const ClientSidebar: React.FC<ClientSidebarProps> = ({
  isCollapsed = false,
  onToggleCollapse,
  activeTab,
  onSelectTab: onSelectTabProp,
  onSignOut,
  data,
  tenant,
  onChangeTenant,
  quotaData,
  quotaPercent,
  whatsappSlots,
  teamOperators,
  clientRecoveryVerified = false,
}) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const searchId = useId();
  const resultId = useId();

  const onSelectTab = (tab: ClientTab) => {
    onSelectTabProp(tab);
    setQuery("");
    setMobileOpen(false);
  };

  const normalizedQuery = searchable(query);
  const visibleIds = new Set(
    SIDEBAR_ITEMS.filter((item) => searchable(`${item.label} ${item.keywords}`).includes(normalizedQuery)).map(
      (item) => item.id,
    ),
  );
  const visibleList = SIDEBAR_ITEMS.filter((item) => visibleIds.has(item.id));
  const isVisible = (id: ClientTab) => !normalizedQuery || visibleIds.has(id);

  // Dados reais calculados do sistema
  const maxWhatsapp = data?.plan?.maxWhatsappConnections ?? 1;
  const connectedWhatsapp = whatsappSlots.filter((s) => s.status === "connected" && s.unlocked).length;

  // Aviso de franquia: o operador precisa saber antes de a IA parar de responder.
  // 80% = atenção; 100% = esgotada (a IA deixa de atender até recarga ou virada do mês).
  const quotaAlert = quotaPercent >= 100 ? "exhausted" : quotaPercent >= 80 ? "warning" : "none";
  const rechargeBalance = quotaData.rechargeCreditsBalance ?? 0;

  const maxOps = data?.plan?.maxOperators ?? 1;
  const activeOps = Math.min(maxOps, teamOperators.filter((o) => o.status === "active").length + 1);

  return (
    <>
    <button
      type="button"
      className={styles.neonMobileToggle}
      onClick={() => setMobileOpen((v) => !v)}
      aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
      aria-expanded={mobileOpen}
    >
      {mobileOpen ? <X size={22} /> : <Menu size={22} />}
    </button>
    {mobileOpen && <div className={styles.neonBackdrop} onClick={() => setMobileOpen(false)} aria-hidden="true" />}
    <aside
      className={`${styles.neonSidebar} ${isCollapsed ? styles.isCollapsed : ""} ${mobileOpen ? styles.mobileOpen : ""}`}
      aria-label="Menu Lateral do Cliente"
    >
      {/* 1. Header / Logo */}
      <div className={styles.neonBrand}>
        <div className={styles.neonLogoWrapper}>
          <img src="/novaes-crm-logo.jpg" alt="Novaes CRM IA" className={styles.neonLogoImg} />
        </div>
        {!isCollapsed && <div className={styles.neonBrandText}>
          <div className={styles.neonBrandTitle}>
            Novaes <span className={styles.neonBrandPink}>CRM IA</span>
          </div>
          <div className={styles.neonBrandSubtitle}>CRM INTELIGENTE</div>
        </div>}
        <button
          type="button"
          className={styles.neonCollapseToggle}
          onClick={onToggleCollapse}
          title={isCollapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
          aria-label={isCollapsed ? "Expandir menu" : "Recolher menu"}
        >
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Seletor de Loja se houver mais de uma */}
      {data && data.tenants && data.tenants.length > 1 && (
        <select
          className={styles.neonTenantSelect}
          value={tenant}
          onChange={(e) => onChangeTenant?.(e.target.value)}
          aria-label="Selecionar Loja"
        >
          {data.tenants.map((t: SidebarTenant) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      )}

      {/* AREA CENTRAL: grupos de menu (rola por dentro se faltar altura) */}
      <nav className={styles.neonMiddle} aria-label="Seções do painel do cliente">
      <div className={styles.neonSearch}>
        <Search size={15} aria-hidden="true" />
        <label htmlFor={searchId} className={styles.srOnly}>Buscar seção do painel</label>
        <input
          ref={searchRef}
          id={searchId}
          type="search"
          placeholder="Encontrar uma seção"
          autoComplete="off"
          maxLength={80}
          value={query}
          aria-describedby={query ? resultId : undefined}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setQuery("");
            }
            if (e.key === "Enter" && visibleList.length === 1) {
              e.preventDefault();
              onSelectTab(visibleList[0].id);
            }
          }}
        />
        {query && (
          <button
            type="button"
            aria-label="Limpar busca de seções"
            onClick={() => {
              setQuery("");
              searchRef.current?.focus();
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>
      {query && (
        <p id={resultId} className={styles.neonSearchStatus} role="status">
          {visibleList.length ? `${visibleList.length} seção(ões) encontrada(s)` : "Nenhuma seção encontrada. Tente outro nome."}
        </p>
      )}

      {/* 2. GRUPO: ATENDIMENTO & IA */}
      {(["whatsapp", "conhecimento", "simulador", "atendimentos", "horarios"] as ClientTab[]).some(isVisible) && (
      <div className={styles.neonGroup}>
        <div className={styles.neonGroupHeader}>
          <Headphones size={13} color="#e879f9" />
          <span>Atendimento & IA</span>
          <div className={styles.neonGroupLine} />
        </div>

        <div className={styles.neonGroupCard}>
          {/* Card Hero: Conectar WhatsApp */}
          {isVisible("whatsapp") && (
          <button
            type="button"
            className={`${styles.neonNavItem} ${styles.neonHeroItem}`}
            onClick={() => onSelectTab("whatsapp")}
            aria-label="Conectar WhatsApp"
            aria-current={activeTab === "whatsapp" ? "page" : undefined}
          >
            <div className={styles.neonHeroIconBox}>
              <Smartphone size={18} color="#ffffff" />
            </div>
            <div className={styles.neonHeroTexts}>
              <div className={styles.neonHeroTitle}>Conectar</div>
              <div className={styles.neonHeroTitle}>WhatsApp</div>
            </div>
            <span className={styles.neonHeroBadge}>
              {connectedWhatsapp}/{maxWhatsapp}
            </span>
          </button>
          )}

          {/* Minha IA (Cérebro da Loja) */}
          {isVisible("conhecimento") && (
          <button
            type="button"
            className={`${styles.neonNavItem} ${activeTab === "conhecimento" ? styles.active : ""}`}
            onClick={() => onSelectTab("conhecimento")}
            aria-label="Minha IA (Cérebro da Loja)"
            aria-current={activeTab === "conhecimento" ? "page" : undefined}
          >
            <span className={`${styles.neonNavIcon} ${styles.neonIconPink}`}>
              <Bot size={17} />
            </span>
            <span className={styles.neonNavLabel}>Minha IA (Cérebro da Loja)</span>
            <ChevronRight size={14} className={styles.neonNavArrow} />
          </button>
          )}

          {/* Chat de Teste (Simulador) */}
          {isVisible("simulador") && (
          <button
            type="button"
            className={`${styles.neonNavItem} ${activeTab === "simulador" ? styles.active : ""}`}
            onClick={() => onSelectTab("simulador")}
            aria-label="Chat de Teste (Simulador)"
            aria-current={activeTab === "simulador" ? "page" : undefined}
          >
            <span className={`${styles.neonNavIcon} ${styles.neonIconPurple}`}>
              <Play size={16} />
            </span>
            <span className={styles.neonNavLabel}>Chat de Teste (Simulador)</span>
            <span className={`${styles.neonPillBadge} ${styles.neonPillPurple}`}>TESTAR</span>
          </button>
          )}

          {/* Atendimentos ao Vivo */}
          {isVisible("atendimentos") && (
          <button
            type="button"
            className={`${styles.neonNavItem} ${activeTab === "atendimentos" ? styles.active : ""}`}
            onClick={() => onSelectTab("atendimentos")}
            aria-label="Atendimentos ao Vivo"
            aria-current={activeTab === "atendimentos" ? "page" : undefined}
          >
            <span className={`${styles.neonNavIcon} ${styles.neonIconBlue}`}>
              <Inbox size={17} />
            </span>
            <span className={styles.neonNavLabel}>Atendimentos ao Vivo</span>
            <ChevronRight size={14} className={styles.neonNavArrow} />
          </button>
          )}

          {/* Horários de Atendimento */}
          {isVisible("horarios") && (
          <button
            type="button"
            className={`${styles.neonNavItem} ${activeTab === "horarios" ? styles.active : ""}`}
            onClick={() => onSelectTab("horarios")}
            aria-label="Horários de Atendimento"
            aria-current={activeTab === "horarios" ? "page" : undefined}
          >
            <span className={`${styles.neonNavIcon} ${styles.neonIconGold}`}>
              <Clock size={17} />
            </span>
            <span className={styles.neonNavLabel}>Horários de Atendimento</span>
            <ChevronRight size={14} className={styles.neonNavArrow} />
          </button>
          )}
        </div>
      </div>
      )}

      {/* 3. GRUPO: GESTÃO DA LOJA */}
      {(["contatos", "equipe", "relatorios"] as ClientTab[]).some(isVisible) && (
      <div className={styles.neonGroup}>
        <div className={styles.neonGroupHeader}>
          <Store size={13} color="#e879f9" />
          <span>Gestão da Loja</span>
          <div className={styles.neonGroupLine} />
        </div>

        <div className={styles.neonGroupCard}>
          {/* Contatos da Loja */}
          {isVisible("contatos") && (
          <button
            type="button"
            className={`${styles.neonNavItem} ${activeTab === "contatos" ? styles.active : ""}`}
            onClick={() => onSelectTab("contatos")}
            aria-label="Contatos da Loja"
            aria-current={activeTab === "contatos" ? "page" : undefined}
          >
            <span className={`${styles.neonNavIcon} ${styles.neonIconGreen}`}>
              <Users size={17} />
            </span>
            <span className={styles.neonNavLabel}>Contatos da Loja</span>
            <ChevronRight size={14} className={styles.neonNavArrow} />
          </button>
          )}

          {/* Equipe & Operadores */}
          {isVisible("equipe") && (
          <button
            type="button"
            className={`${styles.neonNavItem} ${activeTab === "equipe" ? styles.active : ""}`}
            onClick={() => onSelectTab("equipe")}
            aria-label="Equipe & Operadores"
            aria-current={activeTab === "equipe" ? "page" : undefined}
          >
            <span className={`${styles.neonNavIcon} ${styles.neonIconPurple}`}>
              <UserPlus size={17} />
            </span>
            <span className={styles.neonNavLabel}>Equipe & Operadores</span>
            <span className={`${styles.neonPillBadge} ${styles.neonPillCount}`}>
              {activeOps}/{maxOps}
            </span>
            <ChevronRight size={14} className={styles.neonNavArrow} />
          </button>
          )}

          {/* Indicadores & Relatórios */}
          {isVisible("relatorios") && (
          <button
            type="button"
            className={`${styles.neonNavItem} ${activeTab === "relatorios" ? styles.active : ""}`}
            onClick={() => onSelectTab("relatorios")}
            aria-label="Indicadores & Relatórios"
            aria-current={activeTab === "relatorios" ? "page" : undefined}
          >
            <span className={`${styles.neonNavIcon} ${styles.neonIconGreen}`}>
              <BarChart3 size={17} />
            </span>
            <span className={styles.neonNavLabel}>Indicadores & Relatórios</span>
            <ChevronRight size={14} className={styles.neonNavArrow} />
          </button>
          )}
        </div>
      </div>
      )}

      {/* 4. GRUPO: CONTA & SEGURANÇA */}
      {(["plano", "seguranca"] as ClientTab[]).some(isVisible) && (
      <div className={styles.neonGroup}>
        <div className={styles.neonGroupHeader}>
          <ShieldCheck size={13} color="#e879f9" />
          <span>Conta & Segurança</span>
          <div className={styles.neonGroupLine} />
        </div>

        <div className={styles.neonGroupCard}>
          {/* Meu Plano & Recargas */}
          {isVisible("plano") && (
          <button
            type="button"
            className={`${styles.neonNavItem} ${activeTab === "plano" ? styles.active : ""}`}
            onClick={() => onSelectTab("plano")}
            aria-label="Meu Plano & Recargas"
            aria-current={activeTab === "plano" ? "page" : undefined}
          >
            <span className={`${styles.neonNavIcon} ${styles.neonIconGold}`}>
              <CreditCard size={17} />
            </span>
            <span className={styles.neonNavLabel}>Meu Plano & Recargas</span>
            <span className={`${styles.neonPillBadge} ${styles.neonPillGold}`}>PLANO</span>
            <ChevronRight size={14} className={styles.neonNavArrow} />
          </button>
          )}

          {/* Recuperação de Senha */}
          {isVisible("seguranca") && (
          <button
            type="button"
            className={`${styles.neonNavItem} ${activeTab === "seguranca" ? styles.active : ""}`}
            onClick={() => onSelectTab("seguranca")}
            aria-label="Recuperação de Senha"
            aria-current={activeTab === "seguranca" ? "page" : undefined}
          >
            <span className={`${styles.neonNavIcon} ${styles.neonIconGreen}`}>
              <KeyRound size={17} />
            </span>
            <span className={styles.neonNavLabel}>Recuperação de Senha</span>
            {clientRecoveryVerified ? (
              <span className={`${styles.neonPillBadge}`} style={{ background: "rgba(16, 185, 129, 0.2)", border: "1px solid #10b981", color: "#10b981" }}>
                ATIVO
              </span>
            ) : (
              <span className={`${styles.neonPillBadge} ${styles.neonPillPending}`}>
                PENDENTE
              </span>
            )}
            <ChevronRight size={14} className={styles.neonNavArrow} />
          </button>
          )}
        </div>
      </div>
      )}

      {/* 5. ITEM ISOLADO: Base de Conhecimento */}
      {isVisible("artigos") && (
      <div className={styles.neonGroupCard} style={{ marginTop: "2px" }}>
        <button
          type="button"
          className={`${styles.neonNavItem} ${activeTab === "artigos" ? styles.active : ""}`}
          onClick={() => onSelectTab("artigos")}
          aria-label="Base de Conhecimento"
          aria-current={activeTab === "artigos" ? "page" : undefined}
        >
          <span className={`${styles.neonNavIcon} ${styles.neonIconPurple}`}>
            <BookOpen size={17} />
          </span>
          <span className={styles.neonNavLabel}>Base de Conhecimento</span>
          <ChevronRight size={14} className={styles.neonNavArrow} />
        </button>
      </div>
      )}

      </nav>

      {/* RODAPE ancorado: Franquia + Sair */}
      <div className={styles.neonFooter}>
      {/* 6. Franquia do Mês (Visual da Imagem) */}
      <div
        className={styles.neonQuotaCard}
        onClick={() => onSelectTab("plano")}
        role="button"
        tabIndex={0}
        aria-label="Ver detalhes da Franquia de Mensagens"
      >
        <div className={styles.neonQuotaHeader}>
          <div className={styles.neonQuotaLeft}>
            <Layers size={18} className={styles.neonQuotaIcon} />
            <span>Franquia do Mês</span>
          </div>
          <div className={styles.neonQuotaNumbers}>
            {quotaData.quotaUsed} / {quotaData.quotaLimit}
          </div>
        </div>

        <div className={styles.neonProgressBar}>
          <div
            className={`${styles.neonProgressFill} ${quotaAlert === "warning" ? styles.neonProgressWarning : ""} ${quotaAlert === "exhausted" ? styles.neonProgressExhausted : ""}`}
            style={{ width: `${Math.min(100, quotaPercent)}%` }}
          />
        </div>

        <div className={styles.neonQuotaFooter}>
          {quotaAlert === "exhausted" ? (
            <span className={styles.neonQuotaAlertText}>
              Franquia esgotada — a IA está sem responder. Contrate uma recarga.
            </span>
          ) : quotaAlert === "warning" ? (
            <span className={styles.neonQuotaAlertText}>
              Restam {Math.max(0, quotaData.quotaLimit - quotaData.quotaUsed)} mensagens.
              {rechargeBalance > 0 ? ` +${rechargeBalance} de recarga` : " Contrate uma recarga para não parar."}
            </span>
          ) : data?.plan?.isTrial ? (
            `${data.plan.trialDaysLeft !== undefined ? `${data.plan.trialDaysLeft} dias restantes` : "7 dias de teste"}`
          ) : rechargeBalance > 0 ? (
            `Renovação mensal · +${rechargeBalance} de recarga disponíveis`
          ) : (
            "Renovação mensal automática"
          )}
        </div>
      </div>

      {/* 7. Botão Sair do Painel */}
      <button
        type="button"
        className={styles.neonLogoutButton}
        onClick={onSignOut}
        aria-label="Sair do Painel"
      >
        <LogOut size={16} />
        <span>Sair do Painel</span>
      </button>
      </div>
    </aside>
    </>
  );
};
