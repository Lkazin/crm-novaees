"use client";

import React, { useState } from "react";
import {
  Menu,
  X,
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
  const onSelectTab = (tab: ClientTab) => {
    onSelectTabProp(tab);
    setMobileOpen(false);
  };
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
      <div className={styles.neonMiddle}>
      {/* 2. GRUPO: ATENDIMENTO & IA */}
      <div className={styles.neonGroup}>
        <div className={styles.neonGroupHeader}>
          <Headphones size={13} color="#f472b6" />
          <span>Atendimento & IA</span>
          <div className={styles.neonGroupLine} />
        </div>

        <div className={styles.neonGroupCard}>
          {/* Card Hero: Conectar WhatsApp */}
          <button
            type="button"
            className={`${styles.neonNavItem} ${styles.neonHeroItem}`}
            onClick={() => onSelectTab("whatsapp")}
            aria-label="Conectar WhatsApp"
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

          {/* Minha IA (Cérebro da Loja) */}
          <button
            type="button"
            className={`${styles.neonNavItem} ${activeTab === "conhecimento" ? styles.active : ""}`}
            onClick={() => onSelectTab("conhecimento")}
          >
            <span className={`${styles.neonNavIcon} ${styles.neonIconPink}`}>
              <Bot size={17} />
            </span>
            <span className={styles.neonNavLabel}>Minha IA (Cérebro da Loja)</span>
            <ChevronRight size={14} className={styles.neonNavArrow} />
          </button>

          {/* Chat de Teste (Simulador) */}
          <button
            type="button"
            className={`${styles.neonNavItem} ${activeTab === "simulador" ? styles.active : ""}`}
            onClick={() => onSelectTab("simulador")}
          >
            <span className={`${styles.neonNavIcon} ${styles.neonIconPurple}`}>
              <Play size={16} />
            </span>
            <span className={styles.neonNavLabel}>Chat de Teste (Simulador)</span>
            <span className={`${styles.neonPillBadge} ${styles.neonPillPurple}`}>TESTAR</span>
          </button>

          {/* Atendimentos ao Vivo */}
          <button
            type="button"
            className={`${styles.neonNavItem} ${activeTab === "atendimentos" ? styles.active : ""}`}
            onClick={() => onSelectTab("atendimentos")}
          >
            <span className={`${styles.neonNavIcon} ${styles.neonIconBlue}`}>
              <Inbox size={17} />
            </span>
            <span className={styles.neonNavLabel}>Atendimentos ao Vivo</span>
            <ChevronRight size={14} className={styles.neonNavArrow} />
          </button>

          {/* Horários de Atendimento */}
          <button
            type="button"
            className={`${styles.neonNavItem} ${activeTab === "horarios" ? styles.active : ""}`}
            onClick={() => onSelectTab("horarios")}
          >
            <span className={`${styles.neonNavIcon} ${styles.neonIconGold}`}>
              <Clock size={17} />
            </span>
            <span className={styles.neonNavLabel}>Horários de Atendimento</span>
            <ChevronRight size={14} className={styles.neonNavArrow} />
          </button>
        </div>
      </div>

      {/* 3. GRUPO: GESTÃO DA LOJA */}
      <div className={styles.neonGroup}>
        <div className={styles.neonGroupHeader}>
          <Store size={13} color="#f472b6" />
          <span>Gestão da Loja</span>
          <div className={styles.neonGroupLine} />
        </div>

        <div className={styles.neonGroupCard}>
          {/* Contatos da Loja */}
          <button
            type="button"
            className={`${styles.neonNavItem} ${activeTab === "contatos" ? styles.active : ""}`}
            onClick={() => onSelectTab("contatos")}
          >
            <span className={`${styles.neonNavIcon} ${styles.neonIconGreen}`}>
              <Users size={17} />
            </span>
            <span className={styles.neonNavLabel}>Contatos da Loja</span>
            <ChevronRight size={14} className={styles.neonNavArrow} />
          </button>

          {/* Equipe & Operadores */}
          <button
            type="button"
            className={`${styles.neonNavItem} ${activeTab === "equipe" ? styles.active : ""}`}
            onClick={() => onSelectTab("equipe")}
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

          {/* Indicadores & Relatórios */}
          <button
            type="button"
            className={`${styles.neonNavItem} ${activeTab === "relatorios" ? styles.active : ""}`}
            onClick={() => onSelectTab("relatorios")}
          >
            <span className={`${styles.neonNavIcon} ${styles.neonIconGreen}`}>
              <BarChart3 size={17} />
            </span>
            <span className={styles.neonNavLabel}>Indicadores & Relatórios</span>
            <ChevronRight size={14} className={styles.neonNavArrow} />
          </button>
        </div>
      </div>

      {/* 4. GRUPO: CONTA & SEGURANÇA */}
      <div className={styles.neonGroup}>
        <div className={styles.neonGroupHeader}>
          <ShieldCheck size={13} color="#f472b6" />
          <span>Conta & Segurança</span>
          <div className={styles.neonGroupLine} />
        </div>

        <div className={styles.neonGroupCard}>
          {/* Meu Plano & Recargas */}
          <button
            type="button"
            className={`${styles.neonNavItem} ${activeTab === "plano" ? styles.active : ""}`}
            onClick={() => onSelectTab("plano")}
          >
            <span className={`${styles.neonNavIcon} ${styles.neonIconGold}`}>
              <CreditCard size={17} />
            </span>
            <span className={styles.neonNavLabel}>Meu Plano & Recargas</span>
            <span className={`${styles.neonPillBadge} ${styles.neonPillGold}`}>PLANO</span>
            <ChevronRight size={14} className={styles.neonNavArrow} />
          </button>

          {/* Recuperação de Senha */}
          <button
            type="button"
            className={`${styles.neonNavItem} ${activeTab === "seguranca" ? styles.active : ""}`}
            onClick={() => onSelectTab("seguranca")}
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
        </div>
      </div>

      {/* 5. ITEM ISOLADO: Base de Conhecimento */}
      <div className={styles.neonGroupCard} style={{ marginTop: "2px" }}>
        <button
          type="button"
          className={`${styles.neonNavItem} ${activeTab === "artigos" ? styles.active : ""}`}
          onClick={() => onSelectTab("artigos")}
        >
          <span className={`${styles.neonNavIcon} ${styles.neonIconPurple}`}>
            <BookOpen size={17} />
          </span>
          <span className={styles.neonNavLabel}>Base de Conhecimento</span>
          <ChevronRight size={14} className={styles.neonNavArrow} />
        </button>
      </div>

      </div>

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
