"use client";

import React, { useState } from "react";
import { Bot, Check, Send, Sparkles, Wand2, Clock, BookOpen, ShieldCheck, RotateCcw } from "lucide-react";
import {
  buildNextInterviewTurn,
  compileProfileFromInterview,
  type CompiledOnboardingProfile,
  type InterviewMessage,
} from "@/lib/crm/onboarding-interviewer";

interface OnboardingInterviewerModalProps {
  tenantId: string;
  storeName: string;
  onClose: () => void;
  onApplyProfile: (profile: CompiledOnboardingProfile, autoSave: boolean) => Promise<void>;
}

const STEP_LABELS = [
  "1. Identidade e Tom",
  "2. Catálogo e Preços",
  "3. Pagamento e Entrega",
  "4. Horários da Loja",
  "5. Endereço e FAQ",
  "6. Passar p/ Humano",
];

const QUICK_SUGGESTIONS: Record<number, string[]> = {
  1: [
    "Sofia, tom amigável, simpático e acolhedor",
    "Consultor Alex, tom formal, educado e corporativo",
    "Bia, atendimento rápido, direto ao ponto e objetivo",
  ],
  2: [
    "Consultoria: R$ 250 | Planos mensais a partir de R$ 89,90 | Orçamento personalizado sob medida",
    "Pizzas Grandes R$ 49,90 (Calabresa, Muçarela, Portuguesa) | Bebidas 2L R$ 12,00",
  ],
  3: [
    "Aceitamos Pix (com 5% de desconto), Cartão em até 6x sem juros e dinheiro. Entregamos e fazemos retirada.",
    "Pagamento via Pix, Boleto ou Cartão de Crédito. Atendimento com hora marcada.",
  ],
  4: [
    "Segunda a sexta das 08h às 18h e sábado das 09h às 13h",
    "Terça a domingo das 18h às 23h30",
    "Segunda a sexta das 09h às 18h com pausa de almoço das 12h às 13h",
  ],
  5: [
    "Atendimento 100% online. Garantia de 90 dias e suporte direto pelo WhatsApp.",
    "Av. Principal, 500 - Centro. Prazo médio de entrega de 40 minutos.",
  ],
  6: [
    "Quando o cliente pedir para falar com humano, solicitar desconto especial, atacado ou fizer reclamação",
    "Quando o cliente quiser confirmar agendamento final, enviar comprovante Pix ou tiver urgência",
  ],
};

export default function OnboardingInterviewerModal({
  tenantId,
  storeName,
  onClose,
  onApplyProfile,
}: OnboardingInterviewerModalProps) {
  const [interviewerName, setInterviewerName] = useState("Maya · Consultora NovaesWeb");
  const [editingInterviewer, setEditingInterviewer] = useState(false);

  const initialTurn = buildNextInterviewTurn([], "Maya · Consultora NovaesWeb", storeName);
  const [messages, setMessages] = useState<InterviewMessage[]>([
    { role: "assistant", content: initialTurn.reply },
  ]);
  const [input, setInput] = useState("");
  const [currentStep, setCurrentStep] = useState(1);
  const [readyToCompile, setReadyToCompile] = useState(false);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [previewProfile, setPreviewProfile] = useState<CompiledOnboardingProfile | null>(null);

  const handleRestart = () => {
    const first = buildNextInterviewTurn([], interviewerName, storeName);
    setMessages([{ role: "assistant", content: first.reply }]);
    setCurrentStep(1);
    setReadyToCompile(false);
    setPreviewProfile(null);
    setInput("");
  };

  const handleSendAnswer = async (customText?: string) => {
    const text = (customText ?? input).trim();
    if (!text || loading) return;

    const nextMessages: InterviewMessage[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/crm/operator/ai-interviewer", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          action: "chat",
          storeName,
          interviewerName,
          messages: nextMessages,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.reply) {
        setMessages([...nextMessages, { role: "assistant", content: data.reply }]);
        setCurrentStep(data.currentStep ?? currentStep + 1);
        setReadyToCompile(Boolean(data.readyToCompile));
        if (data.readyToCompile) {
          const compiled = compileProfileFromInterview(nextMessages, storeName);
          setPreviewProfile(compiled);
        }
      } else {
        const fallback = buildNextInterviewTurn(nextMessages, interviewerName, storeName);
        setMessages([...nextMessages, { role: "assistant", content: fallback.reply }]);
        setCurrentStep(fallback.currentStep);
        setReadyToCompile(fallback.readyToCompile);
        if (fallback.readyToCompile) {
          setPreviewProfile(compileProfileFromInterview(nextMessages, storeName));
        }
      }
    } catch {
      const fallback = buildNextInterviewTurn(nextMessages, interviewerName, storeName);
      setMessages([...nextMessages, { role: "assistant", content: fallback.reply }]);
      setCurrentStep(fallback.currentStep);
      setReadyToCompile(fallback.readyToCompile);
      if (fallback.readyToCompile) {
        setPreviewProfile(compileProfileFromInterview(nextMessages, storeName));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCompileAndApply = async (autoSave: boolean) => {
    setApplying(true);
    try {
      const profile = previewProfile ?? compileProfileFromInterview(messages, storeName);
      await onApplyProfile(profile, autoSave);
    } finally {
      setApplying(false);
    }
  };

  const userAnswerCount = messages.filter((m) => m.role === "user").length;
  const suggestions = !readyToCompile ? QUICK_SUGGESTIONS[currentStep] || [] : [];

  return (
    <div
      data-testid="ai-onboarding-interviewer"
      style={{
        background: "linear-gradient(145deg, #181024 0%, #120b1c 100%)",
        border: "1px solid #4a2c5e",
        borderRadius: "16px",
        padding: "22px 24px",
        boxShadow: "0 10px 32px rgba(0, 0, 0, 0.4)",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}
    >
      {/* Cabeçalho da Entrevistadora IA */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
          borderBottom: "1px solid #332042",
          paddingBottom: "14px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "42px",
              height: "42px",
              borderRadius: "12px",
              background: "linear-gradient(135deg, #9d174d 0%, #be123c 100%)",
              border: "1px solid #e11d48",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            <Wand2 size={20} color="#fff" />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <h3 style={{ margin: 0, fontSize: "17px", color: "#fff", fontWeight: 800 }}>
                Entrevista Guiada por IA · {interviewerName}
              </h3>
              <button
                type="button"
                onClick={() => setEditingInterviewer((v) => !v)}
                style={{
                  background: "#241634",
                  border: "1px solid #472e61",
                  color: "#d8b4fe",
                  borderRadius: "7px",
                  padding: "2px 8px",
                  fontSize: "11px",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                {editingInterviewer ? "Concluir nome" : "Personalizar apresentadora"}
              </button>
            </div>
            <small style={{ color: "#c0b2cc", fontSize: "12.5px" }}>
              Responda às perguntas no chat: a IA cria o prompt de comportamento, a base da loja e os horários automaticamente.
            </small>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            type="button"
            onClick={handleRestart}
            title="Recomeçar entrevista do início"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              background: "#211530",
              border: "1px solid #3d2852",
              color: "#d8cbe3",
              borderRadius: "8px",
              padding: "6px 11px",
              fontSize: "12px",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            <RotateCcw size={13} /> Recomeçar
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar entrevista"
            style={{
              background: "none",
              border: "none",
              color: "#b8a7c6",
              cursor: "pointer",
              fontSize: "18px",
              padding: "4px 8px",
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Campo opcional para trocar o nome da IA entrevistadora */}
      {editingInterviewer && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            background: "#130b1c",
            border: "1px solid #3b264e",
            padding: "10px 14px",
            borderRadius: "10px",
            flexWrap: "wrap",
          }}
        >
          <label style={{ fontSize: "12.5px", color: "#e2d9eb", fontWeight: 600 }}>
            Nome da IA entrevistadora:
          </label>
          <input
            type="text"
            value={interviewerName}
            onChange={(e) => setInterviewerName(e.target.value)}
            placeholder="Ex.: Maya · Consultora NovaesWeb"
            style={{
              flex: 1,
              minWidth: "220px",
              padding: "7px 11px",
              borderRadius: "8px",
              fontSize: "13px",
            }}
          />
        </div>
      )}

      {/* Barra de Progresso das 6 Etapas */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))",
          gap: "6px",
        }}
      >
        {STEP_LABELS.map((label, idx) => {
          const stepNum = idx + 1;
          const isDone = userAnswerCount >= stepNum;
          const isCurrent = !readyToCompile && currentStep === stepNum;
          return (
            <div
              key={label}
              style={{
                padding: "7px 10px",
                borderRadius: "9px",
                fontSize: "11.5px",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: "6px",
                background: isDone ? "#14332a" : isCurrent ? "#2d182b" : "#140d1e",
                border: `1px solid ${isDone ? "rgba(16, 185, 129, 0.4)" : isCurrent ? "#be185d" : "#2f203e"}`,
                color: isDone ? "#6ee7b7" : isCurrent ? "#fce7f3" : "#9b88ad",
              }}
            >
              {isDone ? <Check size={13} /> : <span>●</span>}
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
            </div>
          );
        })}
      </div>

      {/* Histórico de Conversa com a Entrevistadora */}
      <div
        style={{
          maxHeight: "310px",
          minHeight: "200px",
          overflowY: "auto",
          background: "#110a19",
          border: "1px solid #322042",
          borderRadius: "12px",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        {messages.map((msg, index) => (
          <div
            key={index}
            style={{
              alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "85%",
              padding: "12px 15px",
              borderRadius: "13px",
              background:
                msg.role === "user"
                  ? "linear-gradient(135deg, #9d174d 0%, #7e22ce 100%)"
                  : "#1c1228",
              border: `1px solid ${msg.role === "user" ? "#be185d" : "#3a274c"}`,
              color: "#f6f1fa",
              fontSize: "13.5px",
              lineHeight: 1.55,
              whiteSpace: "pre-wrap",
            }}
          >
            <small
              style={{
                display: "block",
                fontSize: "11px",
                fontWeight: 700,
                marginBottom: "4px",
                color: msg.role === "user" ? "#fbcfe8" : "#d8b4fe",
              }}
            >
              {msg.role === "user" ? `Você (${storeName})` : interviewerName}
            </small>
            {msg.content}
          </div>
        ))}
        {loading && (
          <div
            style={{
              alignSelf: "flex-start",
              padding: "10px 14px",
              borderRadius: "11px",
              background: "#1c1228",
              border: "1px solid #3a274c",
              color: "#d8b4fe",
              fontSize: "12.5px",
            }}
          >
            {interviewerName} está organizando sua resposta...
          </div>
        )}
      </div>

      {/* Sugestões Rápidas para a Etapa Atual */}
      {suggestions.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <small style={{ color: "#b8a7c6", fontSize: "11.5px", fontWeight: 600 }}>
            Sugestões rápidas (clique para preencher ou digite com suas palavras abaixo):
          </small>
          <div style={{ display: "flex", gap: "7px", flexWrap: "wrap" }}>
            {suggestions.map((suggestion, i) => (
              <button
                key={i}
                type="button"
                onClick={() => void handleSendAnswer(suggestion)}
                style={{
                  background: "#1d1329",
                  border: "1px solid #3d2852",
                  color: "#e6d8f0",
                  borderRadius: "8px",
                  padding: "6px 11px",
                  fontSize: "12px",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                + {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Campo de Resposta do Lojista */}
      {!readyToCompile && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSendAnswer();
          }}
          style={{ display: "flex", gap: "10px", alignItems: "center" }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Digite sua resposta para a entrevistadora e pressione Enter..."
            disabled={loading}
            style={{
              flex: 1,
              padding: "12px 14px",
              borderRadius: "10px",
              fontSize: "13.5px",
            }}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="op-primary"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "7px",
              padding: "12px 18px",
              borderRadius: "10px",
              fontWeight: 700,
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            <Send size={15} /> Responder
          </button>
        </form>
      )}

      {/* Resumo Estruturado Quando Pronto (ou botão de compilação antecipada) */}
      {previewProfile && (
        <div
          style={{
            background: "#140d1e",
            border: "1px solid #3d2852",
            borderRadius: "12px",
            padding: "14px 16px",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: "9px" }}>
            <Bot size={18} color="#f43f5e" style={{ flexShrink: 0, marginTop: "2px" }} />
            <div>
              <strong style={{ fontSize: "12.5px", color: "#fff", display: "block" }}>Assistente & Tom</strong>
              <small style={{ color: "#c0b2cc", fontSize: "12px" }}>{previewProfile.agentLabel}</small>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "9px" }}>
            <BookOpen size={18} color="#a855f7" style={{ flexShrink: 0, marginTop: "2px" }} />
            <div>
              <strong style={{ fontSize: "12.5px", color: "#fff", display: "block" }}>Base de Conhecimento</strong>
              <small style={{ color: "#c0b2cc", fontSize: "12px" }}>
                {previewProfile.storeInfo.length} caracteres organizados em blocos
              </small>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "9px" }}>
            <Clock size={18} color="#10b981" style={{ flexShrink: 0, marginTop: "2px" }} />
            <div>
              <strong style={{ fontSize: "12.5px", color: "#fff", display: "block" }}>Horários Automáticos</strong>
              <small style={{ color: "#c0b2cc", fontSize: "12px" }}>
                {previewProfile.operatingHours.days.join(", ").toUpperCase()} · {previewProfile.operatingHours.openTime} às{" "}
                {previewProfile.operatingHours.closeTime}
              </small>
            </div>
          </div>
        </div>
      )}

      {/* Rodapé de Ação Final */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "10px",
          borderTop: "1px solid #332042",
          paddingTop: "14px",
        }}
      >
        <span style={{ fontSize: "12px", color: "#b8a7c6", display: "flex", alignItems: "center", gap: "6px" }}>
          <ShieldCheck size={15} color="#10b981" />
          Preenche automaticamente: Base da Loja + Prompt de Comportamento + Grade de Horários.
        </span>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          {userAnswerCount >= 1 && (
            <button
              type="button"
              disabled={applying}
              onClick={() => void handleCompileAndApply(false)}
              style={{
                padding: "10px 16px",
                borderRadius: "10px",
                background: "#241634",
                border: "1px solid #583875",
                color: "#f3e8ff",
                fontWeight: 700,
                fontSize: "12.5px",
                cursor: "pointer",
              }}
            >
              Preencher Rascunho para Revisar
            </button>
          )}
          <button
            type="button"
            disabled={applying || userAnswerCount === 0}
            onClick={() => void handleCompileAndApply(true)}
            className="op-primary"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 18px",
              borderRadius: "10px",
              fontWeight: 700,
              fontSize: "13px",
              cursor: userAnswerCount === 0 ? "not-allowed" : "pointer",
              opacity: userAnswerCount === 0 ? 0.5 : 1,
            }}
          >
            <Sparkles size={15} />
            {applying ? "Aplicando e salvando..." : "Gerar e Salvar Configuração Completa"}
          </button>
        </div>
      </div>
    </div>
  );
}
