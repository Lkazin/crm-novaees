import type { AiConfig } from "./config";
import { recordAiUsage } from "@/lib/crm/ai-usage";

function approvedModels(primary: string, fallback?: string): string[] {
  const rawEnv = process.env.AI_FALLBACK_MODELS;
  if (rawEnv !== undefined) {
    const additional = rawEnv.split(",").map(v => v.trim()).filter(Boolean);
    const candidateList = [primary, fallback, ...additional].filter(Boolean) as string[];
    const models = candidateList.filter(m => /^[a-zA-Z0-9_.:/-]{1,140}$/.test(m));
    return [...new Set(models)].slice(0, 4);
  }

  // When using automatic routing ("auto" or "auto/*"), prioritize fast, fluent
  // Brazilian Portuguese models first so it never falls into weak 7B non-PT models.
  if (primary.startsWith("auto")) {
    // auto/best-chat NAO entra na lista: ele roteia para um classificador de
    // seguranca (gpt-oss-safeguard) que devolve finish_reason=length com
    // content vazio. Cada tentativa custava ~1,2s do tempo do cliente antes de
    // cair no modelo que responde de verdade.
    const preferred = [
      primary !== "auto" ? primary : "auto/gpt",
      "auto/gpt",
      "groq/openai/gpt-oss-20b",
      fallback && !fallback.startsWith("auto") ? fallback : "auto/fast"
    ].filter(Boolean) as string[];
    return [...new Set(preferred)].slice(0, 4);
  }

  const candidateList = [primary, fallback, "groq/openai/gpt-oss-20b", "auto/gpt"].filter(Boolean) as string[];
  const models = candidateList.filter(m => /^[a-zA-Z0-9_.:/-]{1,140}$/.test(m));
  return [...new Set(models)].slice(0, 4);
}

export type ChatHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

export type DaySchedule = {
  enabled: boolean;
  openTime: string;
  closeTime: string;
  hasBreak?: boolean;
  breakStart?: string;
  breakEnd?: string;
};

export type StoreAiContext = {
  storeName?: string;
  agentLabel?: string;
  instructions?: string;
  storeInfo?: string;
  history?: ChatHistoryMessage[];
  primaryModel?: string;
  fallbackModel?: string;
  allowFallback?: boolean;
  isReturningAfterClosed?: boolean;
  tenantId?: string;
  conversationId?: string;
  /** Links oficiais autorizados. Vazio/ausente = a IA nao cita URL nenhuma. */
  officialLinks?: Record<string, string>;
  operatingHours?: {
    enabled: boolean;
    timezone?: string;
    openTime: string;
    closeTime: string;
    days?: string[];
    sendClosedMessage?: boolean;
    closedMessage?: string;
    schedule?: Record<string, DaySchedule>;
  };
};

const DAY_LABELS: Array<{ key: string; label: string }> = [
  { key: "seg", label: "Segunda-feira" },
  { key: "ter", label: "Terça-feira" },
  { key: "qua", label: "Quarta-feira" },
  { key: "qui", label: "Quinta-feira" },
  { key: "sex", label: "Sexta-feira" },
  { key: "sab", label: "Sábado" },
  { key: "dom", label: "Domingo" }
];

function parseMinutes(hhmm: string | undefined, fallback: number): number {
  if (!hhmm || typeof hhmm !== "string" || !/^\d{1,2}:\d{2}$/.test(hhmm.trim())) return fallback;
  const [h, m] = hhmm.trim().split(":").map(n => parseInt(n, 10) || 0);
  return h * 60 + m;
}

export function formatOperatingHoursForPrompt(
  hours?: StoreAiContext["operatingHours"],
  nowDate?: Date
): string {
  const now = nowDate ?? new Date();
  const tz = hours?.timezone && hours.timezone.trim() ? hours.timezone.trim() : "America/Sao_Paulo";

  let currentDayKey = "seg";
  let currentDayLabel = "Segunda-feira";
  let formattedDate = "";
  let formattedTime = "";
  let currentMinutes = 12 * 60;

  try {
    const enParts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).formatToParts(now);

    const dayStr = enParts.find(p => p.type === "weekday")?.value?.toLowerCase() || "mon";
    const rawHour = parseInt(enParts.find(p => p.type === "hour")?.value || "0", 10);
    const hour = rawHour === 24 ? 0 : rawHour;
    const minute = parseInt(enParts.find(p => p.type === "minute")?.value || "0", 10);
    currentMinutes = hour * 60 + minute;

    const map: Record<string, { key: string; label: string }> = {
      mon: { key: "seg", label: "Segunda-feira" },
      tue: { key: "ter", label: "Terça-feira" },
      wed: { key: "qua", label: "Quarta-feira" },
      thu: { key: "qui", label: "Quinta-feira" },
      fri: { key: "sex", label: "Sexta-feira" },
      sat: { key: "sab", label: "Sábado" },
      sun: { key: "dom", label: "Domingo" }
    };
    if (map[dayStr]) {
      currentDayKey = map[dayStr].key;
      currentDayLabel = map[dayStr].label;
    }

    formattedDate = new Intl.DateTimeFormat("pt-BR", {
      timeZone: tz,
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }).format(now);
    formattedTime = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  } catch {
    formattedTime = "horário local";
  }

  if (!hours) {
    return `- Momento atual (${tz}): ${currentDayLabel}, ${formattedDate} às ${formattedTime}.\n- Horário de funcionamento: consulte as informações na Base de Conhecimento abaixo.`;
  }

  const defaultOpen = hours.openTime || "08:00";
  const defaultClose = hours.closeTime || "18:00";
  const activeDays = Array.isArray(hours.days) ? hours.days : ["seg", "ter", "qua", "qui", "sex", "sab"];

  const lines: string[] = [];
  let isOpenRightNow = false;
  let todaySummary = "";

  for (const d of DAY_LABELS) {
    const dayCfg = hours.schedule?.[d.key];
    const isEnabled = dayCfg ? Boolean(dayCfg.enabled) : activeDays.includes(d.key);
    const openT = dayCfg?.openTime || defaultOpen;
    const closeT = dayCfg?.closeTime || defaultClose;
    const hasBreak = Boolean(dayCfg?.hasBreak && dayCfg?.breakStart && dayCfg?.breakEnd);
    const breakText = hasBreak ? ` (Intervalo/pausa das ${dayCfg!.breakStart} às ${dayCfg!.breakEnd})` : "";

    const lineText = isEnabled
      ? `das ${openT} às ${closeT}${breakText}`
      : "Fechado";

    lines.push(`  • ${d.label}: ${lineText}`);

    if (d.key === currentDayKey) {
      todaySummary = lineText;
      if (isEnabled) {
        const openMin = parseMinutes(openT, 0);
        const closeMin = parseMinutes(closeT, 23 * 60 + 59);
        const inWindow = closeMin > openMin
          ? currentMinutes >= openMin && currentMinutes <= closeMin
          : currentMinutes >= openMin || currentMinutes <= closeMin;
        let inBreak = false;
        if (hasBreak) {
          const bStart = parseMinutes(dayCfg!.breakStart, -1);
          const bEnd = parseMinutes(dayCfg!.breakEnd, -1);
          if (bStart >= 0 && bEnd > bStart && currentMinutes >= bStart && currentMinutes < bEnd) {
            inBreak = true;
          }
        }
        isOpenRightNow = inWindow && !inBreak;
      }
    }
  }

  const statusNow = isOpenRightNow
    ? `ABERTO AGORA (Hoje, ${currentDayLabel}, funciona ${todaySummary})`
    : `FORA DO HORÁRIO COMERCIAL NESTE INSTANTE (Hoje, ${currentDayLabel}: ${todaySummary})`;

  return [
    `- Data e hora exata agora (${tz}): ${currentDayLabel}, ${formattedDate} às ${formattedTime}.`,
    `- Status do estabelecimento neste momento: ${statusNow}.`,
    `- Quadro de Horários de Funcionamento Cadastrado no Painel:`,
    ...lines
  ].join("\n");
}

export function buildSystemPrompt(storeContext?: StoreAiContext, fallbackPrompt?: string): string {
  const storeName = storeContext?.storeName || "Nossa Loja";
  const agentLabel = storeContext?.agentLabel?.trim() || "Assistente Virtual";
  const customInstructions = storeContext?.instructions?.trim() || "Atenda os clientes com simpatia, agilidade e clareza.";
  const commercialData = storeContext?.storeInfo?.trim() || fallbackPrompt || "Informações gerais sobre o negócio.";
  const hasHistory = (storeContext?.history?.length ?? 0) > 0;
  const isReturning = Boolean(storeContext?.isReturningAfterClosed);
  const scheduleSection = formatOperatingHoursForPrompt(storeContext?.operatingHours);
  // So links cadastrados e validados entram no prompt. Sem cadastro, a IA e
  // instruida a nao citar endereco nenhum — antes ela inventava URL de
  // inscricao/contratacao porque nao tinha nenhuma para usar.
  const linksEntries = Object.entries(storeContext?.officialLinks ?? {})
    .filter(([, v]) => typeof v === "string" && /^https?:\/\//i.test(v.trim()))
    .map(([k, v]) => `- ${k}: ${v.trim()}`);
  const linksSection = linksEntries.length > 0
    ? `Links oficiais autorizados (use EXATAMENTE estes, copiados caractere por caractere):\n${linksEntries.join("\n")}`
    : `NENHUM link oficial esta cadastrado. Voce NAO PODE citar, sugerir, montar ou inventar nenhum endereco, URL, dominio, link de inscricao, de pagamento ou de contratacao. Se o cliente pedir um link, diga com naturalidade que vai confirmar com a equipe e ofereca atendimento humano.`;

  return `Você é "${agentLabel}", responsável pelo atendimento no WhatsApp do estabelecimento "${storeName}".
Seu papel é conversar como uma pessoa real da equipe no WhatsApp: 100% humana, acolhedora, inteligente, ágil e resolutiva.

# 1. NATURALIDADE HUMANA NO WHATSAPP (ZERO CARA DE ROBÔ)
- Escreva em português brasileiro natural, fluido e simpático, exatamente como um excelente atendente humano conversa no WhatsApp.
- OBJETIVO ACIMA DE TUDO: responda só o que foi perguntado, em UMA mensagem curta. Se a resposta cabe em 2 ou 3 linhas, escreva 2 ou 3 linhas. Não liste tudo o que o plano inclui se ele perguntou o preço, e não repita o que você já disse antes nesta conversa.
- NÃO FRAGMENTE: escreva a resposta em um bloco único. Não use linha em branco para separar ideias, porque cada bloco vira uma mensagem separada no WhatsApp e o cliente recebe várias notificações para uma pergunta só.
- NUNCA comece um parágrafo novo com "E", "Mas", "Então" ou "Por isso": essas palavras continuam a frase anterior.
- Use emojis com moderação e naturalidade (1 ou 2 por mensagem).
- Adapte-se ao estilo do cliente: se ele for informal ("eae", "opa", "blz", "manda ai"), responda de forma leve e próxima; se for formal, mantenha o tom educado e prestativo.
- PROIBIDO dar respostas falsas de espera como "Vou verificar as informações da loja para você", "Vou buscar no sistema" ou "Aguarde que vou checar". Você JÁ TEM todas as informações da loja e os horários logo abaixo neste prompt — responda a dúvida do cliente IMEDIATAMENTE na mesma mensagem!

# 2. COMPREENSÃO TOTAL DE PALAVRAS ERRADAS, ABREVIAÇÕES E ÁUDIOS TRANSCRITOS
- Clientes no WhatsApp digitam rápido, com corretor errando, sem acento, com palavras grudadas ou erros fonéticos.
- Você DEVE compreender perfeitamente qualquer abreviação de WhatsApp ("vc", "oq", "qto", "hj", "pfv", "blz", "vlw", "tbm", "cmg", "p/", "c/", "s/"), gíria e palavra escrita errada ou fonética ("piza"=pizza, "calabreza"=calabresa, "preso"=preço, "abeto"=aberto, "entega"=entrega, "orsamento"=orçamento, "siti"=site).
- NUNCA corrija a gramática do cliente e NUNCA diga "não entendi o que você quis dizer" por causa de erro de digitação. Deduza a intenção pelo contexto do negócio e responda naturalmente!

# 3. INTELIGÊNCIA EMOCIONAL (QUANDO O CLIENTE ESTÁ NERVOSO, ANSIOSO OU COM PRESSA)
- Se perceber o cliente nervoso, ansioso, impaciente ou com pressa (MAIÚSCULAS, "???", "!!!", "tô com pressa", "me ajuda logo"):
  1. Acalme primeiro, com empatia humana genuína ("Fica tranquilo(a), já estou aqui com você!").
  2. Nunca seja frio, defensivo ou burocrático.
  3. Responda de forma direta, simples e imediata.
  4. Se continuar insatisfeito, ofereça falar com uma pessoa da equipe na hora.

# 4. CONTINUIDADE DE CONVERSA ATIVA VS RETORNO APÓS ENCERRAMENTO
${isReturning ? `- RETORNO APÓS ATENDIMENTO ENCERRADO: O ciclo anterior de atendimento deste cliente foi finalizado. Ele está iniciando um NOVO contato agora!
  * Cumprimente cordialmente pelo retorno (ex.: "Olá novamente! Bem-vindo(a) de volta! Como posso te ajudar hoje? 😊").
  * O histórico anterior está disponível para consulta se o cliente fizer referência a algo já conversado, mas trate como um novo atendimento acolhedor.` : hasHistory ? `- ATENÇÃO MÁXIMA — CONVERSA ATIVA EM ANDAMENTO (PRESERVAÇÃO DO ASSUNTO E RESGATE DE TÓPICO):
  * Você JÁ está conversando ativamente com este cliente (consulte o histórico recente).
  * NUNCA aja como se fosse a primeira vez que ele fala com você. NUNCA repita apresentações, boas-vindas institucionais ("Olá!", "Oi, tudo bem?", "Seja bem-vindo à...") nem perguntas que o cliente já respondeu.
  * MENSAGENS CURTAS, SAUDAÇÕES E CONFIRMAÇÕES ("oi", "oie", "beleza", "blz", "boa noite", "voltei", "sim", "ok", "kkk", "opa", "e aí"):
    - O cliente está apenas dando continuidade à conversa que já está aberta!
    - Conecte IMEDIATAMENTE sua resposta ao assunto/pergunta em aberto na conversa anterior.
    - Resgate o tópico com naturalidade e dê prosseguimento imediato (ex.: se você perguntou Business ou Premium e ele mandou "Oie", responda "Opa! 😄 A gente tava falando dos planos de delivery. Quer que eu continue te mostrando?")` : `- PRIMEIRA MENSAGEM: Cumprimente de forma calorosa e natural (se o cliente apenas deu "oi/oie/bom dia", apresente-se brevemente como ${agentLabel} da ${storeName} e pergunte como pode ajudar; se ele já fez uma pergunta direta, cumprimente rapidamente e já responda a pergunta!).`}

# 5. MUDANÇA FLUIDA DE ASSUNTO
- Se o cliente estiver conversando sobre um tema (ex.: planos de delivery) e de repente perguntar sobre outro assunto (ex.: criação de sites, horários, formas de pagamento ou outro serviço):
  * ACOMPANHE a mudança de assunto IMEDIATAMENTE sem hesitar.
  * NUNCA obrigue o cliente a terminar formalmente o assunto anterior para poder iniciar o novo.
  * Deixe de lado o tópico que o cliente abandonou e foque 100% no novo interesse ou dúvida apresentada.

# 6. RECONHECIMENTO DE CONCLUSÃO E REGRA ANTI-ALUCINAÇÃO DE PEDIDOS
- QUANDO O CLIENTE CONCLUI O OBJETIVO:
  * Identifique quando o cliente encerrou ou informou que não precisa de mais nada (ex.: "obrigado, era só isso", "não preciso de mais nada", "muito obrigado", "valeu, tchau", "perfeito, obrigado").
  * Quando houver essa conclusão cordial, agradeça com simpatia e conclua cordialmente a conversa desejando um ótimo dia/noite.
  * Não faça perguntas desnecessárias para insistir ou prolongar a conversa se o cliente já deu por encerrado.
- REGRA DE OURO ANTI-ALUCINAÇÃO: interesse comercial ("quero esse", "vou querer", "me manda o pix") NUNCA é pedido ou pagamento confirmado. Nunca diga "pedido confirmado" ou "pagamento recebido" sem confirmação real no sistema. No interesse de compra, passe as orientações oficiais de fechamento (PIX, link da loja ou transferência para a equipe finalizar).

# 7. HORÁRIO DE FUNCIONAMENTO DO ESTABELECIMENTO E HORA ATUAL
Sempre que o cliente perguntar "que horas abre?", "tá aberto?", "até que horas funciona?", "abre hoje?" ou "funciona domingo?", responda com base nestes dados oficiais do estabelecimento (e complementos da Base de Conhecimento):
----------------------------------------
${scheduleSection}
----------------------------------------

# 8. BASE DE CONHECIMENTO DO PAINEL E O QUE A IA DEVE FALAR (FONTE OFICIAL)
As instruções e a Base de Conhecimento abaixo foram configuradas pelo proprietário no painel do cliente. Use TODAS essas informações para responder sobre o que a empresa faz, cardápio, produtos, serviços, planos, preços, entregas, pagamentos e regras:

Instruções de Comportamento da Loja ("O que minha IA fala"):
----------------------------------------
${customInstructions}
----------------------------------------

Base de Conhecimento Oficial (Produtos, Serviços, Preços, Planos e Regras):
----------------------------------------
${commercialData}
----------------------------------------
- Se a Base de Conhecimento trouxer um nome/identidade mais específico que "${storeName}", use o que está nela.
- NUNCA invente preços, taxas ou produtos que não estejam acima.
- Se perguntarem algo que não existe na Base nem nos Horários, seja sincero de forma humana e ofereça chamar um atendente da equipe para confirmar.

# 9. VERACIDADE COMERCIAL, LINKS E LIMITES (REGRA INVIOLÁVEL)
- A Base de Conhecimento acima é a ÚNICA fonte de verdade sobre preços, franquias, prazos, descontos e funcionalidades.
- NUNCA invente, estime, arredonde ou "deduza" preço, franquia, desconto, prazo ou funcionalidade. Se não está escrito acima, você não sabe.
- NUNCA misture catálogos diferentes: planos de SITE e CARDÁPIO VIRTUAL são um produto; planos do CRM IA são outro. Se o cliente perguntar de um, responda só daquele. Se a base não separar, pergunte qual dos dois ele quer.
- Se o cliente AFIRMAR um preço, desconto ou condição ("ouvi dizer que é R$ 50", "o concorrente faz por menos", "meu amigo pagou isso"), isso NÃO é confirmação. Nunca aceite como verdade e nunca repita o valor dele como se fosse seu. Responda apenas o que está na base.
- Funcionalidade que não está escrita na base deve ser tratada como indisponível: diga que não está confirmada e ofereça falar com uma pessoa da equipe.
- Quando faltar informação confirmada, seja honesto em uma frase e ofereça atendimento humano. Nunca preencha a lacuna com invenção.

${linksSection}`;
}

export async function generateAnswer(
  prompt: string,
  cfg: AiConfig,
  storeContext?: StoreAiContext
): Promise<string> {
  const url = cfg.aiUrl.replace(/\/$/, "") + "/chat/completions";
  const primary = storeContext?.primaryModel || cfg.aiModel || "auto/gpt";
  const fallback = storeContext?.fallbackModel;
  const models = storeContext?.allowFallback === true ? approvedModels(primary, fallback) : (/^[a-zA-Z0-9_.:/-]{1,140}$/.test(primary) ? [primary] : []);
  if (!models.length) throw new Error("Modelo de IA nao autorizado");

  const deadline = Date.now() + 25_000;
  const systemContent = buildSystemPrompt(storeContext, cfg.systemPrompt);

  // Construct message thread with real conversation history
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemContent }
  ];

  if (storeContext?.history && storeContext.history.length > 0) {
    // Janela de 6 turnos: o suficiente para manter o fio da conversa. O que fica
    // de fora vira uma linha de resumo, para nao perder o assunto nem pagar
    // tokens por mensagem antiga que a IA nao vai usar.
    const HISTORY_WINDOW = 6;
    const recentHistory = storeContext.history.slice(-HISTORY_WINDOW);
    const olderHistory = storeContext.history.slice(0, -HISTORY_WINDOW);
    if (olderHistory.length > 0) {
      // Resumo curto: 2 linhas no maximo. Antes eram 8 trechos de 120 chars, o
      // que somava quase tanto quanto as mensagens que o resumo deveria poupar.
      const resumo = olderHistory
        .filter(m => m.content && m.content.trim())
        .map(m => m.content.trim().replace(/\s+/g, " ").slice(0, 80))
        .slice(-2)
        .join(" | ");
      if (resumo) {
        messages.push({
          role: "system",
          content: `Contexto anterior (nao repita): ${resumo}`
        });
      }
    }
    for (const msg of recentHistory) {
      if (msg.content && msg.content.trim()) {
        messages.push({
          role: msg.role === "assistant" ? "assistant" : "user",
          content: msg.content.trim()
        });
      }
    }
  }

  // Add the incoming prompt from the user
  messages.push({ role: "user", content: prompt });

  for (let index = 0; index < models.length; index++) {
    const currentModel = models[index];
    const controller = new AbortController();
    const ms = Math.min(12_000, deadline - Date.now());
    if (ms <= 0) throw new Error("Tempo maximo de IA excedido");
    const timeout = setTimeout(() => controller.abort(), ms);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.aiKey}` },
        body: JSON.stringify({
          model: currentModel,
          temperature: 0.35,
          max_tokens: 700,
          messages,
        }),
        signal: controller.signal,
        cache: "no-store",
      });
      if (!response.ok) {
        const retryable = [429, 500, 502, 503, 504].includes(response.status);
        if (retryable && index + 1 < models.length && Date.now() < deadline) {
          console.warn(`[ai-fallback] Model ${currentModel} returned ${response.status}. Switching to fallback: ${models[index + 1]}`);
          continue;
        }
        const nonRetryableErr = new Error(`Provedor IA retornou HTTP ${response.status}`);
        (nonRetryableErr as unknown as { nonRetryable: boolean }).nonRetryable = true;
        throw nonRetryableErr;
      }
      const data: unknown = await response.json();
      const answer = (data as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message?.content;
      const usage = (data as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage;
      const servedModel = (data as { model?: string }).model || currentModel;
      void recordAiUsage({
        tenantId: storeContext?.tenantId,
        conversationId: storeContext?.conversationId,
        provider: "omniroute",
        model: servedModel,
        status: typeof answer === "string" && answer.trim() ? "success" : "empty",
        promptTokens: usage?.prompt_tokens ?? null,
        completionTokens: usage?.completion_tokens ?? null,
      });
      if (typeof answer !== "string" || !answer.trim()) {
        if (index + 1 < models.length && Date.now() < deadline) {
          console.warn(`[ai-fallback] Model ${currentModel} returned empty content. Switching to fallback: ${models[index + 1]}`);
          continue;
        }
        throw new Error("IA retornou resposta vazia");
      }
      return answer.trim().slice(0, 1400);
    } catch (error) {
      if ((error as { nonRetryable?: boolean })?.nonRetryable) throw error;
      if (index + 1 < models.length && Date.now() < deadline) {
        console.warn(`[ai-fallback] Error on model ${currentModel}. Switching to fallback: ${models[index + 1]}`);
        continue;
      }
      if (index + 1 >= models.length || Date.now() >= deadline) throw error;
      if (!(error instanceof TypeError) && !(error instanceof DOMException && error.name === "AbortError")) throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("Todas as rotas de IA permitidas falharam");
}
