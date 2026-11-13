// Quebra a resposta da IA em bolhas de WhatsApp, como uma pessoa de verdade faria.
//
// Por que: um atendente humano no WhatsApp manda "oi!" e depois "tudo bem?" — em
// duas bolhas separadas. A IA mandando um bloco de 3 paragrafos de uma vez e o
// maior sinal visual de robo que existe.
//
// Regras (conservadoras, para nao quebrar resposta boa):
//   * ate 2 bolhas por resposta (3 so quando a resposta e realmente longa)
//   * nunca quebra dentro de lista numerada, item de preco ou horario
//   * nunca quebra frase que comeca com conector ("e", "mas", "entao", "por isso")
//   * nunca deixa bolha com menos de 12 caracteres
//   * resposta curta (<= 120 chars) fica inteira: gente tambem manda uma bolha so

export const MAX_BUBBLES = 3;
const MIN_BUBBLE_CHARS = 12;
const SHORT_REPLY_CHARS = 220;
const LONG_REPLY_CHARS = 320;

const CONNECTORS = /^(e|mas|porém|porem|então|entao|por isso|só que|so que|porque|pois|já|ja|também|tambem|aliás|alias|ou seja)\b/i;
const LIST_ITEM = /^\s*(\d+[\.\)]|[-*•]|[a-z][\.\)]\s)/i;
const PRICE_OR_TIME = /(r\$|\d+[.,]\d{2}|^\d{1,2}[:h]\d{2})/i;

function isProtectedStart(text: string): boolean {
  const line = text.trim();
  return LIST_ITEM.test(line) || PRICE_OR_TIME.test(line);
}

/**
 * Divide um bloco de texto em sentencas, mantendo a pontuacao.
 * Quebra em ". ", "! ", "? ", e tambem em fim de linha.
 */
function splitSentences(block: string): string[] {
  const parts: string[] = [];
  let current = "";
  for (let i = 0; i < block.length; i++) {
    const ch = block[i];
    current += ch;
    const isEnd = ch === "." || ch === "!" || ch === "?" || ch === "\n";
    if (!isEnd) continue;
    const next = block[i + 1];
    const nextNext = block[i + 2];
    // "." dentro de numero (R$ 89.90) ou abreviacao nao encerra sentenca.
    if (ch === "." && /\d/.test(block[i - 1] ?? "") && /\d/.test(next ?? "")) continue;
    if (next === undefined || next === " " || next === "\n") {
      // Evita cortar em "..."
      if (ch === "." && nextNext === ".") continue;
      parts.push(current);
      current = "";
    }
  }
  if (current.trim()) parts.push(current);
  return parts.map(p => p.trim()).filter(Boolean);
}

/**
 * Decide em quantas bolhas dividir e devolve os textos prontos para envio.
 * Determinística e sem I/O: testavel.
 */
export function splitIntoBubbles(answer: string): string[] {
  const text = (answer || "").trim();
  if (!text) return [];
  if (text.length <= SHORT_REPLY_CHARS) return [text];

  const maxBubbles = text.length > LONG_REPLY_CHARS ? MAX_BUBBLES : 2;
  const blocks = text.split(/\n{2,}/).map(b => b.trim()).filter(Boolean);

  // Caso 1: a resposta ja tem paragrafos separados. Usa eles como bolhas.
  if (blocks.length >= 2 && blocks.length <= maxBubbles) {
    const usable = blocks.every(b => b.length >= MIN_BUBBLE_CHARS);
    if (usable) return blocks;
  }

  // Caso 2: um bloco unico (ou paragrafos demais). Divide por sentencas e
  // agrupa em bolhas equilibradas, sem cortar no meio de uma lista.
  const sentences = splitSentences(text);
  if (sentences.length < 2) return [text];

  const targetCount = Math.min(maxBubbles, sentences.length);
  const bubbles: string[] = [];
  let buffer = "";

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const remaining = sentences.length - i;
    const bubblesLeft = targetCount - bubbles.length;
    const mustFlush = remaining <= bubblesLeft && buffer.trim().length > 0;

    if (mustFlush) {
      bubbles.push(buffer.trim());
      buffer = "";
    }

    // Nao comeca bolha nova com conector: ele continua o raciocinio anterior.
    if (!buffer && bubbles.length > 0 && CONNECTORS.test(sentence)) {
      buffer = sentence;
      continue;
    }

    buffer = buffer ? `${buffer} ${sentence}` : sentence;

    // Fecha a bolha quando ela ja tem corpo suficiente e ainda cabem mais bolhas.
    if (
      buffer.length >= MIN_BUBBLE_CHARS * 4 &&
      bubbles.length < targetCount - 1 &&
      remaining > 1 &&
      !isProtectedStart(sentences[i + 1] ?? "")
    ) {
      bubbles.push(buffer.trim());
      buffer = "";
    }
  }

  if (buffer.trim()) bubbles.push(buffer.trim());

  // Bolha final curta demais (ex.: "Ok.") volta para a anterior.
  if (bubbles.length > 1 && bubbles[bubbles.length - 1].length < MIN_BUBBLE_CHARS) {
    const last = bubbles.pop()!;
    bubbles[bubbles.length - 1] = `${bubbles[bubbles.length - 1]} ${last}`.trim();
  }

  // Garantia final: nenhuma bolha abre com conector. Se alguma abrir, ela e
  // grudada na anterior — legibilidade humana vale mais que o tamanho ideal.
  const fixed: string[] = [];
  for (const bubble of bubbles) {
    if (fixed.length > 0 && CONNECTORS.test(bubble)) {
      fixed[fixed.length - 1] = `${fixed[fixed.length - 1]} ${bubble}`.trim();
    } else {
      fixed.push(bubble);
    }
  }

  // Se a divisao produziu algo degenerado, devolve o texto original intacto.
  if (fixed.length < 2 || fixed.some(b => b.length < MIN_BUBBLE_CHARS)) return [text];
  return fixed;
}

/**
 * Pausa entre bolhas: proporcional ao tamanho da proxima, como quem esta
 * digitando. Entre 900ms e 4s.
 */
export function bubbleDelayMs(nextBubble: string): number {
  const chars = (nextBubble || "").trim().length;
  return Math.max(900, Math.min(4000, Math.round(chars * 18)));
}
