"use client";

// Explicacao da franquia de mensagens, em linguagem de negocio.
//
// Dois publicos, dois textos:
//  - "client": o lojista que precisa entender quando a IA para e quanto custa
//  - "master": voce, que precisa saber a regra exata que o banco aplica
//
// A regra vem de crm_attendance_permission + crm_recharge_consumed
// (migrations 20261111160000 e 20261111170000). Se a regra mudar no banco,
// este texto precisa mudar junto.

import { useState } from "react";
import { ChevronDown, HelpCircle, MessagesSquare, PackagePlus, RefreshCw, ShieldCheck } from "lucide-react";

type Audience = "client" | "master";

const CLIENT_FAQ: Array<{ q: string; a: string }> = [
  {
    q: "O que consome a minha franquia?",
    a: "Apenas as respostas que a IA envia no WhatsApp. Cada resposta enviada com sucesso desconta 1 mensagem. Mensagem que o cliente manda, mensagem que você digita pelo painel e resposta que falhou não descontam nada.",
  },
  {
    q: "Quando a franquia renova?",
    a: "No dia 1º de cada mês, no horário de Brasília. O contador volta ao total do seu plano e você começa o mês com a franquia cheia.",
  },
  {
    q: "O que acontece quando a franquia acaba?",
    a: "A IA para de responder automaticamente. As mensagens dos seus clientes continuam chegando e aparecendo no painel, mas nenhuma resposta sai sozinha — seu atendimento humano assume. Você recebe um aviso no painel quando chega em 80% e quando esgota.",
  },
  {
    q: "Quando a recarga entra em uso?",
    a: "Só depois que a franquia do plano acaba. Enquanto você estiver dentro das mensagens do plano, suas recargas ficam guardadas e o saldo não diminui. Isso protege você: você nunca perde recarga sem ter usado.",
  },
  {
    q: "A recarga expira?",
    a: "Não. O saldo de recarga fica guardado até ser realmente usado. A recarga só é consumida quando o plano do mês já acabou.",
  },
  {
    q: "Se eu comprar recarga e não usar, perco?",
    a: "Não. O saldo fica no seu nome e aparece no painel. Ele só diminui quando a IA responde depois de a franquia do plano ter acabado.",
  },
  {
    q: "A IA pode responder duas vezes a mesma mensagem?",
    a: "Não. Se a mesma mensagem for processada mais de uma vez por falha técnica, ela é contada uma única vez. O sistema é idempotente por mensagem.",
  },
  {
    q: "A recarga muda o valor da minha mensalidade?",
    a: "Não. A recarga é uma compra avulsa de mensagens extras. Sua mensalidade continua exatamente a mesma.",
  },
];

const MASTER_FAQ: Array<{ q: string; a: string }> = [
  {
    q: "Como o limite é calculado?",
    a: "limite = quotaLimit do plano + todas as recargas com status 'paid'. O valor é recalculado a cada mensagem, então mudar o plano no Painel Master muda o limite na hora — sem deploy. Se a loja tiver customQuotaOverride, ele vence o quotaLimit do plano.",
  },
  {
    q: "O que desconta 1 mensagem?",
    a: "Somente o envio confirmado pela IA. O fluxo é reserve → dispatch → commit em crm_ai_message_reservations; o contador em crm_attendance_usage só sobe no commit. Falha no envio devolve a reserva (release) e não cobra.",
  },
  {
    q: "Como a recarga é consumida?",
    a: "Depois da franquia do plano. crm_recharge_consumed = greatest(0, usado_no_mes − limite_do_plano), limitado ao total pago em recargas. Antes da migration 20261111170000 a recarga era somada ao plano e o saldo nunca diminuía.",
  },
  {
    q: "Onde ficam as fontes de verdade?",
    a: "Postgres é a fonte oficial: crm_attendance_usage (consumo do mês) e crm_ai_message_reservations (reservas). O Redis guarda projeção para o painel (crm:quota:<tenant>:<AAAA-MM>). O painel mostra o maior valor entre as duas.",
  },
  {
    q: "Qual é o custo real por resposta?",
    a: "Registrado em crm_ai_usage_events a cada chamada: tokens de entrada e saída, modelo que de fato atendeu e custo estimado em USD. Use isso para conferir se o preço de venda cobre o custo.",
  },
  {
    q: "O que trava o atendimento além da franquia?",
    a: "Tenant inativo, suspensão administrativa, ai_chat em manutenção, plano pendente e vencido, canal pausado, slot acima do maxWhatsappConnections, conversa em modo human/paused/resolved e o limite de respostas por janela de 24h (anti-loop).",
  },
];

export function QuotaExplainer({ audience = "client" }: { audience?: Audience }) {
  const [open, setOpen] = useState<number | null>(0);
  const faq = audience === "client" ? CLIENT_FAQ : MASTER_FAQ;
  const isClient = audience === "client";

  return (
    <div className="op-card" style={{ padding: "20px", borderRadius: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <div style={{ width: "34px", height: "34px", borderRadius: "10px", background: "rgba(139, 92, 246, 0.15)", display: "grid", placeItems: "center", flexShrink: 0 }}>
          <HelpCircle size={18} color="#c4b5fd" />
        </div>
        <div>
          <strong style={{ fontSize: "15px", color: "#fff", display: "block" }}>
            {isClient ? "Como funciona a franquia" : "Regras da franquia (visão técnica)"}
          </strong>
          <span style={{ fontSize: "12px", color: "#8e87a2" }}>
            {isClient
              ? "Tudo o que você precisa saber, sem termos técnicos."
              : "A regra exata aplicada pelo banco, para auditoria."}
          </span>
        </div>
      </div>

      {isClient ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px" }}>
          <Rule icon={<MessagesSquare size={15} />} title="1 resposta = 1 mensagem" text="Só a resposta que a IA envia desconta. Cliente escrevendo não gasta nada." />
          <Rule icon={<RefreshCw size={15} />} title="Zera no dia 1º" text="Todo mês a franquia volta cheia, no horário de Brasília." />
          <Rule icon={<PackagePlus size={15} />} title="Recarga vem depois" text="Suas recargas só entram em uso quando a franquia do plano acaba." />
          <Rule icon={<ShieldCheck size={15} />} title="Recarga não expira" text="O saldo fica guardado até ser usado de verdade." />
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "10px" }}>
          <Rule icon={<MessagesSquare size={15} />} title="limite = plano + recargas pagas" text="Recalculado por mensagem. customQuotaOverride vence o quotaLimit do plano." />
          <Rule icon={<RefreshCw size={15} />} title="period = AAAA-MM (America/Sao_Paulo)" text="Trial usa a chave 'trial' e expira por trialExpiresAt." />
          <Rule icon={<PackagePlus size={15} />} title="recarga = max(0, usado − plano)" text="Limitada ao total pago. Antes de 20261111170000 era somada ao plano." />
          <Rule icon={<ShieldCheck size={15} />} title="commit só após envio" text="reserve → dispatch → commit. Release devolve a reserva sem cobrar." />
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {faq.map((item, index) => {
          const expanded = open === index;
          return (
            <div key={item.q} style={{ border: "1px solid rgba(255,255,255,0.07)", borderRadius: "10px", overflow: "hidden", background: "rgba(255,255,255,0.02)" }}>
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : index)}
                aria-expanded={expanded}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "10px",
                  padding: "11px 14px",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                  color: "#e2e8f0",
                  fontSize: "13px",
                  fontWeight: 600,
                }}
              >
                <span>{item.q}</span>
                <ChevronDown size={15} style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.15s", flexShrink: 0, color: "#8e87a2" }} />
              </button>
              {expanded && (
                <p style={{ margin: 0, padding: "0 14px 12px", fontSize: "12.5px", lineHeight: 1.6, color: "#aba8bf" }}>
                  {item.a}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Rule({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div style={{ padding: "12px", borderRadius: "10px", border: "1px solid rgba(139, 92, 246, 0.2)", background: "rgba(139, 92, 246, 0.06)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#c4b5fd", marginBottom: "4px" }}>
        {icon}
        <strong style={{ fontSize: "12px" }}>{title}</strong>
      </div>
      <p style={{ margin: 0, fontSize: "11.5px", lineHeight: 1.5, color: "#aba8bf" }}>{text}</p>
    </div>
  );
}
