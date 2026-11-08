"use client";

import React, { useState, useMemo } from "react";
import { Radio, RefreshCw, Search, Smartphone, CheckCircle2, AlertTriangle, AlertCircle, ShieldAlert, ExternalLink } from "lucide-react";

interface SlotItem {
  slot: number;
  instanceName: string;
  status: string;
  phone?: string;
  unlocked: boolean;
  pausedByDowngrade?: boolean;
}

interface ClientRadarItem {
  id: string;
  name: string;
  email: string;
  planName?: string;
  isTrial?: boolean;
  whatsappSlots?: SlotItem[];
  instanceName?: string | null;
  whatsappStatus?: string;
}

interface WhatsAppRadarSectionProps {
  clients: ClientRadarItem[];
  onRefresh: () => void;
}

export function WhatsAppRadarSection({ clients, onRefresh }: WhatsAppRadarSectionProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "connected" | "waiting_qr" | "disconnected">("all");
  const [testingInstance, setTestingInstance] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; message: string }>>({});

  // Flatten all slots from all clients into individual instance connection records
  const allInstances = useMemo(() => {
    const list: Array<{
      clientId: string;
      clientName: string;
      clientEmail: string;
      planName: string;
      slotNumber: number;
      instanceName: string;
      status: string;
      phone?: string;
      unlocked: boolean;
    }> = [];

    for (const c of clients) {
      const planName = c.planName || (c.isTrial ? "Teste Grátis" : "CRM Premium");
      if (Array.isArray(c.whatsappSlots) && c.whatsappSlots.length > 0) {
        for (const s of c.whatsappSlots) {
          if (s.unlocked) {
            list.push({
              clientId: c.id,
              clientName: c.name,
              clientEmail: c.email,
              planName,
              slotNumber: s.slot,
              instanceName: s.instanceName,
              status: s.status || "disconnected",
              phone: s.phone,
              unlocked: s.unlocked
            });
          }
        }
      } else {
        // Single fallback instance if slots array not populated
        list.push({
          clientId: c.id,
          clientName: c.name,
          clientEmail: c.email,
          planName,
          slotNumber: 1,
          instanceName: c.instanceName || `${c.name.toLowerCase().replace(/[^a-z0-9]/g, "_")}_1`,
          status: c.whatsappStatus || "disconnected",
          unlocked: true
        });
      }
    }

    return list;
  }, [clients]);

  // Statistics
  const stats = useMemo(() => {
    const total = allInstances.length;
    const connected = allInstances.filter(i => i.status === "connected" || i.status === "open").length;
    const waitingQr = allInstances.filter(i => i.status === "connecting" || i.status === "waiting_qr").length;
    const disconnected = total - connected - waitingQr;
    return { total, connected, waitingQr, disconnected };
  }, [allInstances]);

  // Filtered instances
  const filtered = useMemo(() => {
    return allInstances.filter(item => {
      const matchesSearch =
        item.clientName.toLowerCase().includes(search.toLowerCase()) ||
        item.instanceName.toLowerCase().includes(search.toLowerCase()) ||
        (item.phone && item.phone.includes(search));

      const isConn = item.status === "connected" || item.status === "open";
      const isWait = item.status === "connecting" || item.status === "waiting_qr";
      const isDisc = !isConn && !isWait;

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "connected" && isConn) ||
        (statusFilter === "waiting_qr" && isWait) ||
        (statusFilter === "disconnected" && isDisc);

      return matchesSearch && matchesStatus;
    });
  }, [allInstances, search, statusFilter]);

  const handleTestConnection = async (instName: string) => {
    setTestingInstance(instName);
    try {
      const res = await fetch(`/api/crm/operator/connection-status?instance=${encodeURIComponent(instName)}`);
      if (res.ok) {
        const json = await res.json();
        const isOnline = json?.state === "open" || json?.status === "connected";
        setTestResult(prev => ({
          ...prev,
          [instName]: {
            ok: isOnline,
            message: isOnline ? "Conexão ativa e respondendo perfeitamente!" : `Status reportado: ${json?.state || json?.status || "offline"}`
          }
        }));
      } else {
        setTestResult(prev => ({
          ...prev,
          [instName]: { ok: false, message: "Instância offline ou não iniciada no gateway." }
        }));
      }
    } catch {
      setTestResult(prev => ({
        ...prev,
        [instName]: { ok: false, message: "Erro de rede ao verificar status." }
      }));
    } finally {
      setTestingInstance(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* KPI METRIC CARDS */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: "16px"
      }}>
        <div className="op-card" style={{ padding: "18px 20px", display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{
            width: "48px",
            height: "48px",
            borderRadius: "12px",
            background: "rgba(168, 85, 247, 0.15)",
            border: "1px solid rgba(168, 85, 247, 0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}>
            <Smartphone size={24} color="#d8b4fe" />
          </div>
          <div>
            <div style={{ fontSize: "12px", color: "#aba8bf", fontWeight: 600 }}>Total de Instâncias</div>
            <div style={{ fontSize: "26px", fontWeight: 900, color: "#fff" }}>{stats.total}</div>
          </div>
        </div>

        <div className="op-card" style={{ padding: "18px 20px", display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{
            width: "48px",
            height: "48px",
            borderRadius: "12px",
            background: "rgba(0, 219, 140, 0.15)",
            border: "1px solid rgba(0, 219, 140, 0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}>
            <CheckCircle2 size={24} color="#00db8c" />
          </div>
          <div>
            <div style={{ fontSize: "12px", color: "#aba8bf", fontWeight: 600 }}>Online e Respondendo</div>
            <div style={{ fontSize: "26px", fontWeight: 900, color: "#00db8c" }}>{stats.connected}</div>
          </div>
        </div>

        <div className="op-card" style={{ padding: "18px 20px", display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{
            width: "48px",
            height: "48px",
            borderRadius: "12px",
            background: "rgba(245, 158, 11, 0.15)",
            border: "1px solid rgba(245, 158, 11, 0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}>
            <AlertTriangle size={24} color="#f59e0b" />
          </div>
          <div>
            <div style={{ fontSize: "12px", color: "#aba8bf", fontWeight: 600 }}>Aguardando Leitura QR</div>
            <div style={{ fontSize: "26px", fontWeight: 900, color: "#fcd34d" }}>{stats.waitingQr}</div>
          </div>
        </div>

        <div className="op-card" style={{ padding: "18px 20px", display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{
            width: "48px",
            height: "48px",
            borderRadius: "12px",
            background: "rgba(239, 68, 68, 0.15)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}>
            <AlertCircle size={24} color="#ef4444" />
          </div>
          <div>
            <div style={{ fontSize: "12px", color: "#aba8bf", fontWeight: 600 }}>Desconectadas / Offline</div>
            <div style={{ fontSize: "26px", fontWeight: 900, color: "#fca5a5" }}>{stats.disconnected}</div>
          </div>
        </div>
      </div>

      {/* TOOLBAR: SEARCH & STATUS FILTER */}
      <div className="op-card" style={{ padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: "260px" }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "10px",
            padding: "8px 14px",
            flex: 1
          }}>
            <Search size={16} color="#ec4899" />
            <input
              type="text"
              placeholder="Buscar por loja, instância ou telefone..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                background: "transparent",
                border: "none",
                color: "#fff",
                fontSize: "13px",
                outline: "none",
                width: "100%"
              }}
            />
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          {[
            { id: "all", label: `Todas (${stats.total})` },
            { id: "connected", label: `🟢 Online (${stats.connected})` },
            { id: "waiting_qr", label: `🟡 Aguardando QR (${stats.waitingQr})` },
            { id: "disconnected", label: `🔴 Offline (${stats.disconnected})` }
          ].map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatusFilter(f.id as typeof statusFilter)}
              style={{
                padding: "6px 14px",
                borderRadius: "8px",
                fontSize: "12px",
                fontWeight: 700,
                cursor: "pointer",
                background: statusFilter === f.id ? "var(--grad-primary)" : "rgba(255,255,255,0.06)",
                border: `1px solid ${statusFilter === f.id ? "#ec4899" : "rgba(255,255,255,0.1)"}`,
                color: statusFilter === f.id ? "#fff" : "#aba8bf",
                transition: "all 0.15s ease"
              }}
            >
              {f.label}
            </button>
          ))}

          <button
            type="button"
            className="op-refresh"
            onClick={onRefresh}
            style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 12px", fontSize: "12px", borderRadius: "8px" }}
          >
            <RefreshCw size={14} /> Atualizar Radar
          </button>
        </div>
      </div>

      {/* RADAR INSTANCES GRID */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
        gap: "16px"
      }}>
        {filtered.length === 0 ? (
          <div className="op-card" style={{ gridColumn: "1 / -1", padding: "40px 20px", textAlign: "center", color: "#aba8bf" }}>
            Nenhuma instância encontrada para os filtros selecionados.
          </div>
        ) : (
          filtered.map(item => {
            const isOnline = item.status === "connected" || item.status === "open";
            const isWaiting = item.status === "connecting" || item.status === "waiting_qr";
            const result = testResult[item.instanceName];

            return (
              <div
                key={`${item.clientId}-${item.slotNumber}`}
                className="op-card"
                style={{
                  padding: "18px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                  border: isOnline
                    ? "1px solid rgba(0, 219, 140, 0.35)"
                    : isWaiting
                    ? "1px solid rgba(245, 158, 11, 0.35)"
                    : "1px solid rgba(239, 68, 68, 0.35)",
                  background: isOnline
                    ? "linear-gradient(145deg, rgba(16, 24, 39, 0.95), rgba(6, 43, 30, 0.4))"
                    : "rgba(16, 12, 28, 0.95)"
                }}
              >
                {/* Header: Store Name + Status Badge */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px" }}>
                  <div>
                    <strong style={{ color: "#fff", fontSize: "15px", display: "block" }}>
                      {item.clientName}
                    </strong>
                    <span style={{ fontSize: "11px", color: "#aba8bf" }}>
                      {item.clientEmail} • Plano: {item.planName}
                    </span>
                  </div>

                  <span style={{
                    padding: "3px 10px",
                    borderRadius: "999px",
                    fontSize: "11px",
                    fontWeight: 800,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    background: isOnline
                      ? "rgba(0, 219, 140, 0.15)"
                      : isWaiting
                      ? "rgba(245, 158, 11, 0.15)"
                      : "rgba(239, 68, 68, 0.15)",
                    border: `1px solid ${isOnline ? "#00db8c" : isWaiting ? "#f59e0b" : "#ef4444"}`,
                    color: isOnline ? "#00db8c" : isWaiting ? "#fcd34d" : "#fca5a5"
                  }}>
                    <span style={{
                      width: "7px",
                      height: "7px",
                      borderRadius: "50%",
                      background: isOnline ? "#00db8c" : isWaiting ? "#f59e0b" : "#ef4444",
                      boxShadow: `0 0 6px ${isOnline ? "#00db8c" : isWaiting ? "#f59e0b" : "#ef4444"}`
                    }} />
                    {isOnline ? "Online" : isWaiting ? "Aguardando QR" : "Desconectado"}
                  </span>
                </div>

                {/* Instance Details */}
                <div style={{
                  background: "rgba(0,0,0,0.3)",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                  fontSize: "12px"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", color: "#aba8bf" }}>
                    <span>Canal:</span>
                    <strong style={{ color: "#d8b4fe" }}>Espaço #{item.slotNumber}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", color: "#aba8bf" }}>
                    <span>Instância:</span>
                    <span style={{ color: "#fff", fontFamily: "monospace", fontSize: "11px" }}>{item.instanceName}</span>
                  </div>
                  {item.phone && (
                    <div style={{ display: "flex", justifyContent: "space-between", color: "#aba8bf" }}>
                      <span>Telefone:</span>
                      <strong style={{ color: "#34d399" }}>+{item.phone}</strong>
                    </div>
                  )}
                </div>

                {/* Verification result if tested */}
                {result && (
                  <div style={{
                    padding: "8px 10px",
                    borderRadius: "6px",
                    fontSize: "11px",
                    background: result.ok ? "rgba(0, 219, 140, 0.12)" : "rgba(239, 68, 68, 0.12)",
                    border: `1px solid ${result.ok ? "#00db8c" : "#ef4444"}`,
                    color: result.ok ? "#b9f5dc" : "#ffccd5"
                  }}>
                    {result.message}
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: "flex", gap: "8px", marginTop: "auto", paddingTop: "4px" }}>
                  <button
                    type="button"
                    onClick={() => handleTestConnection(item.instanceName)}
                    disabled={testingInstance === item.instanceName}
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      borderRadius: "8px",
                      fontSize: "12px",
                      fontWeight: 700,
                      cursor: "pointer",
                      background: "rgba(255, 255, 255, 0.08)",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      color: "#fff",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px"
                    }}
                  >
                    <Radio size={13} color="#ec4899" />
                    <span>{testingInstance === item.instanceName ? "Verificando..." : "Testar Status"}</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
