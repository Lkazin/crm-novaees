import test from "node:test";
import assert from "node:assert/strict";
import { splitIntoBubbles, bubbleDelayMs, MAX_BUBBLES } from "./bubbles";

test("resposta curta fica numa bolha so: gente tambem manda uma mensagem curta", () => {
  const r = splitIntoBubbles("Oi! Tudo bem? Como posso ajudar?");
  assert.equal(r.length, 1);
});

test("texto vazio nao gera bolha nenhuma", () => {
  assert.deepEqual(splitIntoBubbles("   "), []);
  assert.deepEqual(splitIntoBubbles(""), []);
});

test("paragrafos separados viram bolhas separadas", () => {
  const text =
    "Claro, eu te ajudo com isso agora mesmo sem nenhum problema!\n\n" +
    "O valor do site institucional fica em R$ 2.500,00 e inclui ate 5 paginas com dominio proprio.";
  const r = splitIntoBubbles(text);
  assert.equal(r.length, 2);
  assert.match(r[0], /te ajudo/);
  assert.match(r[1], /R\$ 2\.500,00/);
});

test("resposta longa em bloco unico e dividida em sentencas coerentes", () => {
  const text =
    "Oi Lucas, tudo bem? O site institucional inclui ate cinco paginas, dominio proprio e hospedagem por um ano. " +
    "A entrega fica em torno de dez dias uteis depois da aprovacao do layout. " +
    "Voce prefere que eu ja monte uma proposta com prazo e valor fechado?";
  const r = splitIntoBubbles(text);
  assert.ok(r.length >= 2 && r.length <= MAX_BUBBLES, `esperava 2-3 bolhas, veio ${r.length}`);
  // Nenhuma palavra foi perdida na divisao.
  const joined = r.join(" ").replace(/\s+/g, " ");
  assert.equal(joined, text.replace(/\s+/g, " "));
});

test("nunca comeca bolha com conector: 'e', 'mas', 'entao' nunca abrem mensagem", () => {
  const text =
    "O prazo de entrega e de dez dias uteis depois da aprovacao do layout do site. " +
    "E o pagamento pode ser feito em duas vezes sem juros no cartao. " +
    "Mas se preferir pix a gente da um desconto especial para voce fechar agora.";
  const r = splitIntoBubbles(text);
  for (const bubble of r) {
    assert.doesNotMatch(bubble, /^(E|Mas|Então|Entao)\s/, `bolha comecou com conector: ${bubble}`);
  }
  // E nenhuma palavra pode ter sido perdida ao reposicionar os conectores.
  assert.equal(r.join(" ").replace(/\s+/g, " "), text.replace(/\s+/g, " "));
});

test("nao quebra no meio de preco com virgula ou ponto", () => {
  const text =
    "O plano premium custa R$ 89,90 por mes e ja vem com todas as funcoes liberadas para voce. " +
    "A recarga de mensagens extras custa R$ 20,00 a cada cem respostas de inteligencia artificial.";
  const r = splitIntoBubbles(text);
  for (const bubble of r) {
    assert.doesNotMatch(bubble, /R\$\s*$/);
    assert.doesNotMatch(bubble, /R\$\s*\d+$/);
  }
});

test("bolha final muito curta e absorvida pela anterior", () => {
  const text =
    "O atendimento funciona de segunda a sexta das oito da manha as seis da tarde, sempre no horario de Brasilia. " +
    "Ok.";
  const r = splitIntoBubbles(text);
  assert.equal(r.length, 1);
});

test("resposta com lista numerada nao e cortada no meio da lista", () => {
  const text =
    "Deixa eu te explicar como funciona o processo completo de criacao do seu site institucional:\n\n" +
    "1. Reuniao de briefing para entender o seu negocio\n" +
    "2. Criacao do layout e aprovacao\n" +
    "3. Desenvolvimento e publicacao";
  const r = splitIntoBubbles(text);
  const joined = r.join("\n");
  // Cada item da lista continua inteiro em alguma bolha.
  assert.match(joined, /1\. Reuniao de briefing/);
  assert.match(joined, /2\. Criacao do layout/);
  assert.match(joined, /3\. Desenvolvimento/);
});

test("pausa entre bolhas cresce com o tamanho e fica entre 900ms e 4s", () => {
  assert.equal(bubbleDelayMs("oi"), 900);
  assert.equal(bubbleDelayMs("a".repeat(100)), 1800);
  assert.equal(bubbleDelayMs("a".repeat(1000)), 4000);
});
