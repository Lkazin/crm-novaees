"use client";
import React from "react";
import { Activity, BrainCircuit, Database, RefreshCw, Smartphone, Zap } from "lucide-react";
import type { SystemHealthPayload } from "@/app/api/crm/admin/health/route";

export function SystemHealthBar({
  health,
  loading,
  onRefresh,
  onNavigateRadar,
  onNavigateProviders
}: {
  health: SystemHealthPayload | null;
  loading: boolean;
  onRefresh: () => void;
  onNavigateRadar: () => void;
  onNavigateProviders: () => void;
}) {
  if (!health && loading) {
    return (
      <div className="nw-health-strip" aria-busy="true" aria-label="Verificando saúde das integrações">
        <span style={{ fontSize: "12px", color: "#94a3b8", display: "inline-flex", alignItems: "center", gap: "8px" }}>
          <Activity size={14} className="nw-spin" /> Verificando estado real das integrações e IAs...
        </span>
      </div>
    );
  }

  if (!health) return null;

  const { database, redis, whatsapp, ai } = health.services;

  return (
    <section className="nw-health-strip" aria-label="Indicadores reais de funcionamento">
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginRight: "4px" }}>
        <Activity size={15} color="#ec4899" />
        <span style={{ fontSize: "12px", fontWeight: 800, color: "#f8fafc", letterSpacing: "0.2px" }}>
          Status Real:
        </span>
      </div>

      <div className={`nw-health-pill status-${database.status}`} title={database.detail}>
        <span className={`nw-health-dot ${database.status}`} />
        <Database size={13} />
        <span>Banco: {database.status === "ok" ? `${database.latencyMs}ms` : database.detail}</span>
      </div>

      <button
        type="button"
        onClick={onNavigateRadar}
        className={`nw-health-pill status-${whatsapp.status}`}
        style={{ cursor: "pointer" }}
        title={`${whatsapp.detail} — Clique para abrir o Radar WhatsApp`}
      >
        <span className={`nw-health-dot ${whatsapp.status}`} />
        <Smartphone size={13} />
        <span>
          WhatsApp: {whatsapp.status === "down" ? "Offline" : `${whatsapp.connectedInstances}/${whatsapp.totalInstances} online`}
        </span>
      </button>

      <button
        type="button"
        onClick={onNavigateProviders}
        className={`nw-health-pill status-${ai.status}`}
        style={{ cursor: "pointer" }}
        title={`${ai.detail} | Rota: ${ai.primaryModel} — Clique para configurar Provedores de IA`}
      >
        <span className={`nw-health-dot ${ai.status}`} />
        <BrainCircuit size={13} />
        <span>
          IA: {ai.status === "ok" ? `Ativa (${ai.latencyMs}ms)` : ai.detail}
        </span>
      </button>

      <div className={`nw-health-pill status-${redis.status}`} title={redis.detail}>
        <span className={`nw-health-dot ${redis.status}`} />
        <Zap size={13} />
        <span>Redis: {redis.status === "ok" ? `${redis.latencyMs}ms` : "Fallback"}</span>
      </div>

      <button
        type="button"
        onClick={onRefresh}
        disabled={loading}
        aria-label="Atualizar status das integrações"
        title={`Última checagem: ${new Date(health.checkedAt).toLocaleTimeString("pt-BR")}`}
        style={{
          marginLeft: "auto",
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          padding: "5px 10px",
          borderRadius: "8px",
          background: "rgba(255, 255, 255, 0.05)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          color: "#cbd5e1",
          fontSize: "11.5px",
          fontWeight: 600,
          cursor: "pointer"
        }}
      >
        <RefreshCw size={12} className={loading ? "nw-spin" : ""} />
        <span>{loading ? "Checando..." : "Verificar"}</span>
      </button>
    </section>
  );
}
