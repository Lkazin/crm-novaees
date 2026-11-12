import { test } from "node:test";
import assert from "node:assert/strict";
import {
  asksForHuman,
  asksForLink,
  auditAiReply,
  citesAnyUrl,
  clientAssertsPrice,
  extractBrlValues,
  extractUrls,
  findUnauthorizedPrices,
  findUnauthorizedUrls,
  mixesCatalogs
} from "./commercial-guard";

const BASE = `
PLANOS NOVAESWEB — SITE E CARDÁPIO VIRTUAL
1. ESSENCIAL — R$ 69/mês
2. AVANÇADO — R$ 99/mês
3. PREMIUM — R$ 159/mês

NOVAESWEB CRM IA — PLANOS E FRANQUIA
2. PREMIUM — R$ 89,90/mês
Recarga de 100 mensagens por R$ 20.
`;

test("extractUrls", () => {
  test("acha URL e remove pontuação final", () => {
    assert.deepEqual(extractUrls("Acesse https://novaesweb.com.br/planos."), [
      "https://novaesweb.com.br/planos"
    ]);
  });

  test("devolve vazio quando não há URL", () => {
    assert.deepEqual(extractUrls("sem link aqui"), []);
    assert.equal(citesAnyUrl("sem link aqui"), false);
  });
});

test("findUnauthorizedUrls", () => {
  test("sem lista oficial, qualquer URL é não autorizada", () => {
    assert.deepEqual(findUnauthorizedUrls("veja https://inventado.com/x"), [
      "https://inventado.com/x"
    ]);
  });

  test("URL oficial cadastrada passa", () => {
    const links = { contratacao: "https://novaesweb.com.br/assinar" };
    assert.deepEqual(findUnauthorizedUrls("link: https://novaesweb.com.br/assinar", links), []);
  });

  test("URL parecida mas de outro caminho é barrada", () => {
    const links = { contratacao: "https://novaesweb.com.br/assinar" };
    assert.deepEqual(
      findUnauthorizedUrls("link: https://novaesweb.com.br/assinar-premium", links)
    , ["https://novaesweb.com.br/assinar-premium"]);
  });

  test("domínio parecido (typo) é barrado", () => {
    const links = { contratacao: "https://novaesweb.com.br/assinar" };
    assert.deepEqual(findUnauthorizedUrls("https://novaesweb.com/assinar", links), [
      "https://novaesweb.com/assinar"
    ]);
  });
});

test("extractBrlValues / findUnauthorizedPrices", () => {
  test("lê valores em reais", () => {
    assert.deepEqual(extractBrlValues("R$ 89,90 e R$ 20 e R$ 1.200,00"), [89.9, 20, 1200]);
  });

  test("preço que está na base passa", () => {
    assert.deepEqual(findUnauthorizedPrices("O Premium é R$ 89,90/mês.", BASE), []);
  });

  test("preço inventado é barrado", () => {
    assert.deepEqual(findUnauthorizedPrices("Fazemos por R$ 49,90/mês.", BASE), [49.9]);
  });

  test("preço do cliente repetido pela IA é barrado", () => {
    assert.deepEqual(findUnauthorizedPrices("Como você disse, R$ 50,00.", BASE), [50]);
  });
});

test("mixesCatalogs", () => {
  test("detecta site + CRM na mesma resposta", () => {
    assert.deepEqual(
      mixesCatalogs("O plano de site é R$ 69 e o CRM tem 1.200 mensagens mensais.")
    , true);
  });

  test("só site não mistura", () => {
    assert.equal(mixesCatalogs("O plano Essencial de site custa R$ 69/mês."), false);
  });

  test("só CRM não mistura", () => {
    assert.equal(mixesCatalogs("O CRM Premium tem franquia de 1.200 mensagens."), false);
  });
});

test("clientAssertsPrice", () => {
  test("cliente afirmando preço é detectado", () => {
    assert.equal(clientAssertsPrice("ouvi dizer que é R$ 50 por mês"), true);
    assert.equal(clientAssertsPrice("meu amigo paga 30 reais"), true);
  });

  test("cliente só perguntando preço não é indução", () => {
    assert.equal(clientAssertsPrice("quanto custa o plano?"), false);
  });
});

test("asksForHuman / asksForLink", () => {
  test("reconhece pedido de humano", () => {
    assert.equal(asksForHuman("quero falar com um atendente"), true);
    assert.equal(asksForHuman("me passa para uma pessoa de verdade"), true);
  });

  test("reconhece pedido de link", () => {
    assert.equal(asksForLink("me manda o link para contratar"), true);
    assert.equal(asksForLink("onde eu assino?"), true);
  });
});

test("auditAiReply", () => {
  test("resposta limpa não tem violação", () => {
    assert.deepEqual(
      auditAiReply({
        reply: "O plano Premium do CRM IA custa R$ 89,90/mês com 1.200 mensagens.",
        allowedText: BASE
      }),
      []
    );
  });

  test("acumula as três violações", () => {
    const v = auditAiReply({
      reply:
        "O site Essencial é R$ 69 e o CRM é R$ 49,90 com 1.200 mensagens. Assine em https://novaesweb-oferta.com",
      allowedText: BASE
    });
    assert.ok(v.includes("unauthorized_url"));
    assert.ok(v.includes("unauthorized_price"));
    assert.ok(v.includes("mixed_catalogs"));
  });
});
