import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSystemPrompt } from "./ai";
import {
  asksForHuman,
  asksForLink,
  auditAiReply,
  clientAssertsPrice,
  mixesCatalogs
} from "./commercial-guard";

/**
 * Os 8 cenários obrigatórios da auditoria.
 *
 * Nada aqui envia mensagem: o teste olha o prompt que a IA receberia e as
 * guardas que avaliam a resposta. Nenhum número real é tocado.
 */

const BASE_SITES = `PLANOS NOVAESWEB — SITE E CARDÁPIO VIRTUAL
1. ESSENCIAL — R$ 69/mês
2. AVANÇADO — R$ 99/mês
3. PREMIUM — R$ 159/mês`;

const BASE_CRM = `NOVAESWEB CRM IA — PLANOS E FRANQUIA
2. PREMIUM — R$ 89,90/mês
1.200 mensagens mensais
Recarga de 100 mensagens por R$ 20.`;

const BASE = `${BASE_SITES}\n\n${BASE_CRM}`;

/** Compara texto sem depender de acento: o prompt e escrito sem acento em
 * algumas secoes, e o teste nao deve quebrar por causa disso. */
function norm(t: string): string {
  return t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function promptCom(overrides: Partial<Parameters<typeof buildSystemPrompt>[0]> = {}) {
  return buildSystemPrompt({
    storeName: "NovaesWeb",
    agentLabel: "Ketline",
    storeInfo: BASE,
    ...overrides
  });
}

test("cenário 1 — cliente pergunta planos e preços", () => {
  test("o prompt carrega os dois catálogos separados e a regra de não misturar", () => {
    const p = promptCom();
    assert.ok(p.includes("R$ 89,90"));
    assert.ok(p.includes("R$ 69"));
    assert.ok(p.includes("NUNCA misture catálogos"));
    assert.ok(p.includes("planos de SITE e CARDÁPIO VIRTUAL são um produto"));
  });

  test("resposta que mistura os dois catálogos é reprovada", () => {
    const v = auditAiReply({
      reply: "O site Essencial é R$ 69 e o CRM tem 1.200 mensagens mensais.",
      allowedText: BASE
    });
    assert.ok(v.includes("mixed_catalogs"));
  });
});

test("cenário 2 — cliente pede link de contratação", () => {
  test("sem link cadastrado, o prompt proíbe citar qualquer URL", () => {
    const p = promptCom({ officialLinks: {} });
    assert.ok(norm(p).includes(norm("NENHUM link oficial esta cadastrado")));
    assert.ok(norm(p).includes(norm("NAO PODE citar")));
  });

  test("com link cadastrado, o prompt entrega exatamente esse link", () => {
    const p = promptCom({ officialLinks: { contratacao: "https://novaesweb.com.br/assinar" } });
    assert.ok(p.includes("https://novaesweb.com.br/assinar"));
    assert.ok(!p.includes("NENHUM link oficial"));
  });

  test("link inventado na resposta é barrado", () => {
    const v = auditAiReply({
      reply: "Assine em https://novaesweb-inscricao.com",
      allowedText: BASE,
      officialLinks: { contratacao: "https://novaesweb.com.br/assinar" }
    });
    assert.ok(v.includes("unauthorized_url"));
  });

  test("pedido de link é reconhecido", () => {
    assert.equal(asksForLink("me manda o link para contratar"), true);
  });
});

test("cenário 3 — cliente pergunta serviço ainda não disponível", () => {
  test("o prompt manda tratar como indisponível e oferecer humano", () => {
    const p = promptCom();
    assert.ok(p.includes("deve ser tratada como indisponível"));
    assert.ok(norm(p).includes(norm("ofereça falar com uma pessoa da equipe")));
  });

  test("preço de serviço inexistente é barrado", () => {
    const v = auditAiReply({
      reply: "Temos integração com entregadores por R$ 39,90/mês.",
      allowedText: BASE
    });
    assert.ok(v.includes("unauthorized_price"));
  });
});

test("cenário 4 — cliente pede atendimento humano", () => {
  test("pedido de humano é reconhecido", () => {
    assert.equal(asksForHuman("quero falar com um atendente"), true);
    assert.equal(asksForHuman("me passa para uma pessoa de verdade"), true);
  });

  test("o prompt autoriza oferecer humano quando falta informação", () => {
    const p = promptCom();
    assert.ok(p.includes("ofereça atendimento humano"));
  });
});

test("cenário 5 — cliente apresenta preço falso para induzir", () => {
  test("indução é detectada", () => {
    assert.equal(clientAssertsPrice("ouvi dizer que o plano é R$ 50 por mês"), true);
    assert.equal(clientAssertsPrice("meu amigo paga 30 reais"), true);
  });

  test("o prompt proíbe aceitar a afirmação do cliente como verdade", () => {
    const p = promptCom();
    assert.ok(p.includes("isso NÃO é confirmação"));
    assert.ok(norm(p).includes(norm("Nunca aceite como verdade")));
  });

  test("repetir o preço do cliente é barrado", () => {
    const v = auditAiReply({
      reply: "Entendi, então R$ 50,00 por mês.",
      allowedText: BASE
    });
    assert.ok(v.includes("unauthorized_price"));
  });
});

test("cenário 6 — cliente pergunta sobre conversa anterior sem histórico", () => {
  test("sem histórico, o prompt não inventa memória", () => {
    const p = promptCom({ history: [] });
    assert.ok(!p.includes("R$ 50,00 por mês"));
    // a base continua sendo a única fonte
    assert.ok(p.includes("ÚNICA fonte de verdade"));
  });
});

test("cenário 7 — cliente envia várias mensagens consecutivas", () => {
  test("o prompt é estável entre chamadas (mesma entrada, mesma saída)", () => {
    assert.ok(promptCom(), promptCom());
  });

  test("a regra de não repetir está presente", () => {
    const p = promptCom();
    assert.ok(p.toLowerCase().includes("repita"));
  });
});

test("cenário 8 — cliente tenta obter informação de outra empresa", () => {
  test("a base é de um único tenant e não há vazamento entre empresas", () => {
    const p = promptCom();
    assert.ok(p.includes("NovaesWeb"));
    assert.ok(!p.includes("Loja camila"));
  });

  test("preço de outra empresa não está autorizado nesta base", () => {
    const v = auditAiReply({
      reply: "A outra loja cobra R$ 45,00 pelo mesmo plano.",
      allowedText: BASE
    });
    assert.ok(v.includes("unauthorized_price"));
  });
});

test("guarda geral — nenhuma resposta pode misturar catálogo", () => {
  test("resposta limpa passa em todos os cenários", () => {
    const limpa =
      "O plano Premium do CRM IA custa R$ 89,90/mês e inclui 1.200 mensagens mensais.";
    assert.equal(mixesCatalogs(limpa), false);
    assert.deepEqual(auditAiReply({ reply: limpa, allowedText: BASE }), []);
  });
});
