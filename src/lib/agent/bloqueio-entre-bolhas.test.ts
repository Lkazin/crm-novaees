import { memoryAttendanceQuota } from "../crm/attendance-quota.fixture";
import { test } from "node:test";
import assert from "node:assert/strict";
import type { AgentConfig } from "./config";
import { processWebhook as processWebhookActual } from "./processor";

const processWebhook: typeof processWebhookActual = (payload, cfg, deps = {}) =>
  processWebhookActual(payload, cfg, {
    getStoreContext: async () => ({
      tenantId: "11111111-1111-4111-8111-111111111111",
      quotaLimit: 200,
      context: {},
    }),
    wait: async () => {},
    ...deps,
    quota: deps.quota || (deps.redis ? memoryAttendanceQuota(deps.redis as never) : undefined),
  });

const cfg: AgentConfig = {
  evolutionUrl: "http://localhost:8080",
  evolutionKey: "dummy",
  instance: "crmtest",
  webhookSecret: "x".repeat(40),
  redisUrl: "redis://localhost:6379",
  aiUrl: "http://localhost:3001/v1",
  aiKey: "dummy",
  aiModel: "demo",
  systemPrompt: "Horário de testes: 9h às 17h.",
  allowedNumber: "5511999998888",
  sendEnabled: true,
  sendFormat: "v2",
};

const payload = {
  event: "messages.upsert",
  instance: "crmtest",
  data: {
    key: { id: "unique1", remoteJid: "5511999998888@s.whatsapp.net", fromMe: false },
    message: { conversation: "Qual horário?" },
  },
};

function fakeRedis() {
  const keys = new Set<string>();
  const lists = new Map<string, string[]>();
  const kv = new Map<string, string>();
  return {
    exists: async (k: string) => Number(keys.has(k) || kv.has(k)),
    set: async (k: string, val?: string, _ex?: string, _ttl?: number, mode?: string) => {
      if (mode === "NX" && (keys.has(k) || kv.has(k))) return null;
      keys.add(k);
      if (val !== undefined) kv.set(k, String(val));
      return "OK";
    },
    get: async (k: string) => kv.get(k) ?? null,
    incr: async (k: string) => {
      const cur = parseInt(kv.get(k) || "0", 10) + 1;
      kv.set(k, String(cur));
      keys.add(k);
      return cur;
    },
    del: async (k: string) => {
      keys.delete(k);
      lists.delete(k);
      kv.delete(k);
      return 1;
    },
    rpush: async (k: string, v: string) => {
      const l = lists.get(k) || [];
      l.push(v);
      lists.set(k, l);
      return l.length;
    },
    lrange: async (k: string, start: number, stop: number) => {
      const l = lists.get(k) || [];
      return l.slice(start, stop === -1 ? undefined : stop + 1);
    },
    ltrim: async () => "OK",
    llen: async (k: string) => (lists.get(k) || []).length,
    expire: async () => 1,
    pttl: async () => 60000,
    sAdd: async () => 1,
    sRem: async () => 1,
  };
}

// A resposta precisa render mais de uma bolha para o teste valer.
const LONG_ANSWER =
  "Olá! Sim, trabalhamos de segunda a sexta das 9h às 18h e no sábado das 9h às 13h. " +
  "No domingo não abrimos. Se quiser, posso te passar o endereço completo da loja e o telefone fixo também. " +
  "Qualquer dúvida é só chamar, ficamos à disposição para ajudar no que precisar!";

test("B1: bloqueio do tenant entre a 1a e a 2a bolha interrompe a resposta", async () => {
  const db = fakeRedis();
  const sent: string[] = [];
  // Libera na checagem inicial e na pos-geracao; bloqueia na checagem entre bolhas.
  let checks = 0;

  const result = await processWebhook(payload, cfg, {
    redis: db as never,
    maySend: async () => {
      checks++;
      return checks <= 2;
    },
    generate: async () => LONG_ANSWER,
    send: async (_number: string, text: string) => {
      sent.push(text);
    },
  });

  // A 1a bolha saiu; a 2a foi barrada pela checagem entre bolhas.
  assert.equal(sent.length, 1, `esperava 1 bolha enviada, vieram ${sent.length}`);
  assert.ok(checks >= 3, `esperava checagem entre bolhas, houve ${checks}`);
  assert.equal(result.status, "sent");
});

test("B1: sem bloqueio, todas as bolhas saem normalmente", async () => {
  const db = fakeRedis();
  const sent: string[] = [];

  const result = await processWebhook(payload, cfg, {
    redis: db as never,
    maySend: async () => true,
    generate: async () => LONG_ANSWER,
    send: async (_number: string, text: string) => {
      sent.push(text);
    },
  });

  assert.ok(sent.length > 1, `esperava varias bolhas, veio ${sent.length}`);
  assert.equal(result.status, "sent");
});

test("B3: escalonamento nao envia quando o tenant esta bloqueado", async () => {
  const db = fakeRedis();
  const sent: string[] = [];
  let handoffs = 0;

  const result = await processWebhook(
    {
      ...payload,
      data: {
        ...payload.data,
        key: { ...payload.data.key, id: "unique-escalation" },
        message: { conversation: "Quero falar com um atendente humano agora, por favor" },
      },
    },
    cfg,
    {
      redis: db as never,
      // Bloqueado desde o inicio: o envio de escalonamento nao pode sair.
      maySend: async () => false,
      handoff: async () => {
        handoffs++;
        return "conv-1";
      },
      generate: async () => "Resposta que nao deve sair",
      send: async (_number: string, text: string) => {
        sent.push(text);
      },
    }
  );

  assert.equal(sent.length, 0, `nada deveria sair, saiu: ${sent.join(" | ")}`);
  assert.equal(result.status, "disabled");
  void handoffs;
});
