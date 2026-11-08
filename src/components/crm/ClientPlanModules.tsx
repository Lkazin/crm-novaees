"use client";
import React, { useState } from "react";
import {
  Smartphone, LockKeyhole, CheckCircle2, Sparkles, Users, UserPlus, Trash2,
  BarChart3, Star, Zap, Plus, ShieldAlert, Wrench, Ban, Check, Send, Filter, Tag,
  Eye, EyeOff, Edit3, HelpCircle, Headphones, MessageSquare, Bot, ArrowRight, Clock, ShieldCheck, Crown
} from "lucide-react";

export type WhatsappSlotItem = {
  slot: number;
  label: string;
  customName?: string;
  instanceName: string;
  unlocked: boolean;
  minPlanId: string;
  minPlanName: string;
  status: "connected" | "connecting" | "disconnected" | "paused" | "locked";
  phoneNumber?: string | null;
  profileName?: string | null;
  channelId: string | null;
  pausedByDowngrade: boolean;
  lockedReason?: string;
};

export type QuickReplyItem = {
  id: string;
  shortcut: string;
  title: string;
  body: string;
  category?: string;
};

export type TeamOperatorItem = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "agent" | "viewer";
  status: "active" | "revoked";
  createdAt: string;
};

export type SatisfactionSurveyItem = {
  id: string;
  conversationId: string;
  contactId?: string;
  rating: number;
  comment: string;
  operatorId?: string;
  createdAt: string;
};

export type FeatureStateItem = {
  id: string; name: string; description: string; category?: string;
  minPlanId: string; minPlanName: string;
  state: "allowed" | "locked_by_plan" | "maintenance" | "suspended";
  reason?: string;
};

// Matches the published operator/features response. No invented UI-only envelope.
export type ReportsPayload = {
  basicIndicators: {quotaUsed:number;quotaLimit:number;quotaPercent:number;totalConversations:number;activeConversations:number;aiConversations:number;humanConversations:number;totalContacts:number} | null;
  commercialIndicators: {tagBreakdown:Record<string,number>;priorityBreakdown:Record<string,number>;handoffCount:number;handoffRate:number;totalSurveys:number;avgSatisfaction:number} | null;
  premiumAnalytics: {starDistribution:Record<string,number>;csatPercent:number;aiAvgRating:number|null;humanAvgRating:number|null;detractors:SatisfactionSurveyItem[];operatorMetrics:Array<{operatorId:string;name:string;role:string;conversationsHandled:number;surveysCount:number;avgRating:number|null}>;channelsSummary:Array<{id:string;instanceName:string;status:string;conversationsCount:number}>} | null;
};

export function featureAvailable(states: Record<string, FeatureStateItem>, id: string, suspended = false): boolean {
  return !suspended && states[id]?.state === "allowed";
}

export function commercialPlanId(value: string): string {
  const aliases: Record<string,string> = {"CRM Start":"crm-start","CRM Business":"crm-business","CRM Premium":"crm-premium"};
  return aliases[value] || value;
}

export function FeatureUnavailable({feature, onUpgrade}: {feature?:FeatureStateItem;onUpgrade?:(plan:string,reason:string)=>void}) {
  const locked = feature?.state === "locked_by_plan";
  return <div role="status" className="op-card" style={{padding:"16px",border:"1px dashed #615477"}}>
    <strong>{feature?.state === "maintenance" ? "Recurso em manutenção" : feature?.state === "suspended" ? "Recurso suspenso" : locked ? "Recurso bloqueado pelo plano" : "Permissão indisponível"}</strong>
    <p>{feature?.reason || "Não foi possível confirmar a permissão para este recurso."}</p>
    {locked && onUpgrade && <button type="button" className="op-primary" onClick={()=>onUpgrade(feature.minPlanId,feature.name)}>Solicitar {feature.minPlanName}</button>}
  </div>;
}

// ============================================================================
// 1. BARRA DE 5 ESPAÇOS DE WHATSAPP (CENTRAL MULTI-WHATSAPP COMERCIAL)
// ============================================================================
export function WhatsappFiveSlotsGrid({
  slots,
  selectedSlot,
  maxConnections,
  onSelectSlot,
  onRequestUpgrade,
  onSaveSlotLabel,
  blockedState,
}: {
  blockedState?: FeatureStateItem;
  slots: WhatsappSlotItem[];
  selectedSlot: number;
  maxConnections: number;
  onSelectSlot: (slot: WhatsappSlotItem) => void;
  onRequestUpgrade: (targetPlan: string, reason: string) => void;
  onSaveSlotLabel?: (slot: number, label: string) => void;
}) {
  const connectedCount = slots.filter(s => s.status === "connected" && s.unlocked).length;
  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  const [editingLabel, setEditingLabel] = useState("");

  const handleStartEdit = (slot: number, currentName?: string) => {
    setEditingSlot(slot);
    setEditingLabel(currentName || "");
  };

  const handleSaveEdit = (slot: number) => {
    onSaveSlotLabel?.(slot, editingLabel.trim());
    setEditingSlot(null);
  };

  return (
    <div className="op-card" style={{ marginBottom: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", borderBottom: "1px solid #372f4d", paddingBottom: "12px" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 800, color: "#fff", display: "flex", alignItems: "center", gap: "8px" }}>
            <Smartphone size={20} color="#ec4899" /> Meus WhatsApps — Números Comerciais da Empresa
          </h3>
          <small style={{ color: "#c2bed4", fontSize: "13px", marginTop: "2px", display: "block" }}>
            Aqui ficam os números oficiais por onde seus clientes enviam mensagens. Seu plano libera <strong>{maxConnections} de 5 números simultâneos</strong>.
          </small>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{
            padding: "6px 14px",
            borderRadius: "999px",
            fontSize: "12px",
            fontWeight: 800,
            background: "rgba(236, 72, 153, 0.16)",
            border: "1px solid rgba(236, 72, 153, 0.45)",
            color: "#f472b6"
          }}>
            {connectedCount} de {maxConnections} conectado(s) · {maxConnections} de 5 liberados
          </span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: "14px" }}>
        {slots.map(s => {
          const isSelected = selectedSlot === s.slot;
          const isLocked = !s.unlocked || s.slot > maxConnections || (blockedState && blockedState.state !== "allowed");
          const planLocked = isLocked && (!blockedState || blockedState.state === "allowed" || blockedState.state === "locked_by_plan") && (s.slot > maxConnections || s.pausedByDowngrade || s.status === "locked");
          const isPausedDowngrade = s.pausedByDowngrade;

          const statusColor = isLocked
            ? "#9ca3af"
            : isPausedDowngrade
            ? "#f59e0b"
            : (s.status === "connected")
            ? "#00db8c"
            : s.status === "connecting"
            ? "#c084fc"
            : "#9ca3af";

          const statusText = isLocked
            ? `🔒 Bloqueado no plano (${s.minPlanName})`
            : isPausedDowngrade
            ? "⏸️ Pausado por downgrade"
            : (s.status === "connected")
            ? "● Conectado e Ativo"
            : s.status === "connecting"
            ? "◐ Aguardando Leitura do QR Code"
            : "○ Pronto para Conectar";

          const displayName = s.customName || (s.slot === 1 ? "Atendimento Geral" : `Departamento ${s.slot}`);

          return (
            <div
              key={s.slot}
              data-testid={`whatsapp-slot-${s.slot}`}
              data-locked={Boolean(isLocked)}
              role="group"
              aria-label={`${s.label}: ${isLocked ? "bloqueado" : "liberado"}`}
              onClick={() => {
                if (!isLocked) onSelectSlot(s);
              }}
              style={{
                padding: "16px",
                borderRadius: "16px",
                background: isSelected
                  ? "linear-gradient(135deg, rgba(236, 72, 153, 0.22), rgba(139, 92, 246, 0.2))"
                  : isLocked
                  ? "rgba(15, 13, 26, 0.65)"
                  : "rgba(255, 255, 255, 0.03)",
                border: isSelected
                  ? "2px solid #ec4899"
                  : isLocked
                  ? "1px dashed rgba(107, 114, 128, 0.45)"
                  : (s.status === "connected")
                  ? "1px solid rgba(0, 219, 140, 0.45)"
                  : "1px solid rgba(255, 255, 255, 0.08)",
                cursor: isLocked ? "default" : "pointer",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: "12px",
                opacity: isLocked ? 0.72 : 1,
                transition: "all 0.2s ease",
                boxShadow: isSelected ? "0 0 20px rgba(236, 72, 153, 0.25)" : "none"
              }}
            >
              <div>
                {/* Top Badge: WhatsApp X */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                  <span style={{
                    fontSize: "11px",
                    fontWeight: 800,
                    padding: "3px 10px",
                    borderRadius: "999px",
                    background: isLocked ? "rgba(107,114,128,0.2)" : "rgba(236,72,153,0.2)",
                    color: isLocked ? "#9ca3af" : "#f472b6"
                  }}>
                    WhatsApp {s.slot}
                  </span>
                  {isLocked ? (
                    <LockKeyhole size={16} color="#f59e0b" />
                  ) : (s.status === "connected") ? (
                    <CheckCircle2 size={17} color="#00db8c" />
                  ) : (
                    <Smartphone size={16} color="#aba8bf" />
                  )}
                </div>

                {/* Nome do Departamento / Setor */}
                {editingSlot === s.slot ? (
                  <div style={{ display: "flex", gap: "6px", marginBottom: "6px" }} onClick={e => e.stopPropagation()}>
                    <input
                      type="text"
                      value={editingLabel}
                      autoFocus
                      placeholder="Ex: Vendas, Suporte..."
                      onChange={e => setEditingLabel(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") handleSaveEdit(s.slot); }}
                      style={{
                        padding: "4px 8px",
                        borderRadius: "6px",
                        background: "#161325",
                        border: "1px solid #8b5cf6",
                        color: "#fff",
                        fontSize: "13px",
                        width: "100%"
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveEdit(s.slot)}
                      style={{
                        padding: "4px 8px",
                        borderRadius: "6px",
                        background: "#ec4899",
                        border: "none",
                        color: "#fff",
                        fontSize: "11px",
                        fontWeight: 700,
                        cursor: "pointer"
                      }}
                    >
                      Salvar
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "4px", marginBottom: "2px" }}>
                    <strong style={{ color: "#fff", fontSize: "15px", display: "block" }}>
                      {displayName}
                    </strong>
                    {!isLocked && onSaveSlotLabel && (
                      <button
                        type="button"
                        title="Editar nome deste WhatsApp"
                        onClick={e => {
                          e.stopPropagation();
                          handleStartEdit(s.slot, s.customName);
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#8e87a2",
                          cursor: "pointer",
                          padding: "2px"
                        }}
                      >
                        <Edit3 size={13} />
                      </button>
                    )}
                  </div>
                )}

                {/* Número de Telefone Conectado */}
                <div style={{ marginTop: "4px" }}>
                  {s.phoneNumber ? (
                    <span style={{ color: "#a7f3d0", fontSize: "12px", fontWeight: 700, display: "flex", alignItems: "center", gap: "4px" }}>
                      <Smartphone size={13} color="#00db8c" /> +{s.phoneNumber}
                    </span>
                  ) : (
                    <small style={{ color: "#8e87a2", fontSize: "12px", display: "block" }}>
                      Nenhum número conectado
                    </small>
                  )}
                  {s.profileName && (
                    <small style={{ color: "#c2bed4", fontSize: "11px", display: "block", marginTop: "1px" }}>
                      {s.profileName}
                    </small>
                  )}
                </div>
              </div>

              {/* Status e Ação */}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "6px" }}>
                <span style={{ fontSize: "11px", fontWeight: 800, color: statusColor }}>
                  {statusText}
                </span>

                {isPausedDowngrade && (
                  <small style={{ fontSize: "11px", color: "#fde68a", lineHeight: 1.3 }}>
                    Histórico 100% preservado. Faça upgrade para reativar este número.
                  </small>
                )}

                {isLocked ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <button
                      type="button"
                      className="op-refresh"
                      disabled
                      style={{ opacity: 0.5, cursor: "not-allowed", fontSize: "12px" }}
                    >
                      🔒 Espaço Bloqueado
                    </button>
                    {planLocked && (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          onRequestUpgrade(s.minPlanId, `Desbloquear WhatsApp ${s.slot} (${s.minPlanName})`);
                        }}
                        className="op-primary"
                        style={{
                          padding: "8px 12px",
                          borderRadius: "10px",
                          fontSize: "12px",
                          fontWeight: 800,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "6px"
                        }}
                      >
                        🔓 Solicitar {s.minPlanName}
                      </button>
                    )}
                  </div>
                ) : s.status === "connected" ? (
                  <button
                    type="button"
                    className="op-refresh"
                    aria-label={`Gerenciar WhatsApp ${s.slot}`}
                    onClick={e => {
                      e.stopPropagation();
                      onSelectSlot(s);
                    }}
                    style={{ fontSize: "12px", fontWeight: 700 }}
                  >
                    Gerenciar Conexão
                  </button>
                ) : (
                  <button
                    type="button"
                    className="op-primary"
                    aria-label={`Conectar WhatsApp ${s.slot}`}
                    onClick={e => {
                      e.stopPropagation();
                      onSelectSlot(s);
                    }}
                    style={{ fontSize: "12px", fontWeight: 800, padding: "8px 14px" }}
                  >
                    Conectar WhatsApp
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// 2. BARRA E MODAL DE RESPOSTAS RÁPIDAS (ETAPA 7)
// ============================================================================
export function QuickRepliesSection({
  quickReplies,
  allowed,
  onSelectReply,
  onSaveReply,
  onDeleteReply,
  onRequestUpgrade,
}: {
  quickReplies: QuickReplyItem[];
  allowed: boolean;
  onSelectReply: (body: string) => void;
  onSaveReply: (shortcut: string, title: string, body: string) => Promise<void>;
  onDeleteReply: (id: string) => Promise<void>;
  onRequestUpgrade: () => void;
}) {
  const [manageOpen, setManageOpen] = useState(false);
  const [shortcut, setShortcut] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  if (!allowed) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(245,158,11,0.4)", padding: "8px 12px", borderRadius: "10px", fontSize: "12px" }}>
        <span style={{ color: "#fde68a", display: "flex", alignItems: "center", gap: "6px" }}>
          <LockKeyhole size={14} color="#f59e0b" /> Respostas Rápidas bloqueadas no plano atual.
        </span>
        <button type="button" onClick={onRequestUpgrade} style={{ background: "none", border: "none", color: "#ec4899", fontWeight: 800, cursor: "pointer", fontSize: "12px" }}>
          Solicitar Upgrade
        </button>
      </div>
    );
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setSaving(true);
    try {
      await onSaveReply(shortcut.trim() || "/atalho", title.trim(), body.trim());
      setShortcut("");
      setTitle("");
      setBody("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "11px", color: "#c084fc", fontWeight: 800, display: "inline-flex", alignItems: "center", gap: "4px" }}>
          <Zap size={12} color="#ec4899" /> Respostas Rápidas:
        </span>
        {quickReplies.map(qr => (
          <button
            key={qr.id}
            type="button"
            onClick={() => onSelectReply(qr.body)}
            title={qr.body}
            style={{
              padding: "4px 10px",
              borderRadius: "999px",
              background: "rgba(139, 92, 246, 0.16)",
              border: "1px solid rgba(139, 92, 246, 0.4)",
              color: "#e9d5ff",
              fontSize: "11px",
              fontWeight: 700,
              cursor: "pointer"
            }}
          >
            {qr.shortcut} · {qr.title}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setManageOpen(v => !v)}
          style={{
            padding: "4px 10px",
            borderRadius: "999px",
            background: "rgba(236, 72, 153, 0.14)",
            border: "1px solid rgba(236, 72, 153, 0.4)",
            color: "#f472b6",
            fontSize: "11px",
            fontWeight: 700,
            cursor: "pointer"
          }}
        >
          {manageOpen ? "Fechar" : "+ Gerenciar Atalhos"}
        </button>
      </div>

      {manageOpen && (
        <div style={{ background: "#161226", border: "1px solid #3d345c", borderRadius: "12px", padding: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
          <strong style={{ fontSize: "12px", color: "#fff" }}>Gerenciar Respostas Rápidas da Loja</strong>
          <div style={{ display: "grid", gridTemplateColumns: "110px 160px 1fr auto", gap: "8px", alignItems: "center" }}>
            <input
              type="text"
              placeholder="/pix"
              value={shortcut}
              onChange={e => setShortcut(e.target.value)}
              style={{ padding: "7px 10px", borderRadius: "8px", background: "#12101e", border: "1px solid #443c5e", color: "#fff", fontSize: "12px" }}
            />
            <input
              type="text"
              placeholder="Título (ex: Chave Pix)"
              value={title}
              onChange={e => setTitle(e.target.value)}
              style={{ padding: "7px 10px", borderRadius: "8px", background: "#12101e", border: "1px solid #443c5e", color: "#fff", fontSize: "12px" }}
            />
            <input
              type="text"
              placeholder="Texto completo da resposta rápida..."
              value={body}
              onChange={e => setBody(e.target.value)}
              style={{ padding: "7px 10px", borderRadius: "8px", background: "#12101e", border: "1px solid #443c5e", color: "#fff", fontSize: "12px" }}
            />
            <button
              type="button"
              disabled={saving || !title.trim() || !body.trim()}
              onClick={e => void handleAdd(e)}
              className="op-primary"
              style={{ padding: "7px 12px", borderRadius: "8px", fontSize: "12px", fontWeight: 700 }}
            >
              {saving ? "..." : "Salvar"}
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "150px", overflowY: "auto" }}>
            {quickReplies.map(qr => (
              <div key={qr.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", background: "rgba(255,255,255,0.03)", padding: "6px 10px", borderRadius: "8px", fontSize: "12px" }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <strong style={{ color: "#f472b6" }}>{qr.shortcut}</strong> — <strong style={{ color: "#fff" }}>{qr.title}:</strong>{" "}
                  <span style={{ color: "#aba8bf" }}>{qr.body}</span>
                </div>
                <button
                  type="button"
                  onClick={() => void onDeleteReply(qr.id)}
                  style={{ background: "none", border: "none", color: "#f43f5e", cursor: "pointer", padding: "2px 6px" }}
                  title="Excluir resposta rápida"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 3. ABA DE EQUIPE E OPERADORES (MINHA EQUIPE)
// ============================================================================
export function TeamOperatorsSection({
  operators,
  maxOperators,
  planName,
  isSuspended,
  ownerEmail,
  ownerName,
  onAddOperator,
  onUpdateOperatorRole,
  onRevokeOperator,
  onRequestUpgrade,
}: {
  operators: TeamOperatorItem[];
  maxOperators: number;
  planName: string;
  isSuspended: boolean;
  ownerEmail?: string;
  ownerName?: string;
  onAddOperator: (name: string, email: string, role: string, password?: string) => Promise<{ ok: boolean; message?: string }>;
  onUpdateOperatorRole?: (operatorId: string, role: string) => Promise<{ ok: boolean; message?: string }>;
  onRevokeOperator: (operatorId: string) => Promise<void>;
  onRequestUpgrade: (targetPlan: string, reason: string) => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState("agent");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");
  const [err, setErr] = useState("");

  // Edit Role Modal state
  const [editRoleModalOpen, setEditRoleModalOpen] = useState(false);
  const [selectedOpToEdit, setSelectedOpToEdit] = useState<TeamOperatorItem | null>(null);
  const [newRole, setNewRole] = useState("agent");
  const [updatingRole, setUpdatingRole] = useState(false);

  const activeOperators = operators.filter(o => o.status === "active");
  // Total seats used includes owner (1) + active employee operators
  const totalUsed = activeOperators.length + 1;
  const limitReached = totalUsed >= maxOperators;

  const handleGeneratePassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
    let gen = "";
    for (let i = 0; i < 10; i++) {
      gen += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPassword(gen);
    setShowPassword(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice("");
    setErr("");
    if (limitReached) {
      setErr(`Limite de ${maxOperators} acesso(s) atingido no plano ${planName}.`);
      return;
    }
    if (password.length < 6) {
      setErr("Defina uma senha com no mínimo 6 caracteres para o atendente.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await onAddOperator(name.trim(), email.trim(), role, password);
      if (res.ok) {
        setName("");
        setEmail("");
        setPassword("");
        setRole("agent");
        setModalOpen(false);
        setNotice("Atendente convidado com sucesso! O acesso exclusivo foi criado.");
      } else {
        setErr(res.message || "Não foi possível cadastrar o atendente.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveRole = async () => {
    if (!selectedOpToEdit || !onUpdateOperatorRole) return;
    setUpdatingRole(true);
    try {
      const res = await onUpdateOperatorRole(selectedOpToEdit.id, newRole);
      if (res.ok) {
        setEditRoleModalOpen(false);
        setSelectedOpToEdit(null);
        setNotice("Função do atendente atualizada com sucesso!");
      } else {
        setErr(res.message || "Falha ao atualizar função do atendente.");
      }
    } finally {
      setUpdatingRole(false);
    }
  };

  return (
    <section className="op-card" style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
      {/* Cabeçalho Minha Equipe */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", borderBottom: "1px solid #372f4d", paddingBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{ width: "46px", height: "46px", borderRadius: "14px", background: "var(--grad-primary)", display: "grid", placeItems: "center", boxShadow: "0 0 16px rgba(236, 72, 153, 0.35)" }}>
            <Users size={24} color="#fff" />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 800, color: "#fff" }}>
              Minha Equipe — {totalUsed} de {maxOperators} acessos utilizados
            </h2>
            <small style={{ color: "#c2bed4", fontSize: "13px", display: "block", marginTop: "2px" }}>
              Gerencie quem pode atender clientes e assumir conversas na sua empresa.
            </small>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <span style={{
            padding: "6px 14px",
            borderRadius: "999px",
            fontSize: "12px",
            fontWeight: 800,
            background: limitReached ? "rgba(245, 158, 11, 0.16)" : "rgba(0, 219, 140, 0.16)",
            color: limitReached ? "#fcd34d" : "#00db8c",
            border: `1px solid ${limitReached ? "#f59e0b" : "#00db8c"}`
          }}>
            {totalUsed} / {maxOperators} vagas ocupadas ({planName})
          </span>

          <button
            type="button"
            disabled={limitReached || isSuspended}
            onClick={() => {
              setNotice("");
              setErr("");
              setModalOpen(true);
            }}
            className="op-primary"
            style={{
              padding: "10px 18px",
              borderRadius: "10px",
              fontWeight: 800,
              fontSize: "13px",
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              opacity: limitReached ? 0.6 : 1,
              cursor: limitReached ? "not-allowed" : "pointer"
            }}
          >
            <UserPlus size={16} /> Convidar Atendente
          </button>
        </div>
      </div>

      {/* Explicação Clara da Equipe */}
      <div style={{
        padding: "14px 18px",
        borderRadius: "14px",
        background: "rgba(139, 92, 246, 0.1)",
        border: "1px solid rgba(139, 92, 246, 0.3)",
        display: "flex",
        alignItems: "center",
        gap: "12px"
      }}>
        <HelpCircle size={22} color="#c084fc" style={{ flexShrink: 0 }} />
        <span style={{ fontSize: "13px", color: "#e9d5ff", lineHeight: 1.5 }}>
          <strong>O que são operadores?</strong> Os operadores são pessoas da sua empresa que podem acessar o painel e atender clientes. <strong>Eles não precisam conectar o WhatsApp pessoal.</strong> Todas as respostas são enviadas pelo WhatsApp comercial da sua empresa de forma centralizada.
        </span>
      </div>

      {notice && (
        <div style={{ padding: "12px 16px", borderRadius: "10px", background: "rgba(0, 219, 140, 0.14)", border: "1px solid #00db8c", color: "#d1fae5", fontSize: "13px" }}>
          {notice}
        </div>
      )}
      {err && (
        <div style={{ padding: "12px 16px", borderRadius: "10px", background: "rgba(244, 63, 94, 0.16)", border: "1px solid #f43f5e", color: "#fecdd3", fontSize: "13px" }}>
          {err}
        </div>
      )}

      {/* Alerta de Limite de Plano Atingido */}
      {limitReached && (
        <div style={{
          padding: "18px 22px",
          borderRadius: "14px",
          background: "linear-gradient(135deg, rgba(60, 20, 80, 0.5), rgba(30, 12, 45, 0.7))",
          border: "1px dashed #ec4899",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "14px"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <LockKeyhole size={26} color="#ec4899" style={{ flexShrink: 0 }} />
            <div>
              <strong style={{ color: "#fff", fontSize: "15px", display: "block" }}>
                Limite de {maxOperators} acesso(s) do plano {planName} atingido
              </strong>
              <span style={{ color: "#d1c8e6", fontSize: "13px" }}>
                O titular da conta conta como 1 acesso. Para adicionar mais funcionários à sua equipe, solicite o upgrade para o CRM Business (até 3 operadores) ou CRM Premium (até 5 operadores).
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onRequestUpgrade(maxOperators < 3 ? "CRM Business" : "CRM Premium", "Expandir limite de operadores da equipe")}
            className="op-primary"
            style={{ padding: "10px 18px", borderRadius: "10px", fontWeight: 800, fontSize: "13px" }}
          >
            🔓 Solicitar Upgrade de Equipe
          </button>
        </div>
      )}

      {/* Grid de Membros da Equipe */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <h4 style={{ margin: "4px 0 0", fontSize: "15px", color: "#fff", display: "flex", alignItems: "center", gap: "8px" }}>
          <Users size={16} color="#ec4899" /> Membros com Acesso ({totalUsed})
        </h4>

        {/* 1. CARTÃO DO ADMINISTRADOR PRINCIPAL (PROPRIETÁRIO) */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "16px 20px",
          borderRadius: "14px",
          background: "linear-gradient(135deg, rgba(236, 72, 153, 0.12), rgba(139, 92, 246, 0.1))",
          border: "1px solid rgba(236, 72, 153, 0.4)",
          flexWrap: "wrap",
          gap: "12px"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div style={{
              width: "42px", height: "42px", borderRadius: "50%",
              background: "linear-gradient(135deg, #ec4899, #8b5cf6)",
              display: "grid", placeItems: "center", color: "#fff", fontWeight: 800, fontSize: "15px"
            }}>
              👑
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <strong style={{ color: "#fff", fontSize: "15px" }}>
                  {ownerName || "Administrador Principal"}
                </strong>
                <span style={{
                  background: "linear-gradient(90deg, #ec4899, #8b5cf6)",
                  color: "#fff",
                  fontSize: "11px",
                  fontWeight: 800,
                  padding: "2px 8px",
                  borderRadius: "999px"
                }}>
                  👑 Administrador Principal / Titular
                </span>
              </div>
              <small style={{ color: "#c2bed4", fontSize: "12px", display: "block", marginTop: "2px" }}>
                {ownerEmail || "Acesso titular com gerenciamento total de WhatsApps, equipe e cobrança"}
              </small>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{
              fontSize: "11px",
              padding: "4px 10px",
              borderRadius: "999px",
              fontWeight: 800,
              background: "rgba(0, 219, 140, 0.15)",
              color: "#00db8c",
              border: "1px solid rgba(0, 219, 140, 0.3)"
            }}>
              ● Acesso Total (Ativo)
            </span>
          </div>
        </div>

        {/* 2. CARTÕES DOS ATENDENTES CONVIDADOS */}
        {operators.length === 0 ? (
          <div style={{
            padding: "30px 20px",
            textAlign: "center",
            background: "rgba(255,255,255,0.02)",
            borderRadius: "14px",
            border: "1px dashed #372f4d",
            color: "#8e87a2",
            fontSize: "13px"
          }}>
            Nenhum atendente adicional convidado. Você opera atualmente com o acesso titular ({maxOperators - 1} vaga(s) disponível(eis) no plano {planName}).
          </div>
        ) : (
          operators.map(op => {
            const initials = op.name ? op.name.slice(0, 2).toUpperCase() : "AT";
            const roleLabel = op.role === "admin"
              ? "Supervisor / Administrador"
              : op.role === "viewer"
              ? "Visualizador (Somente Leitura)"
              : "Atendente Comercial";

            return (
              <div
                key={op.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "14px 18px",
                  borderRadius: "14px",
                  background: op.status === "active" ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.3)",
                  border: `1px solid ${op.status === "active" ? "#372f4d" : "#262138"}`,
                  opacity: op.status === "active" ? 1 : 0.65,
                  flexWrap: "wrap",
                  gap: "12px",
                  transition: "all 0.2s ease"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                  <div style={{
                    width: "40px", height: "40px", borderRadius: "50%",
                    background: op.status === "active" ? "rgba(139, 92, 246, 0.25)" : "rgba(107, 114, 128, 0.2)",
                    color: op.status === "active" ? "#c4b5fd" : "#9ca3af",
                    display: "grid", placeItems: "center", fontWeight: 800, fontSize: "14px"
                  }}>
                    {initials}
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <strong style={{ color: "#fff", fontSize: "15px" }}>
                        {op.name}
                      </strong>
                      <span style={{
                        fontSize: "11px",
                        color: op.role === "admin" ? "#f472b6" : op.role === "viewer" ? "#9ca3af" : "#c084fc",
                        background: "rgba(255,255,255,0.06)",
                        padding: "2px 8px",
                        borderRadius: "6px",
                        fontWeight: 700
                      }}>
                        {roleLabel}
                      </span>
                    </div>
                    <small style={{ color: "#9ca3af", fontSize: "12px", display: "block", marginTop: "2px" }}>
                      {op.email}
                    </small>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{
                    fontSize: "11px",
                    padding: "3px 10px",
                    borderRadius: "999px",
                    fontWeight: 700,
                    background: op.status === "active" ? "rgba(0,219,140,0.15)" : "rgba(239,68,68,0.15)",
                    color: op.status === "active" ? "#00db8c" : "#f87171"
                  }}>
                    {op.status === "active" ? "● Ativo" : "Acesso Revogado"}
                  </span>

                  {op.status === "active" && onUpdateOperatorRole && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedOpToEdit(op);
                        setNewRole(op.role);
                        setEditRoleModalOpen(true);
                      }}
                      className="op-refresh"
                      style={{ padding: "6px 12px", fontSize: "12px" }}
                    >
                      Alterar Função
                    </button>
                  )}

                  {op.status === "active" && (
                    <button
                      type="button"
                      onClick={() => void onRevokeOperator(op.id)}
                      className="op-refresh"
                      style={{ padding: "6px 12px", fontSize: "12px", color: "#fca5a5", borderColor: "#ef4444" }}
                    >
                      Revogar Acesso
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* MODAL: CONVIDAR ATENDENTE */}
      {modalOpen && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(6px)",
          display: "grid", placeItems: "center", zIndex: 9999, padding: "20px"
        }}>
          <div className="op-card" style={{ maxWidth: "480px", width: "100%", background: "#161327", border: "1px solid #4a3c68", borderRadius: "18px", padding: "26px", display: "flex", flexDirection: "column", gap: "18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", borderBottom: "1px solid #372f4d", paddingBottom: "14px" }}>
              <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: "var(--grad-primary)", display: "grid", placeItems: "center" }}>
                <UserPlus size={20} color="#fff" />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: "18px", color: "#fff" }}>Convidar Atendente para a Equipe</h3>
                <small style={{ color: "#c2bed4" }}>Crie um login seguro para o funcionário acessar o CRM.</small>
              </div>
            </div>

            <div style={{
              padding: "12px 14px",
              borderRadius: "10px",
              background: "rgba(139, 92, 246, 0.12)",
              border: "1px solid rgba(139, 92, 246, 0.3)",
              fontSize: "12px",
              color: "#e9d5ff",
              lineHeight: 1.4
            }}>
              🔒 <strong>Segurança do Acesso:</strong> O funcionário terá seu próprio login autenticado para atender no CRM da sua empresa. Ele não terá acesso à sua conta de administrador nem precisará de WhatsApp pessoal.
            </div>

            <form onSubmit={e => void handleSubmit(e)} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#c2bed4", marginBottom: "4px" }}>
                  Nome Completo do Atendente
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: João da Silva"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  style={{ width: "100%", padding: "10px 14px", borderRadius: "10px", background: "#120e20", border: "1px solid #443c5e", color: "#fff", fontSize: "13px" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#c2bed4", marginBottom: "4px" }}>
                  E-mail de Acesso do Atendente
                </label>
                <input
                  type="email"
                  required
                  placeholder="joao@suaempresa.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  style={{ width: "100%", padding: "10px 14px", borderRadius: "10px", background: "#120e20", border: "1px solid #443c5e", color: "#fff", fontSize: "13px" }}
                />
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 700, color: "#c2bed4" }}>
                    Senha Inicial de Acesso
                  </label>
                  <button
                    type="button"
                    onClick={handleGeneratePassword}
                    style={{ background: "none", border: "none", color: "#ec4899", fontSize: "11px", fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}
                  >
                    ⚡ Gerar Senha Segura
                  </button>
                </div>
                <div style={{ position: "relative" }}>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    placeholder="Mínimo 6 caracteres"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    style={{ width: "100%", padding: "10px 40px 10px 14px", borderRadius: "10px", background: "#120e20", border: "1px solid #443c5e", color: "#fff", fontSize: "13px" }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#8e87a2", cursor: "pointer" }}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <small style={{ color: "#8e87a2", fontSize: "11px", marginTop: "4px", display: "block" }}>
                  O atendente poderá alterar esta senha posteriormente no painel dele.
                </small>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#c2bed4", marginBottom: "4px" }}>
                  Função no Atendimento
                </label>
                <select
                  value={role}
                  onChange={e => setRole(e.target.value)}
                  style={{ width: "100%", padding: "10px 14px", borderRadius: "10px", background: "#120e20", border: "1px solid #443c5e", color: "#fff", fontSize: "13px" }}
                >
                  <option value="agent">Atendente Comercial (Atende conversas e assume clientes)</option>
                  <option value="admin">Supervisor (Pode visualizar todas as conversas e relatórios)</option>
                  <option value="viewer">Visualizador (Somente leitura, não envia mensagens)</option>
                </select>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="op-refresh"
                  style={{ padding: "10px 18px", borderRadius: "10px", fontSize: "13px" }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="op-primary"
                  style={{ padding: "10px 22px", borderRadius: "10px", fontWeight: 800, fontSize: "13px" }}
                >
                  {submitting ? "Criando Acesso..." : "Confirmar e Convidar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDITAR FUNÇÃO DO ATENDENTE */}
      {editRoleModalOpen && selectedOpToEdit && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(6px)",
          display: "grid", placeItems: "center", zIndex: 9999, padding: "20px"
        }}>
          <div className="op-card" style={{ maxWidth: "420px", width: "100%", background: "#161327", border: "1px solid #4a3c68", borderRadius: "18px", padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
            <h3 style={{ margin: 0, fontSize: "17px", color: "#fff" }}>
              Alterar Função — {selectedOpToEdit.name}
            </h3>
            <p style={{ margin: 0, fontSize: "13px", color: "#c2bed4" }}>
              Selecione o nível de permissão deste atendente no painel da sua loja:
            </p>

            <select
              value={newRole}
              onChange={e => setNewRole(e.target.value)}
              style={{ width: "100%", padding: "10px 14px", borderRadius: "10px", background: "#120e20", border: "1px solid #443c5e", color: "#fff", fontSize: "13px" }}
            >
              <option value="agent">Atendente Comercial (Atende conversas e assume clientes)</option>
              <option value="admin">Supervisor (Pode visualizar todas as conversas e relatórios)</option>
              <option value="viewer">Visualizador (Somente leitura)</option>
            </select>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
              <button
                type="button"
                onClick={() => setEditRoleModalOpen(false)}
                className="op-refresh"
                style={{ padding: "8px 16px", borderRadius: "8px", fontSize: "13px" }}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={updatingRole}
                onClick={handleSaveRole}
                className="op-primary"
                style={{ padding: "8px 18px", borderRadius: "8px", fontWeight: 800, fontSize: "13px" }}
              >
                {updatingRole ? "Salvando..." : "Salvar Alteração"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ============================================================================
// 3.B. PAINEL EDUCATIVO: COMO FUNCIONA O ATENDIMENTO
// ============================================================================
export function HowAttendanceWorksPanel() {
  return (
    <div className="op-card" style={{
      background: "linear-gradient(135deg, rgba(30, 20, 50, 0.75), rgba(16, 12, 30, 0.95))",
      border: "1px solid rgba(139, 92, 246, 0.3)",
      borderRadius: "18px",
      padding: "22px 24px",
      display: "flex",
      flexDirection: "column",
      gap: "18px",
      marginBottom: "20px"
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: "12px" }}>
        <Sparkles size={20} color="#c084fc" />
        <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 800, color: "#fff" }}>
          Como Funciona o Atendimento no Novaes CRM IA
        </h3>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: "14px"
      }}>
        {/* Etapa 1 */}
        <div style={{
          padding: "16px",
          borderRadius: "14px",
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
          flexDirection: "column",
          gap: "8px"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{
              width: "28px", height: "28px", borderRadius: "50%",
              background: "rgba(236, 72, 153, 0.2)", color: "#ec4899",
              display: "grid", placeItems: "center", fontWeight: 800, fontSize: "13px"
            }}>1</span>
            <strong style={{ color: "#fff", fontSize: "14px" }}>Cliente envia mensagem</strong>
          </div>
          <p style={{ margin: 0, fontSize: "12px", color: "#aba8bf", lineHeight: 1.5 }}>
            A mensagem chega em qualquer um dos números de <strong>WhatsApp comercial</strong> da sua empresa conectados ao painel.
          </p>
        </div>

        {/* Etapa 2 */}
        <div style={{
          padding: "16px",
          borderRadius: "14px",
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
          flexDirection: "column",
          gap: "8px"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{
              width: "28px", height: "28px", borderRadius: "50%",
              background: "rgba(0, 219, 140, 0.2)", color: "#00db8c",
              display: "grid", placeItems: "center", fontWeight: 800, fontSize: "13px"
            }}>2</span>
            <strong style={{ color: "#fff", fontSize: "14px" }}>IA da NovaesWeb atende</strong>
          </div>
          <p style={{ margin: 0, fontSize: "12px", color: "#aba8bf", lineHeight: 1.5 }}>
            A IA responde na hora com as informações, catálogo e horários do seu negócio 24 horas por dia.
          </p>
        </div>

        {/* Etapa 3 */}
        <div style={{
          padding: "16px",
          borderRadius: "14px",
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
          flexDirection: "column",
          gap: "8px"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{
              width: "28px", height: "28px", borderRadius: "50%",
              background: "rgba(139, 92, 246, 0.2)", color: "#c4b5fd",
              display: "grid", placeItems: "center", fontWeight: 800, fontSize: "13px"
            }}>3</span>
            <strong style={{ color: "#fff", fontSize: "14px" }}>Funcionário assume</strong>
          </div>
          <p style={{ margin: 0, fontSize: "12px", color: "#aba8bf", lineHeight: 1.5 }}>
            Se o cliente solicitar humano ou houver assunto delicado, a IA pausa e notifica sua equipe no painel.
          </p>
        </div>

        {/* Etapa 4 */}
        <div style={{
          padding: "16px",
          borderRadius: "14px",
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
          flexDirection: "column",
          gap: "8px"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{
              width: "28px", height: "28px", borderRadius: "50%",
              background: "rgba(245, 158, 11, 0.2)", color: "#fcd34d",
              display: "grid", placeItems: "center", fontWeight: 800, fontSize: "13px"
            }}>4</span>
            <strong style={{ color: "#fff", fontSize: "14px" }}>Responde pelo WhatsApp da loja</strong>
          </div>
          <p style={{ margin: 0, fontSize: "12px", color: "#aba8bf", lineHeight: 1.5 }}>
            O atendente conversa pelo painel usando o WhatsApp oficial da empresa, sem precisar do celular pessoal!
          </p>
        </div>
      </div>

      <div style={{
        padding: "12px 18px",
        borderRadius: "12px",
        background: "rgba(139, 92, 246, 0.12)",
        border: "1px solid rgba(139, 92, 246, 0.3)",
        display: "flex",
        alignItems: "center",
        gap: "12px"
      }}>
        <Smartphone size={18} color="#c084fc" style={{ flexShrink: 0 }} />
        <span style={{ fontSize: "13px", color: "#e9d5ff", lineHeight: 1.5 }}>
          <strong>Acesso Flexível e Centralizado:</strong> Um atendente pode trabalhar com conversas de diferentes números de WhatsApp da mesma empresa. Os operadores <strong>não precisam</strong> de um chip ou celular exclusivo.
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// 4. ABA DE INDICADORES E RELATÓRIOS EM 3 NÍVEIS (ETAPA 7)
// ============================================================================
export function ReportsAndIndicatorsSection({reports,loadingReports,onRefresh,onRequestUpgrade,featureStates}: {
  reports:ReportsPayload|null;loadingReports:boolean;onRefresh:()=>void;onRequestUpgrade:(plan:string,reason:string)=>void;featureStates:Record<string,FeatureStateItem>;
}) {
  const basic=reports?.basicIndicators, comm=reports?.commercialIndicators, adv=reports?.premiumAnalytics;
  return <section style={{display:"grid",gap:"20px"}}>
    <header className="op-card"><h2>Indicadores & Relatórios Comerciais</h2><button type="button" className="op-refresh" disabled={loadingReports} onClick={onRefresh}>{loadingReports?"Atualizando...":"Atualizar Indicadores"}</button></header>
    <section className="op-card"><h3>Indicadores Básicos de Operação</h3>
      {!featureAvailable(featureStates,"basic_indicators") || !basic ? <FeatureUnavailable feature={featureStates.basic_indicators} onUpgrade={onRequestUpgrade}/> : <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,180px),1fr))",gap:"12px"}}>
        {[["Total de Conversas",basic.totalConversations],["Em andamento",basic.activeConversations],["Atendidas pela IA",basic.aiConversations],["Atendimento humano",basic.humanConversations],["Contatos cadastrados",basic.totalContacts],["Franquia consumida",basic.quotaUsed+" / "+basic.quotaLimit]].map(([label,value])=><div key={label} style={{padding:"12px",background:"rgba(255,255,255,.03)",borderRadius:"12px"}}><span>{label}</span><strong style={{display:"block",fontSize:"23px"}}>{value}</strong></div>)}
      </div>}
    </section>
    <section className="op-card"><h3>Indicadores Comerciais</h3>
      {!featureAvailable(featureStates,"commercial_indicators") || !comm ? <FeatureUnavailable feature={featureStates.commercial_indicators} onUpgrade={onRequestUpgrade}/> : <>
        <h4>Distribuição por prioridade</h4>{Object.entries(comm.priorityBreakdown).map(([label,count])=><p key={label}>{label}: <strong>{count}</strong></p>)}
        <h4>Distribuição por etiqueta</h4>{Object.entries(comm.tagBreakdown).map(([label,count])=><p key={label}>{label}: <strong>{count}</strong></p>)}
        <p>Transferências IA → humano: <strong>{comm.handoffCount}</strong></p><p>Taxa de transferência: <strong>{comm.handoffRate}%</strong></p><p>Pesquisas respondidas: <strong>{comm.totalSurveys}</strong> · Nota média: <strong>{comm.avgSatisfaction}</strong></p>
      </>}
    </section>
    <section className="op-card"><h3>Relatórios Avançados — CRM Premium</h3>
      {!featureAvailable(featureStates,"advanced_reports") || !adv ? <FeatureUnavailable feature={featureStates.advanced_reports} onUpgrade={onRequestUpgrade}/> : <>
        {featureAvailable(featureStates,"satisfaction_analytics") ? <><h4>Análise de satisfação</h4><p>CSAT: <strong>{adv.csatPercent}%</strong></p>{Object.entries(adv.starDistribution).map(([rating,count])=><p key={rating}>{rating} estrelas: <strong>{count}</strong></p>)}</> : <FeatureUnavailable feature={featureStates.satisfaction_analytics} onUpgrade={onRequestUpgrade}/>}
        {featureAvailable(featureStates,"operator_indicators") ? <><h4>Indicadores por atendente</h4>{adv.operatorMetrics.length ? adv.operatorMetrics.map(op=><div key={op.operatorId}><strong>{op.name}</strong><p>{op.conversationsHandled} conversas · {op.surveysCount} avaliações · Nota: {op.avgRating ?? "—"}</p></div>) : <p>Nenhum atendente cadastrado.</p>}</> : <FeatureUnavailable feature={featureStates.operator_indicators} onUpgrade={onRequestUpgrade}/>}
      </>}
    </section>
  </section>;
}

// ============================================================================
// 5. MATRIZ DE GOVERNANÇA DE 4 ESTADOS (ETAPA 4)
// ============================================================================
export function FeatureGovernanceMatrix({
  featureStates,
  onRequestUpgrade,
}: {
  featureStates: Record<string, FeatureStateItem>;
  onRequestUpgrade: (targetPlan: string, reason: string) => void;
}) {
  const list = Object.values(featureStates || {});
  if (list.length === 0) return null;

  const badgeForState = (item: FeatureStateItem) => {
    if (item.state === "allowed") {
      return { bg: "rgba(0, 219, 140, 0.15)", border: "#00db8c", color: "#00db8c", label: "✓ Liberado pelo plano", icon: <Check size={13} /> };
    }
    if (item.state === "locked_by_plan") {
      return { bg: "rgba(245, 158, 11, 0.16)", border: "#f59e0b", color: "#fcd34d", label: `🔒 Bloqueado (${item.minPlanName})`, icon: <LockKeyhole size={13} /> };
    }
    if (item.state === "maintenance") {
      return { bg: "rgba(59, 130, 246, 0.16)", border: "#3b82f6", color: "#93c5fd", label: "🛠️ Indisponível (Manutenção)", icon: <Wrench size={13} /> };
    }
    return { bg: "rgba(244, 63, 94, 0.18)", border: "#f43f5e", color: "#fda4af", label: "⛔ Suspenso administrativamente", icon: <Ban size={13} /> };
  };

  return (
    <div className="op-card" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div>
        <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 800, color: "#fff" }}>
          Central de Funcionalidades & Direitos do Plano
        </h3>
        <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#aba8bf" }}>
          Visualize todas as funcionalidades do Novaes CRM IA e o estado atual na sua conta (Liberado, Bloqueado pelo plano, Em manutenção ou Suspenso).
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "12px" }}>
        {list.map(item => {
          const b = badgeForState(item);
          return (
            <div
              key={item.id}
              style={{
                padding: "14px",
                borderRadius: "12px",
                background: item.state === "allowed" ? "rgba(255,255,255,0.03)" : "rgba(15,12,24,0.65)",
                border: `1px solid ${item.state === "allowed" ? "rgba(255,255,255,0.08)" : b.border}`,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: "10px"
              }}
            >
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                  <strong style={{ color: "#fff", fontSize: "14px" }}>{item.name}</strong>
                </div>
                <p style={{ margin: 0, fontSize: "12px", color: "#9ca3af", lineHeight: 1.4 }}>{item.description}</p>
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginTop: "4px", flexWrap: "wrap" }}>
                <span style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  fontSize: "11px",
                  fontWeight: 800,
                  padding: "3px 9px",
                  borderRadius: "999px",
                  background: b.bg,
                  color: b.color,
                  border: `1px solid ${b.border}`
                }}>
                  {b.icon} {b.label}
                </span>

                {item.state === "locked_by_plan" && (
                  <button
                    type="button"
                    onClick={() => onRequestUpgrade(item.minPlanId, `Liberar recurso: ${item.name}`)}
                    style={{
                      padding: "4px 10px",
                      borderRadius: "8px",
                      background: "linear-gradient(90deg, #ec4899, #8b5cf6)",
                      border: "none",
                      color: "#fff",
                      fontSize: "11px",
                      fontWeight: 800,
                      cursor: "pointer"
                    }}
                  >
                    Solicitar Upgrade
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// 6. MODAL INTERNO DE SOLICITAÇÃO DE UPGRADE (ETAPA 4 & ETAPA 8)
// ============================================================================
export function UpgradeRequestModal({
  open,
  initialPlan,
  initialNotes,
  currentPlanName,
  onClose,
  onSubmitUpgrade,
}: {
  open: boolean;
  initialPlan: string;
  initialNotes: string;
  currentPlanName: string;
  onClose: () => void;
  onSubmitUpgrade: (requestedPlan: string, notes: string) => Promise<{ ok: boolean; message?: string }>;
}) {
  const [selectedPlan, setSelectedPlan] = useState(commercialPlanId(initialPlan || "CRM Business"));
  const [notes, setNotes] = useState(initialNotes || "");
  const [sending, setSending] = useState(false);
  const [doneMsg, setDoneMsg] = useState("");
  const [submitError, setSubmitError] = useState("");

  React.useEffect(() => {
    if (open) {
      setSelectedPlan(commercialPlanId(initialPlan || "CRM Business"));
      setNotes(initialNotes || "");
      setDoneMsg("");
    }
  }, [open, initialPlan, initialNotes]);

  if (!open) return null;

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setSubmitError("");
    try {
      const res = await onSubmitUpgrade(selectedPlan, notes);
      if (res.ok) {
        setDoneMsg(res.message || "Solicitação de upgrade registrada com sucesso no Painel Master da NovaesWeb!");
      } else setSubmitError(res.message || "Não foi possível enviar a solicitação.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.75)",
      zIndex: 9999,
      display: "grid",
      placeItems: "center",
      padding: "16px"
    }}>
      <div role="dialog" aria-modal="true" aria-label="Solicitar upgrade de plano" className="op-card" style={{ maxWidth: "480px", width: "100%", border: "2px solid #ec4899", display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: "18px", color: "#fff", display: "flex", alignItems: "center", gap: "8px" }}>
            <Sparkles size={20} color="#ec4899" /> Solicitar Upgrade de Plano
          </h3>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "#9ca3af", fontSize: "18px", cursor: "pointer" }}>✕</button>
        </div>

        {submitError && <p role="alert">{submitError}</p>}
        {doneMsg ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ padding: "14px", borderRadius: "12px", background: "rgba(0,219,140,0.15)", border: "1px solid #00db8c", color: "#d1fae5", fontSize: "14px" }}>
              ✅ {doneMsg}
            </div>
            <button type="button" onClick={onClose} className="op-primary" style={{ padding: "10px", borderRadius: "10px", fontWeight: 700 }}>
              Fechar
            </button>
          </div>
        ) : (
          <form onSubmit={e => void handleConfirm(e)} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <p style={{ margin: 0, fontSize: "13px", color: "#c2bed4" }}>
              Plano atual: <strong>{currentPlanName}</strong>. Escolha o novo plano desejado para enviar a solicitação diretamente à administração da NovaesWeb:
            </p>

            <label style={{ fontSize: "13px", color: "#fff", fontWeight: 700 }}>
              Plano Desejado
              <select
                value={selectedPlan}
                onChange={e => setSelectedPlan(e.target.value)}
                style={{ width: "100%", marginTop: "6px", padding: "11px 12px", borderRadius: "10px", background: "#141124", border: "1px solid #443c5e", color: "#fff", fontSize: "14px" }}
              >
                <option value="crm-start">CRM Start — R$ 59,90/mês (200 atendimentos · 1 WhatsApp · 1 operador)</option>
                <option value="crm-business">CRM Business — R$ 99,90/mês (600 atendimentos · 3 WhatsApps · 3 operadores)</option>
                <option value="crm-premium">CRM Premium — R$ 159,90/mês (1.500 atendimentos · 5 WhatsApps · 5 operadores)</option>
              </select>
            </label>

            <label style={{ fontSize: "13px", color: "#fff", fontWeight: 700 }}>
              Observação ou necessidade da loja (opcional)
              <textarea
                rows={3}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Ex.: Preciso liberar mais números de WhatsApp e etiquetas comerciais..."
                style={{ width: "100%", marginTop: "6px", padding: "10px 12px", borderRadius: "10px", background: "#141124", border: "1px solid #443c5e", color: "#fff", fontSize: "13px" }}
              />
            </label>

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button type="button" onClick={onClose} className="op-refresh">Cancelar</button>
              <button type="submit" disabled={sending} className="op-primary" style={{ padding: "10px 20px", borderRadius: "10px", fontWeight: 800 }}>
                {sending ? "Enviando..." : "Confirmar Solicitação de Upgrade"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

