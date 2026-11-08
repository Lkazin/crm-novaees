"use client";

import React, { useState, useEffect } from "react";
import { Megaphone, Save, CheckCircle2, AlertTriangle, AlertCircle, Info, Trash2, Eye } from "lucide-react";

interface BroadcastManagerSectionProps {
  onNotice: (msg: string) => void;
  onError: (err: string) => void;
}

export function BroadcastManagerSection({ onNotice, onError }: BroadcastManagerSectionProps) {
  const [active, setActive] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState<"info" | "warning" | "success" | "alert">("info");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/crm/admin/broadcast")
      .then(r => r.json())
      .then(res => {
        if (res?.ok && res.broadcast) {
          setActive(Boolean(res.broadcast.active));
          setTitle(res.broadcast.title || "");
          setMessage(res.broadcast.message || "");
          setType(res.broadcast.type || "info");
          setLastUpdated(res.broadcast.updatedAt || null);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/crm/admin/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active, title, message, type })
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setLastUpdated(json.broadcast.updatedAt);
        onNotice(active ? "Comunicado global transmitido com sucesso a todos os clientes!" : "Transmissão global desativada.");
      } else {
        onError(json.error || "Não foi possível salvar o comunicado.");
      }
    } catch {
      onError("Erro de conexão ao salvar comunicado.");
    } finally {
      setSaving(false);
    }
  };

  const handleClear = () => {
    setActive(false);
    setTitle("");
    setMessage("");
    setType("info");
  };

  if (loading) {
    return <div className="op-card" style={{ padding: "40px 20px", textAlign: "center", color: "#aba8bf" }}>Carregando comunicados globais...</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: "900px" }}>
      {/* EXPLANATION CARD */}
      <div className="op-card" style={{ padding: "20px 24px", display: "flex", alignItems: "flex-start", gap: "16px" }}>
        <div style={{
          width: "44px",
          height: "44px",
          borderRadius: "12px",
          background: "rgba(236, 72, 153, 0.15)",
          border: "1px solid rgba(236, 72, 153, 0.35)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0
        }}>
          <Megaphone size={22} color="#ec4899" />
        </div>
        <div>
          <h3 style={{ margin: "0 0 6px", fontSize: "17px", fontWeight: 800, color: "#fff" }}>
            Transmissão de Avisos Globais em Tempo Real
          </h3>
          <p style={{ margin: 0, color: "#aba8bf", fontSize: "13px", lineHeight: "1.5" }}>
            Publique anúncios que aparecerão no topo do painel de todos os lojistas instantaneamente.
            Ideal para avisos de manutenção preventiva, novidades da inteligência artificial, orientações ou comunicados urgentes.
          </p>
        </div>
      </div>

      {/* LIVE PREVIEW OF THE BANNER */}
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", fontWeight: 700, color: "#d8b4fe" }}>
          <Eye size={15} /> Pré-visualização do Banner (Como os Clientes Vão Enxergar):
        </div>

        <div style={{
          background: type === "alert" 
            ? "linear-gradient(90deg, rgba(239, 68, 68, 0.25), rgba(185, 28, 28, 0.2))"
            : type === "warning"
            ? "linear-gradient(90deg, rgba(245, 158, 11, 0.25), rgba(217, 119, 6, 0.2))"
            : type === "success"
            ? "linear-gradient(90deg, rgba(16, 185, 129, 0.25), rgba(5, 150, 105, 0.2))"
            : "linear-gradient(90deg, rgba(59, 130, 246, 0.25), rgba(37, 99, 235, 0.2))",
          border: `1px solid ${
            type === "alert" ? "#ef4444" : type === "warning" ? "#f59e0b" : type === "success" ? "#10b981" : "#3b82f6"
          }`,
          padding: "12px 18px",
          borderRadius: "12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "14px",
          color: "#fff",
          opacity: active ? 1 : 0.45,
          transition: "all 0.2s ease"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "20px" }}>
              {type === "alert" ? "🚨" : type === "warning" ? "⚠️" : type === "success" ? "🎉" : "📢"}
            </span>
            <div>
              <strong style={{ fontSize: "14px", display: "block", color: "#fff" }}>
                {title.trim() || "Título de Exemplo do Aviso"}
              </strong>
              <span style={{ fontSize: "13px", color: "#e2e8f0" }}>
                {message.trim() || "Digite a mensagem do comunicado no formulário abaixo para visualizar aqui."}
              </span>
            </div>
          </div>
          <button
            type="button"
            disabled
            style={{
              background: "rgba(255, 255, 255, 0.12)",
              border: "none",
              color: "#fff",
              borderRadius: "6px",
              padding: "4px 8px",
              fontSize: "11px",
              fontWeight: 600,
              flexShrink: 0,
              cursor: "default"
            }}
          >
            ✕ Dispensar
          </button>
        </div>
        {!active && (
          <span style={{ fontSize: "12px", color: "#8e87a2", fontStyle: "italic" }}>
            ⚠️ O banner está atualmente <strong>inativo</strong> (não será exibido aos clientes até ser ativado e salvo).
          </span>
        )}
      </div>

      {/* BROADCAST FORM */}
      <form onSubmit={handleSave} className="op-card" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "18px" }}>
        {/* Toggle switch: Active/Inactive */}
        <label style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer", userSelect: "none" }}>
          <input
            type="checkbox"
            checked={active}
            onChange={e => setActive(e.target.checked)}
            style={{ width: "20px", height: "20px", cursor: "pointer", accentColor: "#ec4899" }}
          />
          <div>
            <strong style={{ color: "#fff", fontSize: "14px", display: "block" }}>
              Ativar Transmissão Global para Todos os Clientes
            </strong>
            <span style={{ fontSize: "12px", color: "#aba8bf" }}>
              Quando marcado, o banner será exibido no topo do workspace de todos os lojistas conectados.
            </span>
          </div>
        </label>

        {/* Level / Type selector */}
        <div>
          <label style={{ display: "block", color: "#d8b4fe", fontSize: "12px", fontWeight: 700, marginBottom: "8px", textTransform: "uppercase" }}>
            Tipo de Aviso
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
            {[
              { id: "info", label: "Informativo (Azul)", emoji: "📢", color: "#3b82f6" },
              { id: "warning", label: "Aviso Importante (Âmbar)", emoji: "⚠️", color: "#f59e0b" },
              { id: "success", label: "Novidade / Sucesso (Verde)", emoji: "🎉", color: "#10b981" },
              { id: "alert", label: "Alerta Crítico (Vermelho)", emoji: "🚨", color: "#ef4444" }
            ].map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setType(t.id as typeof type)}
                style={{
                  padding: "10px 14px",
                  borderRadius: "10px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "12px",
                  fontWeight: 700,
                  cursor: "pointer",
                  background: type === t.id ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.03)",
                  border: `2px solid ${type === t.id ? t.color : "rgba(255,255,255,0.08)"}`,
                  color: type === t.id ? "#fff" : "#aba8bf",
                  transition: "all 0.15s ease"
                }}
              >
                <span>{t.emoji}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Title Input */}
        <div>
          <label style={{ display: "block", color: "#d8b4fe", fontSize: "12px", fontWeight: 700, marginBottom: "6px", textTransform: "uppercase" }}>
            Título do Comunicado (Curto)
          </label>
          <input
            type="text"
            placeholder="Ex: Atualização Programada dos Servidores"
            value={title}
            onChange={e => setTitle(e.target.value)}
            maxLength={100}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: "10px",
              background: "#161325",
              border: "1px solid #3d345c",
              color: "#fff",
              fontSize: "14px",
              outline: "none"
            }}
          />
        </div>

        {/* Message Input */}
        <div>
          <label style={{ display: "block", color: "#d8b4fe", fontSize: "12px", fontWeight: 700, marginBottom: "6px", textTransform: "uppercase" }}>
            Mensagem Completa
          </label>
          <textarea
            placeholder="Ex: Hoje às 23h faremos uma melhoria em nossos servidores de WhatsApp. O atendimento continuará funcionando normalmente."
            value={message}
            onChange={e => setMessage(e.target.value)}
            rows={3}
            maxLength={400}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: "10px",
              background: "#161325",
              border: "1px solid #3d345c",
              color: "#fff",
              fontSize: "14px",
              outline: "none",
              resize: "vertical"
            }}
          />
        </div>

        {lastUpdated && (
          <span style={{ fontSize: "11px", color: "#aba8bf" }}>
            Última alteração gravada: {new Date(lastUpdated).toLocaleString("pt-BR")}
          </span>
        )}

        {/* Action Buttons */}
        <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", flexWrap: "wrap", marginTop: "6px" }}>
          <button
            type="button"
            onClick={handleClear}
            className="op-refresh"
            style={{ padding: "10px 16px", borderRadius: "10px", display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            <Trash2 size={15} /> Limpar Campos
          </button>
          <button
            type="submit"
            disabled={saving}
            className="op-primary"
            style={{ padding: "10px 22px", borderRadius: "10px", fontWeight: 800, fontSize: "13px", display: "inline-flex", alignItems: "center", gap: "8px" }}
          >
            <Save size={16} /> {saving ? "Gravando..." : active ? "Salvar e Transmitir Comunicado" : "Salvar Configurações"}
          </button>
        </div>
      </form>
    </div>
  );
}

