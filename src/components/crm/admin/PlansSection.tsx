"use client";

// Secao "Planos Comerciais & Franquias de IA" do Painel Master.
//
// Extraida de src/app/admin/page.tsx (bloco `currentNav === "plans"`) para
// reduzir o arquivo de 7.294 linhas. A marcacao e os estilos sao os mesmos do
// bloco original; a unica mudanca e que os dados e callbacks chegam por props
// em vez de fecharem sobre o escopo do componente AdminCRM.

import { Check, Copy, Eye, Trash2, Edit3, Zap } from "lucide-react";
import type { PlanItem, MasterClient } from "./master-types";

export type PlansSectionProps = {
  plans: PlanItem[];
  clients: MasterClient[];
  clientCountsMap: Record<string, number>;
  planDistribution: Record<string, number>;
  onViewEnrolledStores: (plan: PlanItem) => void;
  onOpenEditPlan: (plan: PlanItem) => void;
  onOpenDuplicate: (plan: PlanItem) => void;
  onTogglePlanStatus: (plan: PlanItem) => void;
  onDeletePlan: (plan: PlanItem) => void;
  onDiscardDraft: (planId: string) => void;
  onOpenAssignModal: (client: MasterClient) => void;
};

export function PlansSection({
  plans,
  clients,
  clientCountsMap,
  planDistribution,
  onViewEnrolledStores,
  onOpenEditPlan,
  onOpenDuplicate,
  onTogglePlanStatus,
  onDeletePlan,
  onDiscardDraft,
  onOpenAssignModal,
}: PlansSectionProps) {
  return (
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

      <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "20px", marginBottom: "28px"}}>
        {plans.map(p => {
          const enrolled = clientCountsMap[p.id] ?? planDistribution[p.name] ?? 0;
          const isActive = p.isActive !== false;
          return (
            <div key={p.id} className="op-card" style={{
              padding: "20px",
              borderRadius: "16px",
              border: p.isPopular ? "1px solid rgba(236, 72, 153, 0.5)" : "1px solid rgba(255,255,255,0.08)",
              background: p.isPopular ? "linear-gradient(160deg, rgba(236,72,153,0.08), rgba(139,92,246,0.06))" : "rgba(255,255,255,0.02)",
              position: "relative"
            }}>
              <div style={{display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px"}}>
                <div>
                  <div style={{display: "flex", alignItems: "center", gap: "8px"}}>
                    <strong style={{fontSize: "17px", color: "white"}}>{p.name}</strong>
                    {p.isPopular && (
                      <span style={{fontSize: "10px", fontWeight: 700, color: "#ec4899", border: "1px solid rgba(236,72,153,0.4)", padding: "2px 6px", borderRadius: "6px"}}>RECOMENDADO</span>
                    )}
                  </div>
                  <div style={{fontSize: "12px", color: "#9ca3af", marginTop: "2px"}}>ID: {p.id}</div>
                </div>
                <span style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  padding: "3px 8px",
                  borderRadius: "6px",
                  color: isActive ? "#22c55e" : "#f43f5e",
                  border: `1px solid ${isActive ? "rgba(34,197,94,0.4)" : "rgba(244,63,94,0.4)"}`,
                  background: isActive ? "rgba(34,197,94,0.1)" : "rgba(244,63,94,0.1)"
                }}>{isActive ? "ATIVO" : "INATIVO"}</span>
              </div>

              <div style={{display: "flex", alignItems: "baseline", gap: "6px", marginBottom: "12px"}}>
                <span style={{fontSize: "13px", color: "#9ca3af"}}>R$</span>
                <strong style={{fontSize: "30px", color: "white", lineHeight: 1}}>{p.price}</strong>
                <span style={{fontSize: "13px", color: "#9ca3af"}}>/mês</span>
              </div>

              <p style={{fontSize: "13px", color: "#c2bed4", lineHeight: "1.5", marginBottom: "14px", minHeight: "54px"}}>{p.description}</p>

              <div style={{display: "grid", gap: "6px", marginBottom: "16px", fontSize: "12px", color: "#e2e8f0"}}>
                <div style={{display: "flex", justifyContent: "space-between", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "6px"}}>
                  <span style={{color: "#9ca3af"}}>Mensagens IA / mês</span>
                  <strong>{p.quotaLimit.toLocaleString("pt-BR")}</strong>
                </div>
                <div style={{display: "flex", justifyContent: "space-between", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "6px"}}>
                  <span style={{color: "#9ca3af"}}>WhatsApp conectados</span>
                  <strong>{p.maxWhatsAppConnections ?? 1}</strong>
                </div>
                <div style={{display: "flex", justifyContent: "space-between", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "6px"}}>
                  <span style={{color: "#9ca3af"}}>Operadores</span>
                  <strong>{p.maxOperators ?? 1}</strong>
                </div>
                <div style={{display: "flex", justifyContent: "space-between", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "6px"}}>
                  <span style={{color: "#9ca3af"}}>Recursos técnicos</span>
                  <strong>{(p.allowedFeatures ?? p.features).length} de 18</strong>
                </div>
                <div style={{display: "flex", justifyContent: "space-between", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "6px"}}>
                  <span style={{color: "#9ca3af"}}>Lojas neste plano</span>
                  <strong>{enrolled}</strong>
                </div>
              </div>

              {p.hasDraft && (
                <div style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#fbbf24",
                  border: "1px dashed rgba(251,191,36,0.5)",
                  borderRadius: "8px",
                  padding: "6px 10px",
                  marginBottom: "12px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px"
                }}>
                  RASCUNHO PENDENTE
                </div>
              )}

              <div style={{display: "flex", flexWrap: "wrap", gap: "8px"}}>
                <button
                  type="button"
                  className="op-btn op-btn-ghost"
                  onClick={() => onViewEnrolledStores(p)}
                  style={{fontSize: "12px", padding: "7px 10px", display: "flex", alignItems: "center", gap: "5px"}}
                >
                  <Eye size={13}/> Ver Lojas ({enrolled})
                </button>
                <button
                  type="button"
                  className="op-btn op-btn-primary"
                  onClick={() => onOpenEditPlan(p)}
                  style={{fontSize: "12px", padding: "7px 10px", display: "flex", alignItems: "center", gap: "5px"}}
                >
                  <Edit3 size={13}/> Editar
                </button>
                <button
                  type="button"
                  className="op-btn op-btn-ghost"
                  onClick={() => onOpenDuplicate(p)}
                  style={{fontSize: "12px", padding: "7px 10px", display: "flex", alignItems: "center", gap: "5px"}}
                >
                  <Copy size={13}/> Duplicar
                </button>
                <button
                  type="button"
                  className="op-btn op-btn-ghost"
                  onClick={() => onTogglePlanStatus(p)}
                  style={{fontSize: "12px", padding: "7px 10px"}}
                >
                  {isActive ? "Desativar" : "Ativar"}
                </button>
                {p.hasDraft && (
                  <button
                    type="button"
                    className="op-btn op-btn-ghost"
                    onClick={() => onDiscardDraft(p.id)}
                    style={{fontSize: "12px", padding: "7px 10px"}}
                  >
                    Descartar rascunho
                  </button>
                )}
                <button
                  type="button"
                  className="op-btn op-btn-ghost"
                  onClick={() => onDeletePlan(p)}
                  style={{fontSize: "12px", padding: "7px 10px", color: "#f43f5e", borderColor: "rgba(244,63,94,0.4)", display: "flex", alignItems: "center", gap: "5px"}}
                >
                  <Trash2 size={13}/> Excluir
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="op-card" style={{padding: "20px", borderRadius: "16px"}}>
        <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px"}}>
          <div>
            <strong style={{fontSize: "15px", color: "white"}}>Tabela de Exceções Contratuais</strong>
            <p style={{fontSize: "12px", color: "#9ca3af", margin: "2px 0 0"}}>Lojas com contrato personalizado, fora do padrão do plano.</p>
          </div>
        </div>
        {clients.filter(c => Boolean(c.plan.customQuotaOverride)).length === 0 ? (
          <p style={{fontSize: "13px", color: "#9ca3af", margin: 0}}>Nenhuma exceção contratual registrada.</p>
        ) : (
          <div style={{display: "grid", gap: "10px"}}>
            {clients.filter(c => Boolean(c.plan.customQuotaOverride)).map(c => {
              const hasException = Boolean(c.plan.customQuotaOverride);
              return (
                <div key={c.id} style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "12px",
                  padding: "12px 14px",
                  borderRadius: "10px",
                  border: "1px solid rgba(255,255,255,0.07)",
                  background: "rgba(255,255,255,0.02)"
                }}>
                  <div>
                    <strong style={{fontSize: "13px", color: "white"}}>{c.name}</strong>
                    <div style={{fontSize: "11px", color: "#9ca3af"}}>
                      Plano {c.plan.name} · Franquia personalizada: {c.plan.customQuotaOverride} mensagens
                    </div>
                    {c.plan.exceptionReason && (
                      <div style={{fontSize: "11px", color: "#fbbf24", marginTop: "2px"}}>Motivo: {c.plan.exceptionReason}</div>
                    )}
                  </div>
                  <button
                    type="button"
                    className="op-btn op-btn-ghost"
                    onClick={() => onOpenAssignModal(c)}
                    style={{fontSize: "12px", padding: "7px 10px", flexShrink: 0}}
                  >
                    {hasException ? <><Check size={13}/> Alterar Plano</> : "Alterar Plano"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
