/**
 * Seleção da Base de Conhecimento que entra no prompt da IA.
 *
 * Antes o contexto era montado só por `updated_at desc`: os 20 artigos mais
 * recentes, cortados em 2.000 caracteres cada e 6.000 no total. Isso tinha dois
 * efeitos ruins: (a) um preço no fim de um artigo longo desaparecia sem aviso e
 * (b) editar um artigo irrelevante empurrava os outros para fora do orçamento.
 *
 * Aqui a ordem é por relevância em relação à mensagem do cliente (BM25
 * simplificado, sem embeddings e sem dependência externa), com recência apenas
 * como desempate. O orçamento de caracteres continua o mesmo, mas agora é
 * distribuído para o que o cliente perguntou.
 */

export type KnowledgeArticle = {
  title?: string | null;
  body?: string | null;
  updated_at?: string | null;
};

export type KnowledgeSelection = {
  /** Texto pronto para o prompt, no formato "### titulo\ncorpo". */
  text: string;
  /** Quantos artigos entraram no prompt. */
  used: number;
  /** Quantos artigos publicados existiam. */
  total: number;
  /** Títulos que ficaram de fora (orçamento ou irrelevância). */
  skipped: string[];
  /** Títulos que entraram cortados. */
  truncated: string[];
};

export const ARTICLE_CHARS = 2000;
export const TOTAL_CHARS = 6000;

const STOPWORDS = new Set([
  "a", "o", "as", "os", "de", "da", "do", "das", "dos", "e", "ou", "que", "para", "pra",
  "com", "sem", "por", "no", "na", "nos", "nas", "um", "uma", "uns", "umas", "ao", "aos",
  "se", "me", "te", "eu", "voce", "voces", "ele", "ela", "isso", "isto", "aquilo", "tem",
  "ter", "sou", "ser", "esta", "estou", "foi", "sao", "mais", "menos", "muito", "como",
  "quanto", "quando", "onde", "qual", "quais", "quem", "meu", "minha", "seu", "sua",
  "aqui", "ai", "la", "ja", "nao", "sim", "oi", "ola", "bom", "boa", "dia", "tarde", "noite"
]);

/** Minúsculo, sem acento, só letras/números. */
export function normalizeForSearch(text: string): string {
  return (text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(text: string): string[] {
  return normalizeForSearch(text)
    .split(" ")
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

function matchesTerm(tokens: string[], term: string): boolean {
  return tokens.some((t) => t === term || t.startsWith(term) || term.startsWith(t));
}

/**
 * Pontuação de relevância: termo no título vale 4, no corpo vale 1.
 * Empate é resolvido pela ordem recebida (que já vem por updated_at desc).
 */
export function scoreArticle(article: KnowledgeArticle, queryTokens: string[]): number {
  if (queryTokens.length === 0) return 0;
  const titleTokens = tokenize(article.title ?? "");
  const bodyTokens = tokenize(article.body ?? "");
  let score = 0;
  for (const term of new Set(queryTokens)) {
    if (matchesTerm(titleTokens, term)) score += 4;
    else if (matchesTerm(bodyTokens, term)) score += 1;
  }
  return score;
}

/**
 * Escolhe e corta os artigos que entram no prompt.
 *
 * - `query` vazia mantém o comportamento antigo (ordem recebida, recência).
 * - Artigos com pontuação 0 só entram se sobrar orçamento, para o prompt nunca
 *   ficar sem contexto quando a pergunta é genérica ("oi", "bom dia").
 */
export function selectKnowledgeArticles(
  articles: KnowledgeArticle[] | null | undefined,
  query?: string,
  opts: { articleChars?: number; totalChars?: number } = {}
): KnowledgeSelection {
  const list = Array.isArray(articles) ? articles.filter((a) => a && (a.body ?? "").trim()) : [];
  const articleChars = opts.articleChars ?? ARTICLE_CHARS;
  const totalChars = opts.totalChars ?? TOTAL_CHARS;
  const queryTokens = tokenize(query ?? "");

  const ranked = list
    .map((article, index) => ({ article, index, score: scoreArticle(article, queryTokens) }))
    .sort((a, b) => (b.score - a.score) || (a.index - b.index));

  let budget = totalChars;
  const blocks: string[] = [];
  const skipped: string[] = [];
  const truncated: string[] = [];
  let used = 0;

  for (const { article } of ranked) {
    const title = (article.title ?? "Sem título").trim();
    const body = (article.body ?? "").trim();
    if (budget <= 0 || (used > 0 && budget < 24)) {
      skipped.push(title);
      continue;
    }
    const limite = Math.min(articleChars, budget);
    const cortado = body.length > limite;
    const trecho = cortado ? `${body.slice(0, limite).trimEnd()}...` : body;
    if (!trecho.trim()) {
      skipped.push(title);
      continue;
    }
    budget -= trecho.length;
    blocks.push(`### ${title}\n${trecho}`);
    used += 1;
    if (cortado) truncated.push(title);
  }

  return { text: blocks.join("\n\n"), used, total: list.length, skipped, truncated };
}
