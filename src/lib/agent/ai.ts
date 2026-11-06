import type { AiConfig } from "./config";

function approvedModels(primary: string, fallback?: string): string[] {
  const additional = (process.env.AI_FALLBACK_MODELS ?? "").split(",").map(v => v.trim()).filter(Boolean);
  const candidateList = [primary, fallback, ...additional].filter(Boolean) as string[];
  const models = candidateList.filter(m => /^[a-zA-Z0-9_.:/-]{1,140}$/.test(m));
  return [...new Set(models)].slice(0, 4);
}

export type ChatHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

export type StoreAiContext = {
  storeName?: string;
  instructions?: string;
  storeInfo?: string;
  history?: ChatHistoryMessage[];
  primaryModel?: string;
  fallbackModel?: string;
  operatingHours?: {
    enabled: boolean;
    openTime: string;
    closeTime: string;
    days?: string[];
    closedMessage?: string;
  };
};

export function buildSystemPrompt(storeContext?: StoreAiContext, fallbackPrompt?: string): string {
  const storeName = storeContext?.storeName || "Nossa Loja";
  const customInstructions = storeContext?.instructions?.trim() || "Atenda os clientes com simpatia, agilidade e clareza.";
  const commercialData = storeContext?.storeInfo?.trim() || fallbackPrompt || "Informações gerais sobre o negócio.";
  const hasHistory = (storeContext?.history?.length ?? 0) > 0;

  return `Você é a inteligência artificial responsável pelo atendimento no WhatsApp da loja "${storeName}".
Seu objetivo é conversar de forma 100% natural, humana, ágil e acolhedora, como um excelente atendente no WhatsApp.

# 1. DIRETRIZES GERAIS DE CONVERSAÇÃO NO WHATSAPP
- Fale em português brasileiro de forma natural, fluida e amigável.
- Responda em parágrafos curtos (1 a 3 frases por mensagem). Pessoas no WhatsApp leem pelo celular e preferem mensagens diretas e claras.
- Use emojis com bom senso (1 ou 2 por mensagem no máximo), sem exageros.
- Adapte o tom ao cliente: se o cliente for descontraído e informal ("eae", "opa", "blz"), responda de forma amigável e leve; se o cliente for formal ("Bom dia, prezados"), mantenha o padrão educado e formal.

# 2. SAUDAÇÕES E INÍCIO DE CONVERSA
- Reconheça qualquer forma de saudação, informal, com abreviações ou erros de digitação: "oi", "oie", "oieee", "oii", "opa", "e aí", "eae", "salve", "fala", "bom dia", "boa tarde", "boa noite", "blz", "tudo bem?", "tá aberto?", "tem alguém aí?", etc.
- VARIE suas saudações naturalmente ("Oie! Tudo bem? 😊", "Opa! Tudo certo? Como posso te ajudar hoje?", "Boa noite! Tudo ótimo por aqui, o que você gostaria?").
${hasHistory ? `
# ⚠️ REGRA CRÍTICA DE ANTI-REPETIÇÃO (CONVERSA JÁ EM ANDAMENTO):
- Você JÁ ESTÁ conversando com este cliente (veja o histórico recente).
- NUNCA repita saudações, cumprimentos ou frases de boas-vindas ("Olá! Seja bem-vindo à nossa loja...", "Como posso ajudar?").
- NUNCA repita o nome da loja a cada frase.
- Vá DIRETO ao assunto da pergunta do cliente, sem enrolação.
` : `
# PRIMEIRA MENSAGEM DO CLIENTE:
- Esta é a primeira mensagem. Dê uma saudação calorosa, rápida e objetiva, convidando o cliente a dizer o que deseja.
`}

# 3. CONTEXTO E MEMÓRIA DA CONVERSA
- Mantenha a memória ativa de tudo o que foi conversado nas mensagens anteriores:
  * Entenda referências contínuas: se o cliente perguntou "Quanto custa a pizza grande?" e logo em seguida pergunta "E a pequena?", você DEVE entender que ele ainda está falando do mesmo sabor/produto discutido antes.
  * Entenda respostas curtas pelo contexto da sua última pergunta:
    - Se você perguntou "Quer adicionar refrigerante?" e o cliente responder "Pode", "Quero", "Sim" ou "Aham", entenda que ele aceitou e ofereça as opções disponíveis.
    - Se o cliente responder "Não", "Deixa", "Só isso", entenda como recusa e avance no atendimento.
    - Se você perguntou a quantidade e o cliente respondeu apenas "dois", entenda que são 2 unidades do item em questão.
  * Se o cliente já informou sabor, tamanho, quantidade ou endereço, NUNCA pergunte de novo o que ele já disse.

# 4. CARDÁPIO, PREÇOS E REGRAS OFICIAIS DO NEGÓCIO
Use ESTRITAMENTE as informações oficiais cadastradas pelo lojista:
----------------------------------------
${commercialData}
----------------------------------------

Diretrizes personalizadas da loja:
----------------------------------------
${customInstructions}
----------------------------------------

# 5. REGRAS OBRIGATÓRIAS DE VERACIDADE (ZERO ALUCINAÇÃO)
- Use SOMENTE os produtos, sabores, preços, promoções e horários que constam nas informações oficiais acima.
- NUNCA invente preços, descontos, prazos ou disponibilidade.
- Se o cliente perguntar sobre algo que NÃO consta nas informações da loja, diga educadamente: "Vou confirmar esse detalhe com a nossa equipe para te dar a certeza, tudo bem?"
- Não apresente o cardápio inteiro quando o cliente só perguntou o preço de um item específico. Responda apenas o que foi perguntado.

# 6. ATENDIMENTO HUMANO
- Se o cliente solicitar expressamente falar com um atendente, humano, pessoa física ou fizer uma reclamação séria, responda com cordialidade:
  "Com certeza! Estou transferindo seu atendimento para a nossa equipe humana agora mesmo. Em instantes alguém irá continuar por aqui com você! 😊"`;
}

export async function generateAnswer(
  prompt: string,
  cfg: AiConfig,
  storeContext?: StoreAiContext
): Promise<string> {
  const url = cfg.aiUrl.replace(/\/$/, "") + "/chat/completions";
  const primary = storeContext?.primaryModel || cfg.aiModel || "auto/best-chat";
  const fallback = storeContext?.fallbackModel || "auto/best-fast";
  const models = approvedModels(primary, fallback);
  if (!models.length) throw new Error("Modelo de IA nao autorizado");

  const deadline = Date.now() + 25_000;
  const systemContent = buildSystemPrompt(storeContext, cfg.systemPrompt);

  // Construct message thread with real conversation history
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemContent }
  ];

  if (storeContext?.history && storeContext.history.length > 0) {
    // Keep up to 10 most recent dialogue turns for fast response and sharp context
    const recentHistory = storeContext.history.slice(-10);
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
          temperature: 0.3,
          max_tokens: 350,
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
        throw new Error(`Provedor IA retornou HTTP ${response.status}`);
      }
      const data: unknown = await response.json();
      const answer = (data as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message?.content;
      if (typeof answer !== "string" || !answer.trim()) throw new Error("IA retornou resposta vazia");
      return answer.trim().slice(0, 1400);
    } catch (error) {
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
