export type EscalationCategory =
  | "delay"
  | "refund"
  | "complaint"
  | "legal"
  | "human_request";

export interface EscalationResult {
  isEscalation: boolean;
  category?: EscalationCategory;
  reason?: string;
  customerReply?: string;
  sentiment?: "frustrated" | "urgent" | "neutral";
}

/**
 * Normalizes text: lowercase, removes diacritics/accents, trims whitespace
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Detects customer dissatisfaction, complaints, delay protests, refund demands,
 * legal threats or explicit human requests in WhatsApp messages.
 */
export function detectCustomerEscalation(text: string): EscalationResult {
  if (!text || typeof text !== "string") {
    return { isEscalation: false };
  }

  const norm = normalizeText(text);

  // 1. Legal / Regulatory / Authorities (Highest urgency)
  const legalRegex = /\b(procon|policia|delegacia|boletim de ocorrencia|process(o|ar)|advogad(o|a)|juizado|pequenas causas|patrulha do consumidor|denuncia(r)?|denunciando)\b/;
  if (legalRegex.test(norm)) {
    return {
      isEscalation: true,
      category: "legal",
      sentiment: "urgent",
      reason: "Ameaça Legal / Procon / Denúncia",
      customerReply:
        "Compreendemos a seriedade da sua mensagem. Pausei o atendimento da inteligência artificial e transferi sua conversa com prioridade máxima para a gerência da nossa equipe assumir agora mesmo. Por favor, aguarde um instante! 🙏"
    };
  }

  // 2. Refund / Chargeback / Cancellation demands
  const refundRegex = /\b(estorno|estornar|estorne|devolver (meu|o) dinheiro|devolva (meu|o) dinheiro|devolucao do (valor|dinheiro|pix)|quero meu dinheiro( de volta)?|quero (o )?reembolso|reembolsar|cancele(m)? meu pedido|cancela(r)? (o|meu) pedido|quero cancelar|cancelamento imediato|estorna o pix|estornar no cartao)\b/;
  if (refundRegex.test(norm)) {
    return {
      isEscalation: true,
      category: "refund",
      sentiment: "frustrated",
      reason: "Solicitação de Estorno / Cancelamento",
      customerReply:
        "Compreendo a sua solicitação. Pausei as respostas automáticas da inteligência artificial e transferi sua mensagem com prioridade urgente para a nossa equipe resolver o seu cancelamento/estorno diretamente. Um atendente já vai falar com você! 🙏"
    };
  }

  // 3. Severe Delay / Delivery Complaints
  // Must avoid matching innocent queries like "quanto tempo demora a entrega?"
  const delayRegex = /\b(atras(o|ado|ada)|muito atrasad(o|a)|atraso absurdo|demorando demais|demora absurda|nao aguento mais esperar|cade meu pedido|cade o pedido|onde esta o pedido|onde ta o pedido|meu pedido nao chegou|ainda nao chegou|nao recebi meu pedido|ja faz mais de|faz (mais de )?\d+ (horas|hora|minutos|min)|esperando ha (mais de )?\d+ (horas|minutos|min)|esperando faz horas|duas horas esperando|mais de uma hora esperando|\d+ (horas|hora|minutos|min) atrasad(o|a))\b/;
  const orderDelayed = /\b(pedido|entrega|lanche|pizza)\s+.*(atrasad(o|a)|demor(ando|ou))\b/;

  if (delayRegex.test(norm) || orderDelayed.test(norm)) {
    return {
      isEscalation: true,
      category: "delay",
      sentiment: "frustrated",
      reason: "Reclamação de Atraso na Entrega",
      customerReply:
        "Sinto muito pela demora na sua entrega! Já pausei o atendimento automático e transferi sua conversa com prioridade para nossa equipe humana verificar o status do seu pedido imediatamente. Por favor, aguarde só um momento! 🙏"
    };
  }

  // 4. Severe Dissatisfaction / Poor Quality / Bad Experience
  const complaintRegex = /\b(horrivel|pessim(o|a)|absurdo|palhacada|falta de respeito|pouca vergonha|sacanagem|descaso|lixo|porcaria|comida fria|comida estragada|estragad(o|a)|veio errado|pedido errado|veio faltando|faltando coisa|tudo queimado|nunca mais peco|nunca mais compro|pior atendimento|decepcionado|decepcionada|decepcao|indignado|indignada)\b/;
  if (complaintRegex.test(norm)) {
    return {
      isEscalation: true,
      category: "complaint",
      sentiment: "frustrated",
      reason: "Reclamação Severa de Produto/Atendimento",
      customerReply:
        "Lamentamos sinceramente pelo transtorno ocorrido! Prezamos muito pela qualidade do seu atendimento. Pausei a inteligência artificial e acionei nossa equipe humana para resolver isso imediatamente com você. Aguarde um instante! 🙏"
    };
  }

  // 5. Explicit Human Request
  const humanRegex = /\b(atendente|humano|humana|pessoa real|falar com ((um|uma|o|a|algum|alguma) )?(alguem|pessoa|atendente|humano|humana|dono|gerente|suporte|vendedor|vendedora|equipe|funcionario|gente)|chama(r)? ((um|uma|o|a) )?(atendente|alguem|pessoa|gerente|humano)|quero (atendimento humano|uma pessoa|um humano|um atendente)|passa(r)? para ((um|uma|o|a) )?(atendente|pessoa|humano)|transfer(ir|e) para ((um|uma|o|a) )?(atendente|pessoa|humano)|atendimento humano|nao quero (falar com )?(robo|ia|inteligencia artificial))\b/;
  if (humanRegex.test(norm)) {
    return {
      isEscalation: true,
      category: "human_request",
      sentiment: "neutral",
      reason: "Solicitação de Atendente Humano",
      customerReply:
        "Claro! 😊 Vou solicitar atendimento da nossa equipe para continuar sua conversa."
    };
  }

  return { isEscalation: false };
}
