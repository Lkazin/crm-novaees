import { test } from "node:test";
import assert from "node:assert/strict";
import { generateAnswer, buildSystemPrompt } from "./ai";
import type { AiConfig } from "./config";

const cfg: AiConfig = { aiUrl: "http://localhost:20128/v1", aiKey: "secret-hidden",
  aiModel: "route1", systemPrompt: "Horario confirmado: nao definido." };
test("uses explicitly configured fallback model on 429, never sends or exposes credentials", async () => {
  const old = process.env.AI_FALLBACK_MODELS;
  const previous = globalThis.fetch;
  const called: string[] = [];
  process.env.AI_FALLBACK_MODELS = "route2";
  globalThis.fetch = (async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { model: string };
    called.push(body.model);
    if (body.model === "route1") return new Response("limite", { status: 429 });
    return Response.json({ choices: [{ message: { content: "Atendimento pronto." } }] });
  }) as typeof fetch;
  try {
    assert.equal(await generateAnswer("Ola", cfg, {allowFallback:true}), "Atendimento pronto.");
    assert.deepEqual(called, ["route1", "route2"]);
  } finally {
    globalThis.fetch = previous;
    if (old === undefined) delete process.env.AI_FALLBACK_MODELS;
    else process.env.AI_FALLBACK_MODELS = old;
  }
});
test("does not fallback on unauthorized key", async () => {
  const old = process.env.AI_FALLBACK_MODELS;
  const previous = globalThis.fetch;
  let calls = 0;
  process.env.AI_FALLBACK_MODELS = "route2";
  globalThis.fetch = (async () => { calls++; return new Response("auth", { status: 401 }); }) as typeof fetch;
  try {
    await assert.rejects(generateAnswer("Ola", cfg), /401/);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = previous;
    if (old === undefined) delete process.env.AI_FALLBACK_MODELS;
    else process.env.AI_FALLBACK_MODELS = old;
  }
});

test("Start never tries fallback even when the environment advertises other models", async () => {
  const old = globalThis.fetch;
  const models: string[] = [];
  globalThis.fetch = async (_url, init) => {
    models.push(JSON.parse(String(init?.body)).model);
    return new Response("unavailable", { status: 429 });
  };
  try {
    await assert.rejects(generateAnswer("Oi", cfg, { allowFallback: false, fallbackModel: "route2" }));
    assert.deepEqual(models, ["route1"]);
  } finally {
    globalThis.fetch = old;
  }
});

test("Etapa 1: conversa ativa com histórico resgata tópico e instrui não reiniciar saudações", () => {
  const prompt = buildSystemPrompt({
    storeName: "NovaesWeb Loja",
    agentLabel: "Atendente Virtual",
    history: [
      { role: "user", content: "Quero conhecer o sistema de delivery." },
      { role: "assistant", content: "Claro! Você prefere o plano Business ou o Premium?" }
    ]
  });

  // Não pode tratar como primeira mensagem
  assert.equal(prompt.includes("PRIMEIRA MENSAGEM:"), false);
  // Deve conter instruções claras de resgate ativo de tópico
  assert.equal(prompt.includes("CONVERSA ATIVA EM ANDAMENTO"), true);
  assert.equal(prompt.includes("RESGATE DE TÓPICO"), true);
  assert.equal(prompt.includes("NUNCA repita apresentações"), true);
  assert.equal(prompt.includes("A gente tava falando dos planos de delivery"), true);
});

test("Etapa 2: retorno após conversa encerrada orienta saudação cordial de boas-vindas de volta", () => {
  const prompt = buildSystemPrompt({
    storeName: "NovaesWeb Loja",
    agentLabel: "Atendente Virtual",
    isReturningAfterClosed: true,
    history: [
      { role: "user", content: "Qual o horário de ontem?" },
      { role: "assistant", content: "Ontem funcionamos até as 18h." }
    ]
  });

  assert.equal(prompt.includes("RETORNO APÓS ATENDIMENTO ENCERRADO"), true);
  assert.equal(prompt.includes("Bem-vindo(a) de volta! Como posso te ajudar hoje?"), true);
  // Não pode mandar resgatar como se estivesse no meio da conversa
  assert.equal(prompt.includes("CONVERSA ATIVA EM ANDAMENTO"), false);
});

test("Etapa 3 & 7: mudança fluida de assunto e regra anti-alucinação de pedidos", () => {
  const prompt = buildSystemPrompt({
    storeName: "NovaesWeb Loja",
    agentLabel: "Atendente Virtual"
  });

  // Etapa 7: Mudança de assunto
  assert.equal(prompt.includes("MUDANÇA FLUIDA DE ASSUNTO"), true);
  assert.equal(prompt.includes("ACOMPANHE a mudança de assunto IMEDIATAMENTE"), true);
  assert.equal(prompt.includes("NUNCA obrigue o cliente a terminar formalmente o assunto anterior"), true);

  // Etapa 3: Reconhecimento de conclusão e anti-alucinação
  assert.equal(prompt.includes("RECONHECIMENTO DE CONCLUSÃO"), true);
  assert.equal(prompt.includes("REGRA DE OURO ANTI-ALUCINAÇÃO DE PEDIDOS"), true);
  assert.equal(prompt.includes("Demonstração de interesse comercial NÃO é compra"), true);
  assert.equal(prompt.includes("NUNCA invente ou afirme \"Seu pedido foi confirmado!\""), true);
});
