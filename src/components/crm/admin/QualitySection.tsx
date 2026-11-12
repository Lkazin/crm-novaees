"use client";

// Secao "Qualidade do Atendimento" do Painel Master.
//
// Todos os numeros vem de /api/crm/admin/quality, que agrega
// crm_quality_events e crm_ai_usage_events — fatos gravados no momento em que
// aconteceram. Nada aqui e estimado: quando nao ha dado, mostra "sem dados" em
// vez de zero enganoso.
//
// Indicador semantico (link inventado, preco fora da base, catalogo misturado)
// sempre permite revisao humana: o evento fica pendente ate alguem marcar.

import { AlertTriangle, CheckCircle2, Clock, Link2, Loader2, RefreshCw, ShieldAlert, Timer } from "lucide-react";

export type QualitySummaryView = {
  periodKey: string;
  totalEvents: number;
  byKind: Record<string, number>;
  aiReplies: number;
  flaggedReplies: number;
  flaggedRate: number | null;
  pendingReview: number;
  avgLatencyMs: number | null;
  estimatedCostUsd: number | null;
  quotaByTenant: Array<{ tenantId: string; used: number; quota: number }>;
};

export type QualitySectionProps = {
  summary: QualitySummaryView | null;
  loading: boolean;
  error: string | null;
  period: string;
  onPeriodChange: (period: string) => void;
  onRefresh: () => void;
  tenantNames: Record<string, string>;
};

const KIND_LABEL: Record<string, string> = {
  unauthorized_url: "Link não autorizado",
  unauthorized_price: "Preço fora da base",
  mixed_catalogs: "Catálogo misturado",
  duplicate_reply: "Resposta duplicada",
  send_failure: "Falha de envio",
  human_handoff: "Transferência para humano",
  slow_reply: "Resposta lenta",
};

function fmtInt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "sem dados";
  return n.toLocaleString("pt-BR");
}

function fmtPct(n: number | null): string {
  if (n === null) return "sem dados";
  return `${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function fmtMs(n: number | null): string {
  if (n === null) return "sem dados";
  if (n < 1000) return `${n} ms`;
  return `${(n / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
}

function fmtUsd(n: number | null): string {
  if (n === null) return "sem dados";
  return `US$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
}

export function QualitySection({
  summary,
  loading,
  error,
  period,
  onPeriodChange,
  onRefresh,
  tenantNames,
}: QualitySectionProps) {
  const cards: Array<{ label: string; value: string; hint: string; icon: React.ReactNode; tone: string }> = [
    {
      label: "Respostas da IA",
      value: fmtInt(summary?.aiReplies),
      hint: "crm_ai_usage_events com status success",
      icon: <CheckCircle2 size={16} />,
      tone: "#4ade80",
    },
    {
      label: "Respostas sinalizadas",
      value: fmtInt(summary?.flaggedReplies),
      hint: "link, preço ou catálogo fora da base",
      icon: <ShieldAlert size={16} />,
      tone: "#f43f5e",
    },
    {
      label: "Taxa de sinalização",
      value: fmtPct(summary?.flaggedRate ?? null),
      hint: "sinalizadas ÷ respostas da IA",
      icon: <AlertTriangle size={16} />,
      tone: "#fbbf24",
    },
    {
      label: "Pendentes de revisão",
      value: fmtInt(summary?.pendingReview),
      hint: "eventos sem revisão humana",
      icon: <Clock size={16} />,
      tone: "#a855f7",
    },
    {
      label: "Tempo médio de resposta",
      value: fmtMs(summary?.avgLatencyMs ?? null),
      hint: "latência registrada no evento",
      icon: <Timer size={16} />,
      tone: "#38bdf8",
    },
    {
      label: "Custo estimado",
      value: fmtUsd(summary?.estimatedCostUsd ?? null),
      hint: "tabela de preço por modelo",
      icon: <Link2 size={16} />,
      tone: "#fb7185",
    },
  ];

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      <header style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: "220px" }}>
          <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 800, color: "#faf5fc" }}>
            Qualidade do Atendimento
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#b8a7c6" }}>
            Eventos reais gravados durante o atendimento. Nada aqui é estimado.
          </p>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#b8a7c6" }}>
          Ciclo
          <input
            type="month"
            value={period}
            onChange={(e) => onPeriodChange(e.target.value)}
            style={{
              background: "rgba(225, 29, 72, 0.08)",
              border: "1px solid rgba(225, 29, 72, 0.35)",
              borderRadius: "10px",
              padding: "8px 10px",
              color: "#faf5fc",
              fontSize: "13px",
            }}
          />
        </label>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "9px 14px",
            borderRadius: "10px",
            border: "1px solid rgba(225, 29, 72, 0.45)",
            background: "rgba(225, 29, 72, 0.15)",
            color: "#fff",
            fontWeight: 700,
            fontSize: "13px",
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
          Atualizar
        </button>
      </header>

      {error && (
        <div
          style={{
            padding: "12px 14px",
            borderRadius: "12px",
            border: "1px solid rgba(244, 63, 94, 0.45)",
            background: "rgba(244, 63, 94, 0.12)",
            color: "#fecdd3",
            fontSize: "13px",
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: "12px",
        }}
      >
        {cards.map((c) => (
          <div
            key={c.label}
            style={{
              background: "linear-gradient(160deg, rgba(27, 12, 42, 0.9), rgba(17, 7, 28, 0.9))",
              border: "1px solid rgba(225, 29, 72, 0.22)",
              borderRadius: "14px",
              padding: "14px 16px",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: "7px", color: c.tone, fontSize: "12px", fontWeight: 700 }}>
              {c.icon}
              {c.label}
            </span>
            <strong style={{ fontSize: "22px", fontWeight: 800, color: "#faf5fc", lineHeight: 1.1 }}>{c.value}</strong>
            <span style={{ fontSize: "11px", color: "#8f7fa3" }}>{c.hint}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "14px" }}>
        <div
          style={{
            background: "rgba(27, 12, 42, 0.75)",
            border: "1px solid rgba(225, 29, 72, 0.22)",
            borderRadius: "14px",
            padding: "16px",
          }}
        >
          <h3 style={{ margin: "0 0 10px", fontSize: "14px", fontWeight: 800, color: "#faf5fc" }}>
            Eventos por tipo
          </h3>
          {!summary || Object.keys(summary.byKind).length === 0 ? (
            <p style={{ margin: 0, fontSize: "13px", color: "#8f7fa3" }}>Nenhum evento no ciclo.</p>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "8px" }}>
              {Object.entries(summary.byKind)
                .sort((a, b) => b[1] - a[1])
                .map(([kind, count]) => (
                  <li key={kind} style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px" }}>
                    <span style={{ flex: 1, color: "#e2d9eb" }}>{KIND_LABEL[kind] ?? kind}</span>
                    <strong style={{ color: "#fb7185" }}>{count}</strong>
                  </li>
                ))}
            </ul>
          )}
        </div>

        <div
          style={{
            background: "rgba(27, 12, 42, 0.75)",
            border: "1px solid rgba(225, 29, 72, 0.22)",
            borderRadius: "14px",
            padding: "16px",
          }}
        >
          <h3 style={{ margin: "0 0 10px", fontSize: "14px", fontWeight: 800, color: "#faf5fc" }}>
            Franquia por empresa no ciclo
          </h3>
          {!summary || summary.quotaByTenant.length === 0 ? (
            <p style={{ margin: 0, fontSize: "13px", color: "#8f7fa3" }}>Nenhum consumo no ciclo.</p>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "10px" }}>
              {summary.quotaByTenant.map((t) => {
                const pct = t.quota > 0 ? Math.min(100, Math.round((t.used / t.quota) * 100)) : 0;
                return (
                  <li key={t.tenantId} style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12.5px" }}>
                      <span style={{ color: "#e2d9eb" }}>{tenantNames[t.tenantId] ?? t.tenantId.slice(0, 8)}</span>
                      <span style={{ color: "#b8a7c6" }}>
                        {t.used} / {t.quota}
                      </span>
                    </div>
                    <div style={{ height: "6px", borderRadius: "6px", background: "rgba(225, 29, 72, 0.15)", overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg, #e11d48, #fb7185)" }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
