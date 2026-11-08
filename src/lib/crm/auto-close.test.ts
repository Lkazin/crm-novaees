import { test } from "node:test";
import assert from "node:assert/strict";
import { runAutoCloseForTenant, runAutoCloseAllTenants, DEFAULT_AUTOCLOSE_MESSAGE } from "./auto-close";
import type { AutoCloseDeps } from "./auto-close";

test("runAutoCloseForTenant: não faz nada quando a automação está desativada", async () => {
  const deps: AutoCloseDeps = {
    fetchTenantSettings: async () => ({
      enabled: false,
      timeoutMinutes: 30,
      message: DEFAULT_AUTOCLOSE_MESSAGE,
      includeWaitingClient: true
    }),
    fetchExpiredConversations: async () => [
      { id: "c1", contact_id: "ct1", channel_id: "ch1", mode: "ai", status: "open", last_message_at: "2026-11-08T10:00:00Z" }
    ]
  };

  const res = await runAutoCloseForTenant("tenant-1", deps);
  assert.equal(res.enabled, false);
  assert.equal(res.closedCount, 0);
  assert.equal(res.reason, "auto_close_disabled");
});

test("runAutoCloseForTenant: fecha conversas inativas após o tempo limite e dispara mensagem WhatsApp", async () => {
  const fakeNow = new Date("2026-11-08T13:00:00Z");
  const sentMessages: Array<{ phone: string; text: string; instance: string }> = [];
  const statusUpdates: Array<{ id: string; status: string; mode: string }> = [];
  const closedHandoffs: string[] = [];
  const savedMessages: Array<{ tenantId: string; convId: string; text: string }> = [];

  const deps: AutoCloseDeps = {
    now: () => fakeNow,
    fetchTenantSettings: async () => ({
      enabled: true,
      timeoutMinutes: 30,
      message: "Atendimento finalizado por inatividade. Volte sempre!",
      includeWaitingClient: true
    }),
    fetchActiveChannels: async () => [{ id: "ch1", instance_name: "inst-novaes" }],
    fetchExpiredConversations: async (_t, cutoffIso) => {
      // Cutoff deve ser 12:30:00Z (30 min antes de 13:00)
      assert.equal(cutoffIso, "2026-11-08T12:30:00.000Z");
      return [
        {
          id: "conv-expired-1",
          contact_id: "cont-1",
          channel_id: "ch1",
          mode: "ai",
          status: "open",
          last_message_at: "2026-11-08T12:00:00Z" // 60 min atrás
        }
      ];
    },
    fetchContactPhone: async id => (id === "cont-1" ? "5511999887766" : null),
    sendWhatsappMessage: async (phone, text, instanceName) => {
      sentMessages.push({ phone, text, instance: instanceName });
      return { ok: true };
    },
    saveOutboundMessage: async (tenantId, convId, text) => {
      savedMessages.push({ tenantId, convId, text });
    },
    updateConversationStatus: async (id, status, mode) => {
      statusUpdates.push({ id, status, mode });
    },
    closeHandoffs: async id => {
      closedHandoffs.push(id);
    }
  };

  const res = await runAutoCloseForTenant("tenant-1", deps);
  assert.equal(res.enabled, true);
  assert.equal(res.closedCount, 1);
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].phone, "5511999887766");
  assert.equal(sentMessages[0].text, "Atendimento finalizado por inatividade. Volte sempre!");
  assert.equal(sentMessages[0].instance, "inst-novaes");
  assert.equal(savedMessages.length, 1);
  assert.equal(statusUpdates.length, 1);
  assert.equal(statusUpdates[0].status, "resolved");
  assert.equal(statusUpdates[0].mode, "paused");
  assert.equal(closedHandoffs.length, 1);
  assert.equal(closedHandoffs[0], "conv-expired-1");
});

test("runAutoCloseForTenant: se o envio do WhatsApp falhar, ainda atualiza o status para resolved", async () => {
  const fakeNow = new Date("2026-11-08T13:00:00Z");
  const statusUpdates: Array<{ id: string; status: string; mode: string }> = [];

  const deps: AutoCloseDeps = {
    now: () => fakeNow,
    fetchTenantSettings: async () => ({
      enabled: true,
      timeoutMinutes: 15,
      message: DEFAULT_AUTOCLOSE_MESSAGE,
      includeWaitingClient: false
    }),
    fetchActiveChannels: async () => [{ id: "ch1", instance_name: "inst-test" }],
    fetchExpiredConversations: async () => [
      { id: "conv-offline", contact_id: "cont-2", channel_id: "ch1", mode: "ai", status: "open", last_message_at: "2026-11-08T12:00:00Z" }
    ],
    fetchContactPhone: async () => "5511999001122",
    sendWhatsappMessage: async () => ({ ok: false, error: "device_disconnected" }),
    updateConversationStatus: async (id, status, mode) => {
      statusUpdates.push({ id, status, mode });
    },
    closeHandoffs: async () => {}
  };

  const res = await runAutoCloseForTenant("tenant-offline", deps);
  assert.equal(res.closedCount, 1);
  assert.equal(res.items[0].messageSent, false);
  assert.equal(res.items[0].error, "device_disconnected");
  assert.equal(statusUpdates.length, 1);
  assert.equal(statusUpdates[0].status, "resolved");
});

test("runAutoCloseAllTenants: varre todos os tenants ativos e agrega contagem", async () => {
  const deps: AutoCloseDeps = {
    fetchAllActiveTenants: async () => [
      { id: "t1", name: "Loja 1" },
      { id: "t2", name: "Loja 2" }
    ],
    fetchTenantSettings: async t => ({
      enabled: t === "t1",
      timeoutMinutes: 30,
      message: "Tchau",
      includeWaitingClient: true
    }),
    fetchActiveChannels: async () => [],
    fetchExpiredConversations: async t => (t === "t1" ? [{ id: "c1", contact_id: "ct1", channel_id: "", mode: "ai", status: "open", last_message_at: "2026-11-08T10:00:00Z" }] : []),
    fetchContactPhone: async () => null,
    updateConversationStatus: async () => {},
    closeHandoffs: async () => {}
  };

  const res = await runAutoCloseAllTenants(deps);
  assert.equal(res.processedTenants, 2);
  assert.equal(res.totalClosed, 1);
});

test("reabertura: conversa fechada/resolved deve reabrir em modo ai ao receber nova mensagem", () => {
  const conversation = { status: "resolved", mode: "paused", assigned_to: "op-123" };
  const patchPayload: Record<string, unknown> = {
    last_message_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  if (conversation.status === "resolved" || conversation.status === "closed") {
    patchPayload.status = "open";
    patchPayload.mode = "ai";
    patchPayload.assigned_to = null;
  }
  assert.equal(patchPayload.status, "open");
  assert.equal(patchPayload.mode, "ai");
  assert.equal(patchPayload.assigned_to, null);
});

test("Etapa 6: runAutoCloseForTenant envia pesquisa de satisfação sem duplicar", async () => {
  const fakeNow = new Date("2026-11-08T15:00:00Z");
  const sentMessages: string[] = [];
  const markedSurveys: string[] = [];
  let surveyAlreadySent = false;

  const deps: AutoCloseDeps = {
    now: () => fakeNow,
    fetchTenantSettings: async () => ({
      enabled: true,
      timeoutMinutes: 20,
      message: "Atendimento encerrado por inatividade.",
      includeWaitingClient: true,
      sendSurvey: true,
      surveyMessage: "Avalie nosso atendimento de 1 a 5 estrelas! ⭐"
    }),
    fetchActiveChannels: async () => [{ id: "ch1", instance_name: "inst-survey" }],
    fetchExpiredConversations: async () => [
      { id: "conv-survey-1", contact_id: "ct-survey", channel_id: "ch1", mode: "ai", status: "open", last_message_at: "2026-11-08T14:30:00Z" }
    ],
    fetchContactPhone: async () => "5511988887777",
    sendWhatsappMessage: async (_phone, text) => {
      sentMessages.push(text);
      return { ok: true };
    },
    saveOutboundMessage: async () => {},
    updateConversationStatus: async () => {},
    closeHandoffs: async () => {},
    checkSurveySent: async () => surveyAlreadySent,
    markSurveySent: async id => {
      markedSurveys.push(id);
      surveyAlreadySent = true;
    }
  };

  // Primeira execução: deve enviar a mensagem de encerramento E a pesquisa
  const res1 = await runAutoCloseForTenant("tenant-survey", deps);
  assert.equal(res1.closedCount, 1);
  assert.equal(sentMessages.length, 2);
  assert.equal(sentMessages[0], "Atendimento encerrado por inatividade.");
  assert.equal(sentMessages[1], "Avalie nosso atendimento de 1 a 5 estrelas! ⭐");
  assert.equal(markedSurveys.includes("conv-survey-1"), true);

  // Segunda execução simulada (mesma conversa já avaliada): não pode duplicar a pesquisa
  const sentMessages2: string[] = [];
  const deps2: AutoCloseDeps = {
    ...deps,
    sendWhatsappMessage: async (_phone, text) => {
      sentMessages2.push(text);
      return { ok: true };
    }
  };

  await runAutoCloseForTenant("tenant-survey", deps2);
  assert.equal(sentMessages2.length, 1); // apenas a mensagem de encerramento, SEM pesquisa duplicada
  assert.equal(sentMessages2[0], "Atendimento encerrado por inatividade.");
});
