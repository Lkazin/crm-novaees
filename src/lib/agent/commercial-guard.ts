/**
 * Guardas de segurança comercial da IA.
 *
 * Funções puras, sem I/O: recebem o texto que a IA produziu e o que está
 * autorizado, e dizem o que está errado. Servem para (a) bloquear link
 * inventado antes do envio e (b) alimentar os indicadores de qualidade do
 * Painel Master com eventos verificáveis, não com estimativa.
 */

export type OfficialLinks = Record<string, string>;

const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;

/** Extrai as URLs de um texto, sem pontuação final grudada. */
export function extractUrls(text: string): string[] {
  const found = text.match(URL_RE) ?? [];
  return found.map((u) => u.replace(/[.,;:!?]+$/, ""));
}

/** Normaliza para comparar: sem barra final, sem query, minúsculo. */
function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return url.trim().replace(/\/+$/, "").toLowerCase();
  }
}

/**
 * URLs citadas que NÃO estão na lista oficial.
 * Lista oficial vazia => qualquer URL citada é não autorizada.
 */
export function findUnauthorizedUrls(text: string, officialLinks?: OfficialLinks): string[] {
  const cited = extractUrls(text);
  if (cited.length === 0) return [];
  const allowed = new Set(
    Object.values(officialLinks ?? {})
      .filter((v) => typeof v === "string" && v.trim().length > 0)
      .map(normalizeUrl)
  );
  return cited.filter((u) => !allowed.has(normalizeUrl(u)));
}

/** A resposta cita alguma URL? Usado para decidir se vale checar. */
export function citesAnyUrl(text: string): boolean {
  return extractUrls(text).length > 0;
}

/**
 * Valores em reais citados na resposta. Serve para comparar com os preços
 * autorizados da base e detectar invenção de preço.
 */
export function extractBrlValues(text: string): number[] {
  const out: number[] = [];
  const re = /R\$\s*([\d.]+)(?:,(\d{2}))?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    let rawInt = m[1];
    let centavos = m[2];
    // Se vier no formato "R$ 100.00" (ponto decimal em vez de virgula)
    if (!centavos && /\.\d{2}$/.test(rawInt)) {
      centavos = rawInt.slice(-2);
      rawInt = rawInt.slice(0, -3);
    }
    const inteiro = rawInt.replace(/\./g, "");
    const n = Number(`${inteiro}.${centavos ?? "00"}`);
    if (Number.isFinite(n)) out.push(n);
  }
  const reReais = /\b(\d+(?:[.,]\d{2})?)\s*reais\b/gi;
  while ((m = reReais.exec(text)) !== null) {
    const n = Number(m[1].replace(",", "."));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

/**
 * Preços citados que não aparecem na base autorizada.
 * `allowedText` é o texto da base de conhecimento (artigos publicados).
 */
export function findUnauthorizedPrices(text: string, allowedText: string): number[] {
  const cited = extractBrlValues(text);
  if (cited.length === 0) return [];
  const allowed = new Set(extractBrlValues(allowedText));
  return cited.filter((v) => !allowed.has(v));
}

/**
 * Detecta mistura de catálogos: a resposta fala de site/cardápio E de CRM IA
 * na mesma mensagem. É o sintoma nº 1 relatado no atendimento real.
 *
 * `groups` permite configurar os catálogos por tenant. Sem ele, vale o par
 * padrão (site/cardápio x CRM), que é o do negócio NovaesWeb.
 */
export type CatalogGroup = { label: string; pattern: RegExp };

const DEFAULT_CATALOG_GROUPS: CatalogGroup[] = [
  { label: "site", pattern: /\b(site|sites|card[aá]pio virtual|card[aá]pio digital)\b/ },
  { label: "crm", pattern: /\b(crm|franquia|mensagens mensais|whatsapps conectados|operadores)\b/ }
];

export function mixesCatalogs(text: string, groups: CatalogGroup[] = DEFAULT_CATALOG_GROUPS): boolean {
  const t = text.toLowerCase();
  const ativos = groups.filter((g) => g.pattern.test(t));
  return ativos.length >= 2;
}

/**
 * O cliente está afirmando um preço/condição para induzir a IA?
 * Ex.: "ouvi dizer que é R$ 50", "meu amigo paga menos", "o concorrente cobra".
 */
export function clientAssertsPrice(text: string): boolean {
  const t = text.toLowerCase();
  const temValor = /r\$\s*\d/.test(t) || /\b\d+\s*(reais|conto|pila)\b/.test(t);
  const atribui =
    /(ouvi|ouvi dizer|me falaram|disseram|vi que|achei que|pensei que|meu amigo|um amigo|o concorrente|outra empresa|na internet|no site de vocês)/.test(
      t
    );
  return temValor && atribui;
}

/** O cliente pediu atendimento humano? */
export function asksForHuman(text: string): boolean {
  return /(atendente|humano|pessoa de verdade|falar com algu[eé]m|falar com uma pessoa|supervisor|gerente|respons[aá]vel)/i.test(
    text
  );
}

/** O cliente pediu link de contratação/inscrição/pagamento? */
export function asksForLink(text: string): boolean {
  return /(link|url|endere[cç]o|site de voc[eê]s|onde (eu )?(assino|contrato|pago|me inscrevo)|como (eu )?(assino|contrato|pago))/i.test(
    text
  );
}

export type CommercialViolation =
  | "unauthorized_url"
  | "unauthorized_price"
  | "mixed_catalogs";

/**
 * Avalia uma resposta da IA contra a base e os links autorizados.
 * Retorna a lista de violações — vazia significa resposta segura.
 */
export function auditAiReply(params: {
  reply: string;
  allowedText: string;
  officialLinks?: OfficialLinks;
  catalogGroups?: CatalogGroup[];
}): CommercialViolation[] {
  const out: CommercialViolation[] = [];
  if (findUnauthorizedUrls(params.reply, params.officialLinks).length > 0) {
    out.push("unauthorized_url");
  }
  if (findUnauthorizedPrices(params.reply, params.allowedText).length > 0) {
    out.push("unauthorized_price");
  }
  if (mixesCatalogs(params.reply, params.catalogGroups)) {
    out.push("mixed_catalogs");
  }
  return out;
}

/** Resposta segura quando a IA inventa preço: confirma com humano, sem valor. */
export const SAFE_HANDOFF_REPLY =
  "Essa informação eu prefiro confirmar com a equipe para não te passar nada errado. Já chamei uma pessoa para continuar com você 😊";

export type SanitizeResult = {
  /** Texto que pode ir para o cliente. */
  reply: string;
  violations: CommercialViolation[];
  /** true = a resposta original foi descartada e trocada por SAFE_HANDOFF_REPLY. */
  blocked: boolean;
  /** URLs inventadas que foram removidas do texto. */
  removedUrls: string[];
};

function tidyAfterRemoval(text: string): string {
  return text
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Prepara a resposta para envio: remove link não autorizado e troca a resposta
 * inteira quando há preço fora da base.
 *
 * Antes a auditoria só gravava evento e a resposta inventada ia para o cliente
 * do mesmo jeito. Preço errado é o erro mais caro (o cliente cobra o valor
 * depois), então nesse caso a resposta é descartada. Link inventado é removido
 * do texto, que continua útil no resto. Mistura de catálogo não é reescrita
 * automaticamente: fica registrada como evento para revisão humana.
 */
export function sanitizeAiReply(params: {
  reply: string;
  allowedText: string;
  officialLinks?: OfficialLinks;
  catalogGroups?: CatalogGroup[];
}): SanitizeResult {
  const original = (params.reply ?? "").trim();
  const violations = auditAiReply({
    reply: original,
    allowedText: params.allowedText,
    officialLinks: params.officialLinks,
    catalogGroups: params.catalogGroups
  });

  if (violations.includes("unauthorized_price")) {
    return { reply: SAFE_HANDOFF_REPLY, violations, blocked: true, removedUrls: [] };
  }

  if (!violations.includes("unauthorized_url")) {
    return { reply: original, violations, blocked: false, removedUrls: [] };
  }

  const removedUrls = findUnauthorizedUrls(original, params.officialLinks);
  let limpo = original;
  for (const url of removedUrls) {
    limpo = limpo.split(url).join("");
  }
  limpo = tidyAfterRemoval(limpo);

  // Se sobrou só saudação/pontuação, o texto perdeu o sentido: manda o seguro.
  if (limpo.replace(/[^\p{L}\p{N}]/gu, "").length < 15) {
    return { reply: SAFE_HANDOFF_REPLY, violations, blocked: true, removedUrls };
  }

  return { reply: limpo, violations, blocked: false, removedUrls };
}

/**
 * Resposta padrao quando o cliente pede algo fora do escopo do negocio conectado
 * (ex.: "pesquisa no Google", curiosidades gerais, codigo, receitas, clima).
 */
export function buildOutOfScopeReply(storeName?: string): string {
  const loja = storeName?.trim();
  return loja
    ? `Desculpe, sou o assistente virtual de atendimento da ${loja} e respondo apenas sobre nossos serviços, produtos, horários e atendimento. Como posso te ajudar com isso?`
    : "Desculpe, sou um assistente focado exclusivamente no atendimento desta empresa e respondo apenas sobre nossos serviços, produtos, horários e informações da loja. Como posso te ajudar?";
}

const OUT_OF_SCOPE_PATTERNS: Array<{ re: RegExp; allowedIfInContext?: RegExp }> = [
  {
    re: /\b(pesquis(a|ar|e)|busca(r)?|procur(a|ar|e)|consulta(r)?|olh(a|ar|e)|jog(a|ar|ue))\s+(no|na|pelo|pela)\s+(google|internet|web|bing|youtube|wikipedia|chat\s*gpt|chatgpt|gemini)\b/i
  },
  {
    re: /\b(escrev(a|er)|cri(a|ar|e)|fa[cz](a|er)|ger(a|ar|e)|mont(a|ar|e))\s+(um|uma)\s+(c[oó]digo|script|programa|fun[çc][aã]o|reda[çc][aã]o|poema|m[uú]sica|letra|hist[oó]ria|receita|resumo de livro)\b/i,
    allowedIfInContext: /\b(c[oó]digo|script|programa|reda[çc][aã]o|poema|m[uú]sica|receita)\b/i
  },
  {
    re: /\b(qual (?:[eé] )?a capital d[eao]|quem ganhou|quem descobriu|quem inventou|previs[aã]o do tempo|cota[çc][aã]o do d[oó]lar|me cont(a|e) uma piada|traduz(a|ir)\s+(?:isso\s+)?(?:para|pro)\s+(?:ingl[eê]s|espanhol|franc[eê]s|alem[aã]o))\b/i,
    allowedIfInContext: /\b(capital|previs[aã]o|d[oó]lar|tradu[çc][aã]o)\b/i
  }
];

/**
 * Detecta se a mensagem pede explicitamente pesquisa externa no Google/internet
 * ou tarefas gerais alheias as instrucoes/base de conhecimento do lojista.
 */
export function isOutOfScopeRequest(
  message: string,
  storeContext?: { storeName?: string; instructions?: string; storeInfo?: string }
): boolean {
  const norm = (message ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  if (!norm) return false;

  const contextText = `${storeContext?.storeName ?? ""}\n${storeContext?.instructions ?? ""}\n${storeContext?.storeInfo ?? ""}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  for (const rule of OUT_OF_SCOPE_PATTERNS) {
    if (rule.re.test(norm)) {
      if (rule.allowedIfInContext && rule.allowedIfInContext.test(contextText)) {
        continue;
      }
      return true;
    }
  }
  return false;
}
