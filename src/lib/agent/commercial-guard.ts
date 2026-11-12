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
    const inteiro = m[1].replace(/\./g, "");
    const centavos = m[2] ?? "00";
    const n = Number(`${inteiro}.${centavos}`);
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
 */
export function mixesCatalogs(text: string): boolean {
  const t = text.toLowerCase();
  const site = /\b(site|sites|card[aá]pio virtual|card[aá]pio digital)\b/.test(t);
  const crm = /\b(crm|franquia|mensagens mensais|whatsapps conectados|operadores)\b/.test(t);
  return site && crm;
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
}): CommercialViolation[] {
  const out: CommercialViolation[] = [];
  if (findUnauthorizedUrls(params.reply, params.officialLinks).length > 0) {
    out.push("unauthorized_url");
  }
  if (findUnauthorizedPrices(params.reply, params.allowedText).length > 0) {
    out.push("unauthorized_price");
  }
  if (mixesCatalogs(params.reply)) {
    out.push("mixed_catalogs");
  }
  return out;
}
