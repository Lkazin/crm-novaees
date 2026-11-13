export interface InterviewMessage {
  role: "user" | "assistant";
  content: string;
}

export interface DayScheduleItem {
  enabled: boolean;
  openTime: string;
  closeTime: string;
  hasBreak: boolean;
  breakStart: string;
  breakEnd: string;
  intervals: Array<{ start: string; end: string }>;
}

export interface CompiledOperatingHours {
  enabled: boolean;
  timezone: string;
  openTime: string;
  closeTime: string;
  days: string[];
  sendClosedMessage: boolean;
  closedMessage: string;
  schedule: Record<string, DayScheduleItem>;
}

export interface CompiledOnboardingProfile {
  agentLabel: string;
  instructions: string;
  storeInfo: string;
  operatingHours: CompiledOperatingHours;
  summary: string;
}

const ALL_DAYS = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"] as const;

function padTime(hour: number, minute = 0): string {
  const h = Math.max(0, Math.min(23, hour));
  const m = Math.max(0, Math.min(59, minute));
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Extrai dias da semana e horários de atendimento a partir de texto livre em português
 * (ex.: "Segunda a sexta das 8h às 18h, sábado das 9h às 13h").
 */
export function parsePortugueseSchedule(
  rawText: string,
  storeName = "nossa empresa",
): CompiledOperatingHours {
  const text = rawText
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  let defaultOpen = "08:00";
  let defaultClose = "18:00";
  let satOpen: string | null = null;
  let satClose: string | null = null;

  // Match time ranges like "8h as 18h", "08:30 as 18:30", "18h ate 23h30"
  const timeRangeRegex =
    /(\d{1,2})(?:[:h](\d{2}))?\s*(?:h|hs|horas)?\s*(?:as|ate|-|a)\s*(\d{1,2})(?:[:h](\d{2}))?/g;
  const matches = [...text.matchAll(timeRangeRegex)];

  if (matches.length > 0) {
    const first = matches[0];
    defaultOpen = padTime(Number(first[1]), first[2] ? Number(first[2]) : 0);
    defaultClose = padTime(Number(first[3]), first[4] ? Number(first[4]) : 0);
  }
  if (matches.length > 1 && text.includes("sab")) {
    const second = matches[1];
    satOpen = padTime(Number(second[1]), second[2] ? Number(second[2]) : 0);
    satClose = padTime(Number(second[3]), second[4] ? Number(second[4]) : 0);
  }

  let enabledDays: string[] = ["seg", "ter", "qua", "qui", "sex"];

  if (text.includes("todos os dias") || text.includes("segunda a domingo") || text.includes("domingo a domingo")) {
    enabledDays = [...ALL_DAYS];
  } else if (text.includes("terca a domingo")) {
    enabledDays = ["ter", "qua", "qui", "sex", "sab", "dom"];
  } else if (text.includes("quarta a domingo")) {
    enabledDays = ["qua", "qui", "sex", "sab", "dom"];
  } else if (text.includes("segunda a sabado")) {
    enabledDays = ["seg", "ter", "qua", "qui", "sex", "sab"];
  } else {
    const explicit: string[] = [];
    if (text.includes("segunda") || /\bseg\b/.test(text)) explicit.push("seg");
    if (text.includes("terca") || /\bter\b/.test(text)) explicit.push("ter");
    if (text.includes("quarta") || /\bqua\b/.test(text)) explicit.push("qua");
    if (text.includes("quinta") || /\bqui\b/.test(text)) explicit.push("qui");
    if (text.includes("sexta") || /\bsex\b/.test(text)) explicit.push("sex");
    if (text.includes("sabado") || /\bsab\b/.test(text)) explicit.push("sab");
    if (text.includes("domingo") || /\bdom\b/.test(text)) explicit.push("dom");

    if (text.includes("segunda a sexta") || text.includes("seg a sex")) {
      for (const d of ["seg", "ter", "qua", "qui", "sex"]) {
        if (!explicit.includes(d)) explicit.push(d);
      }
    }
    if (explicit.length > 0) {
      enabledDays = ALL_DAYS.filter((d) => explicit.includes(d));
    }
  }

  const hasBreak = text.includes("almoco") || text.includes("intervalo") || text.includes("pausa");
  let breakStart = "12:00";
  let breakEnd = "13:00";
  if (hasBreak && matches.length >= 2 && !satOpen) {
    const last = matches[matches.length - 1];
    breakStart = padTime(Number(last[1]), last[2] ? Number(last[2]) : 0);
    breakEnd = padTime(Number(last[3]), last[4] ? Number(last[4]) : 0);
  }

  const schedule: Record<string, DayScheduleItem> = {};
  for (const day of ALL_DAYS) {
    const isSat = day === "sab" && satOpen && satClose;
    schedule[day] = {
      enabled: enabledDays.includes(day),
      openTime: isSat ? satOpen! : defaultOpen,
      closeTime: isSat ? satClose! : defaultClose,
      hasBreak: hasBreak && day !== "sab" && day !== "dom",
      breakStart,
      breakEnd,
      intervals: [],
    };
  }

  return {
    enabled: true,
    timezone: "America/Sao_Paulo",
    openTime: defaultOpen,
    closeTime: defaultClose,
    days: enabledDays,
    sendClosedMessage: true,
    closedMessage: `Olá! Você falou com ${storeName}. Nosso atendimento humano funciona das ${defaultOpen} às ${defaultClose}, mas já registrei sua mensagem para nossa equipe!`,
    schedule,
  };
}

export const INTERVIEW_STEPS = [
  {
    step: 1,
    key: "identity",
    question: (interviewerName: string, storeName: string) =>
      `Olá! Eu sou a **${interviewerName}**, especialista de implantação da NovaesWeb. Vou configurar toda a inteligência da **${storeName}** com você através de perguntas rápidas.\n\nPara começar: **Qual nome você quer dar para a assistente virtual da sua loja e qual deve ser o tom de conversa dela?** (ex.: *Sofia, tom amigável e acolhedor*, ou *Consultor Alex, tom mais formal e direto*)`,
  },
  {
    step: 2,
    key: "catalog",
    question: () =>
      `Perfeito! Agora me conte sobre o que vocês vendem ou fazem:\n\n**Quais são os principais produtos ou serviços da empresa e os valores (ou faixa de preço) de cada um?** Pode digitar do seu jeito que eu organizo tudo.`,
  },
  {
    step: 3,
    key: "payment_delivery",
    question: () =>
      `Ótimo! E sobre pagamento e entrega/atendimento:\n\n**Quais formas de pagamento vocês aceitam (Pix, cartão, parcelamento) e como funciona a entrega, retirada ou agendamento?**`,
  },
  {
    step: 4,
    key: "hours",
    question: () =>
      `Anotei aqui! Agora vou configurar a grade de horários do sistema automaticamente:\n\n**Em quais dias da semana e horários vocês funcionam?** (ex.: *Segunda a sexta das 08h às 18h e sábado das 09h às 13h*)`,
  },
  {
    step: 5,
    key: "faq_location",
    question: () =>
      `Quase lá! **Qual é o endereço físico (se atenderem presencialmente) e quais são as dúvidas mais comuns que os clientes perguntam todo dia no WhatsApp?**`,
  },
  {
    step: 6,
    key: "handoff",
    question: () =>
      `Última pergunta: **Em quais situações a IA deve parar de responder sozinha e transferir imediatamente para um atendente humano da sua equipe?** (ex.: *quando o cliente quiser fechar pagamento, pedir desconto especial, orçamento personalizado ou fizer reclamação*)`,
  },
] as const;

export function buildNextInterviewTurn(
  messages: InterviewMessage[],
  interviewerName: string,
  storeName: string,
): { reply: string; currentStep: number; totalSteps: number; readyToCompile: boolean } {
  const userMessages = messages.filter((m) => m.role === "user" && m.content.trim().length > 0);
  const answeredCount = userMessages.length;
  const totalSteps = INTERVIEW_STEPS.length;

  if (answeredCount === 0) {
    return {
      reply: INTERVIEW_STEPS[0].question(interviewerName, storeName),
      currentStep: 1,
      totalSteps,
      readyToCompile: false,
    };
  }

  if (answeredCount < totalSteps) {
    const nextStepObj = INTERVIEW_STEPS[answeredCount];
    return {
      reply: nextStepObj.question(interviewerName, storeName),
      currentStep: answeredCount + 1,
      totalSteps,
      readyToCompile: false,
    };
  }

  return {
    reply: `Excelente! Já reuni todas as 6 etapas da **${storeName}** (identidade e tom de voz, catálogo e preços, pagamentos e entrega, grade de horários, endereço/FAQ e regras de transferência humana).\n\nClique no botão **"Gerar e Aplicar Configuração Completa"** abaixo para preencher automaticamente sua Base de Conhecimento, o Prompt de Comportamento e os Horários de Atendimento!`,
    currentStep: totalSteps,
    totalSteps,
    readyToCompile: true,
  };
}

export function compileProfileFromInterview(
  messages: InterviewMessage[],
  storeName: string,
): CompiledOnboardingProfile {
  const userAnswers = messages
    .filter((m) => m.role === "user" && m.content.trim().length > 0)
    .map((m) => m.content.trim());

  const identityRaw = userAnswers[0] || `Assistente Virtual da ${storeName}, tom amigável e profissional`;
  const catalogRaw = userAnswers[1] || "Consulte nossos produtos, serviços e condições com a equipe.";
  const paymentRaw = userAnswers[2] || "Aceitamos PIX e cartões. Consulte opções de entrega ou agendamento.";
  const hoursRaw = userAnswers[3] || "Segunda a sexta das 08:00 às 18:00";
  const faqRaw = userAnswers[4] || "Atendimento ágil via WhatsApp oficial.";
  const handoffRaw =
    userAnswers[5] ||
    "Quando o cliente solicitar atendente humano, negociar condições especiais ou relatar problemas.";

  // Extract assistant name if user wrote e.g. "Maya, tom amigável" or "Nome: Sofia"
  const lowerIdentity = identityRaw.toLowerCase();
  let toneInstruction =
    "Mantenha um tom amigável, acolhedor, prestativo e profissional, usando emojis leves com moderação.";
  if (lowerIdentity.includes("formal") || lowerIdentity.includes("corporativ") || lowerIdentity.includes("seri")) {
    toneInstruction =
      "Mantenha uma postura formal, educada, elegante e corporativa, sem gírias e com vocabulário preciso.";
  } else if (lowerIdentity.includes("diret") || lowerIdentity.includes("objetiv") || lowerIdentity.includes("rapido")) {
    toneInstruction = "Seja ágil, direto ao ponto e objetivo, priorizando respostas curtas e práticas.";
  }

  let extractedName = `Assistente ${storeName}`;
  const cleanedIdentity = identityRaw
    .replace(/tom\s+(amigavel|amigável|formal|direto|acolhedor|educado|simpatico|simpático).*/i, "")
    .replace(/^(nome|chama|vai se chamar|quero chamar de)\s*[:=-]?\s*/i, "")
    .split(/[.,;-]/)[0]
    .trim();
  if (cleanedIdentity && cleanedIdentity.length >= 2 && cleanedIdentity.length <= 40) {
    extractedName = cleanedIdentity.includes(storeName)
      ? cleanedIdentity
      : `${cleanedIdentity} - ${storeName}`;
  }

  const operatingHours = parsePortugueseSchedule(hoursRaw, storeName);

  const instructions = [
    `Você é ${extractedName}, assistente virtual oficial de atendimento da empresa "${storeName}" no WhatsApp.`,
    toneInstruction,
    `Regras de Conduta e Estilo definidas pelo lojista: ${identityRaw}.`,
    `Responda sempre em português do Brasil, em mensagens curtas e fáceis de ler no celular (1 a 3 parágrafos curtos).`,
    `NUNCA invente preços, prazos, produtos ou promoções que não estejam descritos na Base de Conhecimento da loja.`,
    `Quando transferir para atendimento humano: ${handoffRaw}`,
  ].join("\n");

  const storeInfo = [
    `### SOBRE A EMPRESA`,
    `Empresa: ${storeName}`,
    `Assistente Virtual: ${extractedName}`,
    ``,
    `### CATÁLOGO DE PRODUTOS, SERVIÇOS E PREÇOS`,
    catalogRaw,
    ``,
    `### FORMAS DE PAGAMENTO, ENTREGA E AGENDAMENTO`,
    paymentRaw,
    ``,
    `### HORÁRIOS DE FUNCIONAMENTO`,
    hoursRaw,
    ``,
    `### ENDEREÇO E PERGUNTAS FREQUENTES (FAQ)`,
    faqRaw,
    ``,
    `### REGRAS DE TRANSFERÊNCIA PARA ATENDENTE HUMANO`,
    handoffRaw,
  ].join("\n");

  return {
    agentLabel: extractedName,
    instructions,
    storeInfo,
    operatingHours,
    summary: `Configuração gerada para ${storeName}: assistente "${extractedName}", base de conhecimento estruturada e horários (${operatingHours.openTime} às ${operatingHours.closeTime}) preenchidos automaticamente.`,
  };
}
