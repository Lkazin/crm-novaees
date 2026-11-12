"use client";

// Zona de perigo: o cliente cancela a conta e pede a exclusao dos dados.
//
// O aviso e grande de proposito: e a unica acao do painel que nao tem volta.
// Nada e apagado no ato do pedido — o painel continua ativo ate o fim do ciclo
// ja pago, e so depois disso os dados sao excluidos em definitivo. Antes do
// prazo o cliente pode desfazer.

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, ShieldCheck, Trash2, Undo2 } from "lucide-react";

export type DeletionState = {
  scheduled: boolean;
  activeUntil?: string;
  purgeAfter?: string;
  daysLeft?: number;
};

export type DangerZoneSectionProps = {
  tenantId: string;
  tenantName?: string;
};

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "America/Sao_Paulo",
    });
  } catch {
    return "—";
  }
}

export function DangerZoneSection({ tenantId, tenantName }: DangerZoneSectionProps) {
  const [state, setState] = useState<DeletionState | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    try {
      const res = await fetch(`/api/crm/operator/deletion?tenant=${encodeURIComponent(tenantId)}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!res.ok) return;
      setState((await res.json()) as DeletionState);
    } catch {
      /* silencioso: nao trava a aba */
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const schedule = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm/operator/deletion?tenant=${encodeURIComponent(tenantId)}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId }),
      });
      if (!res.ok) {
        setError("Não foi possível registrar o cancelamento. Tente novamente.");
        return;
      }
      setState((await res.json()) as DeletionState);
      setConfirmOpen(false);
      setTyped("");
    } catch {
      setError("Falha de rede ao registrar o cancelamento.");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  const undo = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm/operator/deletion?tenant=${encodeURIComponent(tenantId)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) {
        setError("Não foi possível desfazer o cancelamento.");
        return;
      }
      setState({ scheduled: false });
    } catch {
      setError("Falha de rede ao desfazer o cancelamento.");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  const scheduled = Boolean(state?.scheduled);

  return (
    <div
      style={{
        borderRadius: "20px",
        border: "2px solid rgba(244, 63, 94, 0.55)",
        background: "linear-gradient(135deg, rgba(60, 10, 25, 0.95), rgba(30, 8, 18, 0.98))",
        boxShadow: "0 16px 44px rgba(244, 63, 94, 0.18)",
        padding: "28px",
        display: "flex",
        flexDirection: "column",
        gap: "18px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <div
          style={{
            width: "46px",
            height: "46px",
            borderRadius: "14px",
            background: "rgba(244, 63, 94, 0.18)",
            border: "1px solid rgba(244, 63, 94, 0.5)",
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          <AlertTriangle size={24} color="#fb7185" />
        </div>
        <div>
          <h3 style={{ margin: 0, fontSize: "20px", fontWeight: 900, color: "#fff" }}>
            Cancelar conta e apagar dados
          </h3>
          <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#fda4af" }}>
            Zona de perigo — esta é a única ação do painel que não tem volta.
          </p>
        </div>
      </div>

      {scheduled ? (
        <>
          <div
            style={{
              padding: "18px 20px",
              borderRadius: "14px",
              background: "rgba(244, 63, 94, 0.12)",
              border: "1px solid rgba(244, 63, 94, 0.45)",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <strong style={{ fontSize: "16px", color: "#fff" }}>
              Cancelamento agendado
            </strong>
            <span style={{ fontSize: "14px", color: "#fecdd3", lineHeight: 1.55 }}>
              Seu painel continua <strong>ativo até {fmtDate(state?.activeUntil)}</strong>, o fim do ciclo já pago.
              Depois dessa data os dados são <strong>excluídos em definitivo</strong> e{" "}
              <strong>não há como voltar</strong>.
            </span>
            <span style={{ fontSize: "13px", color: "#fda4af" }}>
              Faltam <strong>{state?.daysLeft ?? 0} dia(s)</strong> para a exclusão definitiva.
            </span>
          </div>

          {error && (
            <span style={{ fontSize: "13px", color: "#fecdd3" }}>{error}</span>
          )}

          <button
            type="button"
            onClick={undo}
            disabled={loading}
            style={{
              alignSelf: "flex-start",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "11px 18px",
              borderRadius: "10px",
              border: "1px solid rgba(74, 222, 128, 0.5)",
              background: "rgba(74, 222, 128, 0.14)",
              color: "#86efac",
              fontWeight: 800,
              fontSize: "14px",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Undo2 size={16} />}
            Desfazer cancelamento
          </button>
        </>
      ) : (
        <>
          <div
            style={{
              padding: "18px 20px",
              borderRadius: "14px",
              background: "rgba(0, 0, 0, 0.28)",
              border: "1px solid rgba(244, 63, 94, 0.3)",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            <strong style={{ fontSize: "15px", color: "#fff" }}>O que acontece se você cancelar</strong>
            <ul style={{ margin: 0, paddingLeft: "20px", fontSize: "14px", color: "#fecdd3", lineHeight: 1.7 }}>
              <li>Seu painel continua <strong>ativo até o fim do ciclo já pago</strong>.</li>
              <li>Depois dessa data, seus dados são <strong>excluídos em definitivo</strong>.</li>
              <li>Continuando, <strong>não tem mais volta</strong>: conversas, contatos, histórico e configurações são perdidos.</li>
              <li>Até a data da exclusão você pode <strong>desfazer</strong> o cancelamento aqui mesmo.</li>
            </ul>
          </div>

          {error && <span style={{ fontSize: "13px", color: "#fecdd3" }}>{error}</span>}

          {!confirmOpen ? (
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              style={{
                alignSelf: "flex-start",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "12px 20px",
                borderRadius: "10px",
                border: "1px solid rgba(244, 63, 94, 0.6)",
                background: "rgba(244, 63, 94, 0.18)",
                color: "#fecdd3",
                fontWeight: 800,
                fontSize: "14px",
                cursor: "pointer",
              }}
            >
              <Trash2 size={16} />
              Quero cancelar minha conta
            </button>
          ) : (
            <div
              style={{
                padding: "20px",
                borderRadius: "14px",
                border: "1px solid rgba(244, 63, 94, 0.5)",
                background: "rgba(0, 0, 0, 0.35)",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              }}
            >
              <strong style={{ fontSize: "14px", color: "#fff" }}>
                Para confirmar, digite <span style={{ color: "#fb7185" }}>CANCELAR</span> abaixo.
              </strong>
              <input
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value.toUpperCase())}
                placeholder="CANCELAR"
                style={{
                  padding: "11px 14px",
                  borderRadius: "10px",
                  border: "1px solid rgba(244, 63, 94, 0.45)",
                  background: "rgba(244, 63, 94, 0.08)",
                  color: "#fff",
                  fontSize: "14px",
                  fontWeight: 700,
                  letterSpacing: "1px",
                  maxWidth: "260px",
                }}
              />
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={schedule}
                  disabled={loading || typed !== "CANCELAR"}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "11px 18px",
                    borderRadius: "10px",
                    border: "1px solid rgba(244, 63, 94, 0.7)",
                    background: typed === "CANCELAR" ? "rgba(244, 63, 94, 0.45)" : "rgba(244, 63, 94, 0.12)",
                    color: typed === "CANCELAR" ? "#fff" : "#a1758a",
                    fontWeight: 800,
                    fontSize: "14px",
                    cursor: loading || typed !== "CANCELAR" ? "not-allowed" : "pointer",
                  }}
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  Confirmar cancelamento
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmOpen(false);
                    setTyped("");
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "11px 18px",
                    borderRadius: "10px",
                    border: "1px solid rgba(255, 255, 255, 0.18)",
                    background: "transparent",
                    color: "#e2d9eb",
                    fontWeight: 700,
                    fontSize: "14px",
                    cursor: "pointer",
                  }}
                >
                  <ShieldCheck size={16} />
                  Manter minha conta
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
