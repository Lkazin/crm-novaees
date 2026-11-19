"use client";
import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, ShieldAlert, X } from "lucide-react";
import { SkeletonBox } from "./CrmSkeleton";

export type CrmToastTone = "success" | "error" | "warning" | "info";

export type CrmToastItem = {
  id: string;
  tone: CrmToastTone;
  title: string;
  description?: string;
};

export function useCrmToast() {
  const [toasts, setToasts] = useState<CrmToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const pushToast = useCallback((tone: CrmToastTone, title: string, description?: string, durationMs = 4500) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts(prev => [...prev.slice(-3), { id, tone, title, description }]);
    if (durationMs > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, durationMs);
    }
  }, []);

  return { toasts, pushToast, dismissToast };
}

export function CrmToastStack({
  toasts,
  onDismiss
}: {
  toasts: CrmToastItem[];
  onDismiss: (id: string) => void;
}) {
  if (!toasts.length) return null;

  return (
    <div className="nw-toast-stack" role="region" aria-label="Notificações do sistema" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className={`nw-toast-item toast-${t.tone}`} role="status">
          <div style={{ marginTop: "2px", flexShrink: 0 }}>
            {t.tone === "success" && <CheckCircle2 size={18} color="#34d399" />}
            {t.tone === "error" && <ShieldAlert size={18} color="#f87171" />}
            {t.tone === "warning" && <AlertTriangle size={18} color="#fbbf24" />}
            {t.tone === "info" && <Info size={18} color="#c084fc" />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong style={{ display: "block", fontSize: "13.5px", fontWeight: 700, lineHeight: 1.35, color: "#fff" }}>
              {t.title}
            </strong>
            {t.description && (
              <p style={{ margin: "3px 0 0", fontSize: "12.5px", lineHeight: 1.45, color: "#cbd5e1" }}>
                {t.description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => onDismiss(t.id)}
            aria-label="Fechar notificação"
            style={{
              background: "transparent",
              border: "none",
              color: "#94a3b8",
              padding: "4px",
              borderRadius: "6px",
              cursor: "pointer",
              display: "grid",
              placeItems: "center"
            }}
          >
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}

export type CrmConfirmState = {
  open: boolean;
  tone?: "danger" | "warning";
  title: string;
  description: string;
  impactHint?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  checkboxLabel?: string;
  checkboxDefaultChecked?: boolean;
  requireTypedText?: string;
  requireTypedLabel?: string;
  busy?: boolean;
  onConfirm: (checkboxValue: boolean) => void | Promise<void>;
};

export function CrmConfirmModal({
  state,
  onClose
}: {
  state: CrmConfirmState | null;
  onClose: () => void;
}) {
  const [checked, setChecked] = useState(false);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (state?.open) {
      setChecked(Boolean(state.checkboxDefaultChecked));
      setTyped("");
    }
  }, [state?.open, state?.checkboxDefaultChecked]);

  useEffect(() => {
    if (!state?.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !state.busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state?.open, state?.busy, onClose]);

  if (!state?.open) return null;
  const isDanger = (state.tone ?? "danger") === "danger";
  const typedMatches = !state.requireTypedText || typed.trim().toLowerCase() === state.requireTypedText.trim().toLowerCase();

  return (
    <div
      className="nw-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="nw-confirm-title"
      onClick={e => {
        if (e.target === e.currentTarget && !state.busy) onClose();
      }}
    >
      <div className="nw-modal-card">
        <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "12px",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
              background: isDanger ? "rgba(239, 68, 68, 0.16)" : "rgba(245, 158, 11, 0.16)",
              border: `1px solid ${isDanger ? "rgba(239, 68, 68, 0.4)" : "rgba(245, 158, 11, 0.4)"}`,
              color: isDanger ? "#f87171" : "#fbbf24"
            }}
          >
            {isDanger ? <ShieldAlert size={22} /> : <AlertTriangle size={22} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 id="nw-confirm-title" style={{ margin: 0, fontSize: "17px", fontWeight: 800, color: "#fff" }}>
              {state.title}
            </h3>
            <p style={{ margin: "6px 0 0", fontSize: "13.5px", lineHeight: 1.55, color: "#cbd5e1", whiteSpace: "pre-line" }}>
              {state.description}
            </p>
          </div>
        </div>

        {state.impactHint && (
          <div
            style={{
              padding: "10px 12px",
              borderRadius: "10px",
              fontSize: "12.5px",
              lineHeight: 1.45,
              background: isDanger ? "rgba(239, 68, 68, 0.08)" : "rgba(245, 158, 11, 0.08)",
              border: `1px solid ${isDanger ? "rgba(239, 68, 68, 0.25)" : "rgba(245, 158, 11, 0.25)"}`,
              color: isDanger ? "#fca5a5" : "#fde68a"
            }}
          >
            {state.impactHint}
          </div>
        )}

        {state.checkboxLabel && (
          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "10px",
              padding: "11px 12px",
              borderRadius: "10px",
              background: "rgba(255, 255, 255, 0.04)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              cursor: "pointer",
              fontSize: "13px",
              color: "#e2e8f0",
              lineHeight: 1.45
            }}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={e => setChecked(e.target.checked)}
              style={{ marginTop: "3px", width: "16px", height: "16px", accentColor: "#ec4899" }}
            />
            <span>{state.checkboxLabel}</span>
          </label>
        )}

        {state.requireTypedText && (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label htmlFor="nw-confirm-typed" style={{ fontSize: "12.5px", color: "#cbd5e1", fontWeight: 600 }}>
              {state.requireTypedLabel || `Digite "${state.requireTypedText}" para confirmar:`}
            </label>
            <input
              id="nw-confirm-typed"
              type="text"
              autoFocus
              value={typed}
              onChange={e => setTyped(e.target.value)}
              placeholder={state.requireTypedText}
              style={{
                padding: "10px 12px",
                borderRadius: "10px",
                background: "#0a0814",
                border: `1px solid ${typedMatches && typed ? "rgba(52, 211, 153, 0.5)" : "rgba(255, 255, 255, 0.16)"}`,
                color: "#fff",
                fontSize: "13.5px"
              }}
            />
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "4px", flexWrap: "wrap" }}>
          <button
            type="button"
            className="nw-btn nw-btn-secondary"
            disabled={state.busy}
            onClick={onClose}
          >
            {state.cancelLabel || "Cancelar"}
          </button>
          <button
            type="button"
            className={`nw-btn ${isDanger ? "nw-btn-danger-solid" : "nw-btn-primary"}`}
            disabled={state.busy || !typedMatches}
            onClick={() => void state.onConfirm(checked)}
          >
            {state.busy ? "Processando..." : (state.confirmLabel || "Confirmar")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function CrmEmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryHint
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryHint?: string;
}) {
  return (
    <div className="nw-empty-state" role="status">
      <div className="nw-empty-state-icon">{icon}</div>
      <div style={{ maxWidth: "440px" }}>
        <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 800, color: "#fff" }}>{title}</h3>
        <p style={{ margin: "6px 0 0", fontSize: "13.5px", lineHeight: 1.55, color: "#cbd5e1" }}>
          {description}
        </p>
        {secondaryHint && (
          <p style={{ margin: "8px 0 0", fontSize: "12px", color: "#94a3b8" }}>{secondaryHint}</p>
        )}
      </div>
      {actionLabel && onAction && (
        <button type="button" className="nw-btn nw-btn-primary" onClick={onAction} style={{ marginTop: "4px" }}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function CrmSectionSkeleton({
  rows = 4,
  variant = "table"
}: {
  rows?: number;
  variant?: "table" | "cards";
}) {
  if (variant === "cards") {
    return (
      <div
        aria-busy="true"
        aria-label="Carregando conteúdo"
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: "16px" }}
      >
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            style={{
              background: "rgba(255, 255, 255, 0.025)",
              border: "1px solid rgba(255, 255, 255, 0.07)",
              borderRadius: "16px",
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              gap: "12px"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <SkeletonBox width="40px" height="40px" borderRadius="12px" />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
                <SkeletonBox width="70%" height="15px" />
                <SkeletonBox width="45%" height="11px" />
              </div>
            </div>
            <SkeletonBox width="100%" height="12px" />
            <SkeletonBox width="85%" height="12px" />
            <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
              <SkeletonBox width="90px" height="32px" borderRadius="8px" />
              <SkeletonBox width="90px" height="32px" borderRadius="8px" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      aria-busy="true"
      aria-label="Carregando registros"
      style={{
        background: "rgba(255, 255, 255, 0.02)",
        border: "1px solid rgba(255, 255, 255, 0.07)",
        borderRadius: "16px",
        padding: "18px",
        display: "flex",
        flexDirection: "column",
        gap: "14px"
      }}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "14px",
            padding: "12px 0",
            borderBottom: i === rows - 1 ? "none" : "1px solid rgba(255, 255, 255, 0.05)"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1, minWidth: 0 }}>
            <SkeletonBox width="38px" height="38px" borderRadius="10px" />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
              <SkeletonBox width="180px" height="14px" />
              <SkeletonBox width="130px" height="11px" />
            </div>
          </div>
          <SkeletonBox width="96px" height="26px" borderRadius="999px" />
          <SkeletonBox width="80px" height="30px" borderRadius="8px" />
        </div>
      ))}
    </div>
  );
}
