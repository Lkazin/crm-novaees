import { memoryAttendanceQuota } from "../crm/attendance-quota.fixture";
import { test } from "node:test";
import assert from "node:assert/strict";
import type { AgentConfig } from "./config";
import { processWebhook as processWebhookActual, getBrazilMonthKey } from "./processor";
import { EvolutionSendError } from "./evolution";

const processWebhook: typeof processWebhookActual = (payload,cfg,deps={}) => processWebhookActual(payload,cfg,{
 getStoreContext: async()=>({tenantId:"11111111-1111-4111-8111-111111111111",quotaLimit:200,context:{}}),
 ...deps, quota:deps.quota || (deps.redis ? memoryAttendanceQuota(deps.redis as never) : undefined)
});

const cfg: AgentConfig = {
  evolutionUrl: "http://localhost:8080", evolutionKey: "dummy", instance: "crmtest",
  webhookSecret: "x".repeat(40), redisUrl: "redis://localhost:6379",
  aiUrl: "http://localhost:3001/v1", aiKey: "dummy", aiModel: "demo",
  systemPrompt: "Horário de testes: 9h às 17h.", allowedNumber: "5511999998888",
  sendEnabled: true, sendFormat: "v2",
};
const payload = {
  event: "messages.upsert", instance: "crmtest",
  data: { key: { id: "unique1", remoteJid: "5511999998888@s.whatsapp.net", fromMe: false }, message: { conversation: "Qual horário?" } },
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
    del: async (k: string) => { keys.delete(k); lists.delete(k); kv.delete(k); return 1; },
    rpush: async (k: string, v: string) => {
      const l = lists.get(k) || [];
      l.push(v);
      lists.set(k, l);
      return l.length;
    },
    lrange: async (k: string) => {
      return lists.get(k) || [];
    },
    expire: async () => 1,
  };
}

test("período mensal da franquia vira à meia-noite de São Paulo, não à meia-noite UTC", () => {
  assert.equal(getBrazilMonthKey(new Date("2026-12-01T02:59:59Z")), "2026-11");
  assert.equal(getBrazilMonthKey(new Date("2026-12-01T03:00:00Z")), "2026-12");
});

test("disabled switch never connects or sends", async () => {
  assert.equal((await processWebhook(payload, { ...cfg, sendEnabled: false })).status, "disabled");
});

test("number not allowed rejected before Redis", async () => {
  assert.equal((await processWebhook({ ...payload, data: { ...payload.data, key: { ...payload.data.key, remoteJid: "5511888887777@s.whatsapp.net" } } }, cfg)).reason, "number_not_allowed");
});

test("single allowed message generates and sends exactly once", async () => {
  const db = fakeRedis(); let sends = 0;
  const deps = { redis: db as never, generate: async () => "Atendemos das 9h às 17h.", send: async () => { sends++; } };
  assert.equal((await processWebhook(payload, cfg, deps)).status, "sent");
  assert.equal((await processWebhook(payload, cfg, deps)).status, "duplicate");
  assert.equal(sends, 1);
});

test("confirmed send rejection releases lock and allows retry without charging quota on failure", async () => {
  const db = fakeRedis(); let calls = 0;
  const tenantId = "tenant-quota-test";
  const monthKey = getBrazilMonthKey(new Date("2026-11-07T12:00:00Z"));
  const deps = {
    redis: db as never,
    nowDate: new Date("2026-11-07T12:00:00Z"),
    getStoreContext: async () => ({ tenantId, quotaLimit: 200, isTrial: false, context: {} }),
    generate: async () => "Oi",
    send: async () => { calls++; if (calls === 1) throw new EvolutionSendError("HTTP 400", "rejected"); }
  };
  await assert.rejects(processWebhook(payload, cfg, deps));
  // Quota must still be 0 because send failed!
  assert.equal(await db.get(`crm:quota:${tenantId}:${monthKey}`), null);

  assert.equal((await processWebhook(payload, cfg, deps)).status, "sent");
  assert.equal(calls, 2);
  // Now quota is 1 after successful send
  assert.equal(await db.get(`crm:quota:${tenantId}:${monthKey}`), "1");
});

test("human takeover blocks sending before calling AI", async () => {
  const db = fakeRedis(); let generated = 0; let sent = 0;
  const result = await processWebhook(payload, cfg, {
    redis: db as never, maySend: async () => false,
    generate: async () => { generated++; return "Não deveria responder"; },
    send: async () => { sent++; }
  });
  assert.equal(result.status, "disabled");
  assert.equal(result.reason, "tenant_or_conversation_blocked");
  assert.equal(generated, 0);
  assert.equal(sent, 0);
});

test("handoff during AI generation blocks outbound message", async () => {
  const db = fakeRedis(); let permissionChecks = 0; let sent = 0;
  const result = await processWebhook(payload, cfg, {
    redis: db as never, maySend: async () => ++permissionChecks === 1,
    generate: async () => "Resposta descartada depois do atendimento humano",
    send: async () => { sent++; }
  });
  assert.equal(result.status, "disabled");
  assert.equal(permissionChecks, 2);
  assert.equal(sent, 0);
});

test("franquia por mensagem: humano e transferência isentos; cada resposta IA cobra, mesmo dentro de 24h; mês separado", async () => {
  const db = fakeRedis();
  const tenantId = "tenant-etapa6";
  const novDate = new Date("2026-11-15T14:00:00Z");
  const decDate = new Date("2026-12-01T14:00:00Z");
  const novKey = `crm:quota:${tenantId}:2026-11`;
  const decKey = `crm:quota:${tenantId}:2026-12`;

  // 1. Atendimento exclusivamente humano NÃO consome franquia de IA
  const humanRes = await processWebhook(
    { ...payload, data: { ...payload.data, key: { ...payload.data.key, id: "msg_human_1" } } },
    cfg,
    {
      redis: db as never,
      nowDate: novDate,
      getStoreContext: async () => ({ tenantId, quotaLimit: 200, isTrial: false, context: {} }),
      fetchConvContext: async () => ({ mode: "human", history: [], isFirstInteraction: false }),
      generate: async () => "Ok",
      send: async () => {}
    }
  );
  assert.equal(humanRes.status, "disabled");
  assert.equal(humanRes.reason, "conversation_in_human_mode");
  assert.equal(await db.get(novKey), null);

  // 2. Transferência antes da primeira resposta da IA NÃO consome franquia de IA
  const handoffRes = await processWebhook(
    {
      ...payload,
      data: {
        key: { id: "msg_esc_1", remoteJid: "5511999998888@s.whatsapp.net", fromMe: false },
        message: { conversation: "Quero falar com atendente humano agora" }
      }
    },
    cfg,
    {
      redis: db as never,
      nowDate: novDate,
      getStoreContext: async () => ({ tenantId, quotaLimit: 200, isTrial: false, context: {} }),
      fetchConvContext: async () => ({ mode: "ai", history: [], isFirstInteraction: true }),
      handoff: async () => "conv-123",
      generate: async () => "Ok",
      send: async () => {}
    }
  );
  assert.equal(handoffRes.status, "sent");
  assert.equal(await db.get(novKey), null);

  // 3. Primeiro atendimento efetivamente prestado pela IA consome 1 unidade
  const aiRes1 = await processWebhook(
    { ...payload, data: { ...payload.data, key: { ...payload.data.key, id: "msg_ai_1" } } },
    cfg,
    {
      redis: db as never,
      nowDate: novDate,
      getStoreContext: async () => ({ tenantId, quotaLimit: 200, isTrial: false, context: {} }),
      fetchConvContext: async () => ({ mode: "ai", history: [], isFirstInteraction: true }),
      generate: async () => "Olá! Nosso horário é das 9h às 18h.",
      send: async () => {}
    }
  );
  assert.equal(aiRes1.status, "sent");
  assert.equal(await db.get(novKey), "1");

  // 4. Outra resposta dentro de 24h consome mais uma unidade.
  const aiRes2 = await processWebhook(
    { ...payload, data: { ...payload.data, key: { ...payload.data.key, id: "msg_ai_2" } } },
    cfg,
    {
      redis: db as never,
      nowDate: novDate,
      getStoreContext: async () => ({ tenantId, quotaLimit: 200, isTrial: false, context: {} }),
      fetchConvContext: async () => ({ mode: "ai", history: [], isFirstInteraction: false }),
      generate: async () => "Temos entrega grátis!",
      send: async () => {}
    }
  );
  assert.equal(aiRes2.status, "sent");
  assert.equal(await db.get(novKey), "2");

  // 5. Expirar a janela anti-loop não altera a regra: outra resposta cobra +1.
  await db.del(`crm:session:${tenantId}:5511999998888`);
  const aiRes3 = await processWebhook(
    { ...payload, data: { ...payload.data, key: { ...payload.data.key, id: "msg_ai_3" } } },
    cfg,
    {
      redis: db as never,
      nowDate: novDate,
      getStoreContext: async () => ({ tenantId, quotaLimit: 200, isTrial: false, context: {} }),
      fetchConvContext: async () => ({ mode: "ai", history: [], isFirstInteraction: false }),
      generate: async () => "Bom dia novamente!",
      send: async () => {}
    }
  );
  assert.equal(aiRes3.status, "sent");
  assert.equal(await db.get(novKey), "3");

  // 6. Virada do mês inicia contador limpo no novo mês (2026-12)
  await db.del(`crm:session:${tenantId}:5511999998888`);
  const aiResDec = await processWebhook(
    { ...payload, data: { ...payload.data, key: { ...payload.data.key, id: "msg_ai_dec_1" } } },
    cfg,
    {
      redis: db as never,
      nowDate: decDate,
      getStoreContext: async () => ({ tenantId, quotaLimit: 200, isTrial: false, context: {} }),
      fetchConvContext: async () => ({ mode: "ai", history: [], isFirstInteraction: false }),
      generate: async () => "Feliz dezembro!",
      send: async () => {}
    }
  );
  assert.equal(aiResDec.status, "sent");
  assert.equal(await db.get(decKey), "1");
  assert.equal(await db.get(novKey), "3");
});

test("cinco respostas IA ao mesmo contato cobram cinco unidades e a sexta é bloqueada", async () => {
  const db = fakeRedis(); let sends = 0; let generations = 0;
  const deps = {
    redis: db as never, nowDate: new Date("2026-11-07T12:00:00Z"),
    getStoreContext: async () => ({ tenantId: "message-quota", quotaLimit: 5, context: {} }),
    generate: async () => { generations++; return "Resposta"; },
    send: async () => { sends++; }
  };
  for (let i = 1; i <= 5; i++) {
    const message = { ...payload, data: { ...payload.data, key: { ...payload.data.key, id: "per-message-" + i } } };
    assert.equal((await processWebhook(message, cfg, deps)).status, "sent");
    assert.equal(await db.get("crm:quota:message-quota:2026-11"), String(i));
  }
  const result = await processWebhook({ ...payload, data: { ...payload.data, key: { ...payload.data.key, id: "sixth" } } }, cfg, deps);
  assert.equal(result.reason, "quota_exceeded");
  assert.equal(generations, 5); assert.equal(sends, 5);
  // Loss of the Redis event marker does not send or charge a persisted event again.
  await db.del("crm:lab:done:crmtest:per-message-1");
  const duplicate = await processWebhook({ ...payload, data: { ...payload.data, key: { ...payload.data.key, id: "per-message-1" } } }, cfg, deps);
  assert.equal(duplicate.status, "duplicate"); assert.equal(sends, 5);
});

test("franquia grátis usa limite total de 100 mensagens e não renova na virada do mês", async () => {
  const db = fakeRedis(); let sends = 0;
  const deps = {
    redis: db as never,
    getStoreContext: async () => ({ tenantId: "trial-message-quota", quotaLimit: 100, quotaUsed: 99, quotaPeriod: "trial", isTrial: true, context: {} }),
    generate: async () => "Última mensagem grátis", send: async () => { sends++; }
  };
  assert.equal((await processWebhook(payload, cfg, { ...deps, nowDate: new Date("2026-11-30T23:00:00Z") })).status, "sent");
  assert.equal(await db.get("crm:quota:trial:trial-message-quota"), "100");
  const result = await processWebhook({ ...payload, data: { ...payload.data, key: { ...payload.data.key, id: "trial-next-month" } } }, cfg, { ...deps, nowDate: new Date("2026-12-02T12:00:00Z") });
  assert.equal(result.reason, "quota_exceeded"); assert.equal(sends, 1);
});

test("commit incerto após envio conserva reserva e bloqueia reenvio do mesmo evento", async () => {
  const db = fakeRedis(); let sends = 0;
  const base = memoryAttendanceQuota(db);
  const deps = { redis: db as never, quota: { ...base, commit: async () => { throw Error("commit_timeout"); } }, generate: async () => "Resposta", send: async () => { sends++; } };
  await assert.rejects(processWebhook(payload, cfg, deps), /commit_timeout/);
  await db.del("crm:lab:done:crmtest:unique1");
  const result = await processWebhook(payload, cfg, deps);
  assert.equal(result.reason, "message_busy"); assert.equal(sends, 1);
});

test("timeout ou falha de rede no envio mantém reserva sem cobrar nem reenviar automaticamente", async () => {
  const db = fakeRedis(); let sends = 0;
  const deps = { redis: db as never, nowDate: new Date("2026-11-07T12:00:00Z"), generate: async () => "Resposta", send: async () => { sends++; throw Error("network_timeout"); } };
  await assert.rejects(processWebhook(payload, cfg, deps), /network_timeout/);
  const result = await processWebhook(payload, cfg, deps);
  assert.equal(result.reason, "message_busy"); assert.equal(sends, 1);
  assert.equal(await db.get("crm:quota:11111111-1111-4111-8111-111111111111:2026-11"), null);
});

test("missing company context blocks generation, sending and quota access",async()=>{
 let generated=0,sent=0;
 const result=await processWebhookActual(payload,cfg,{getStoreContext:async()=>({}),generate:async()=>{generated++;return "No";},send:async()=>{sent++;}});
 assert.equal(result.reason,"store_context_unavailable");assert.equal(generated,0);assert.equal(sent,0);
});

test("envia indicador de presenca 'composing' (digitando...) antes de gerar a resposta", async () => {
  const db = fakeRedis();
  const presenceCalls: Array<{ number: string; presence: string }> = [];
  let generated = 0;
  let sent = 0;
  const deps = {
    redis: db as never,
    sendPresence: async (number: string, presence?: any) => {
      presenceCalls.push({ number, presence: presence || "composing" });
      return true;
    },
    generate: async () => {
      generated++;
      return "Resposta automatica";
    },
    send: async () => {
      sent++;
    }
  };
  const result = await processWebhook(payload, cfg, deps);
  assert.equal(result.status, "sent");
  assert.equal(presenceCalls.length, 1);
  assert.equal(presenceCalls[0].presence, "composing");
  assert.equal(presenceCalls[0].number, "5511999998888");
  assert.equal(generated, 1);
  assert.equal(sent, 1);
});
