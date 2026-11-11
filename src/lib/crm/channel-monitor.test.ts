import test from "node:test";
import assert from "node:assert/strict";
import { decideAlerts, buildAlertMessage, type ChannelRow, type AlertStateRow } from "./channel-monitor";

const channel = (over: Partial<ChannelRow> = {}): ChannelRow => ({
  id: "ch-1",
  tenant_id: "t-1",
  instance_name: "novaesweb-ia-teste",
  status: "connected",
  ...over
});

const state = (over: Partial<AlertStateRow> = {}): AlertStateRow => ({
  tenant_id: "t-1",
  channel_id: "ch-1",
  instance_name: "novaesweb-ia-teste",
  last_status: "connected",
  last_alert_at: null,
  last_alert_kind: null,
  consecutive_failures: 0,
  ...over
});

test("canal conectado que cai gera alerta 'down' imediato", () => {
  const { alerts, updates } = decideAlerts({
    channels: [channel()],
    states: new Map([["novaesweb-ia-teste", "close"]]),
    alertStates: [state()]
  });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].kind, "down");
  assert.equal(alerts[0].currentStatus, "close");
  assert.deepEqual(updates, [{ channelId: "ch-1", tenantId: "t-1", status: "close" }]);
});

test("canal que continua conectado nao gera alerta nenhum", () => {
  const { alerts, updates } = decideAlerts({
    channels: [channel()],
    states: new Map([["novaesweb-ia-teste", "open"]]),
    alertStates: [state()]
  });
  assert.equal(alerts.length, 0);
  assert.deepEqual(updates, []);
});

test("canal que nunca conectou nao alarma: e configuracao pendente, nao queda", () => {
  const { alerts } = decideAlerts({
    channels: [channel({ status: "disconnected" })],
    states: new Map([["novaesweb-ia-teste", "close"]]),
    alertStates: [state({ last_status: "disconnected" })]
  });
  assert.equal(alerts.length, 0);
});

test("estado desconhecido (timeout na Evolution) nao dispara alarme falso", () => {
  const { alerts, updates } = decideAlerts({
    channels: [channel()],
    states: new Map([["novaesweb-ia-teste", "unknown"]]),
    alertStates: [state()]
  });
  assert.equal(alerts.length, 0);
  assert.deepEqual(updates, []);
});

test("canal caido ha mais de 6h manda lembrete, e nao antes disso", () => {
  const now = new Date("2026-11-11T18:00:00.000Z");
  const recent = decideAlerts({
    channels: [channel({ status: "close" })],
    states: new Map([["novaesweb-ia-teste", "close"]]),
    alertStates: [state({ last_status: "close", last_alert_kind: "down", last_alert_at: "2026-11-11T15:00:00.000Z" })],
    now
  });
  assert.equal(recent.alerts.length, 0);

  const old = decideAlerts({
    channels: [channel({ status: "close" })],
    states: new Map([["novaesweb-ia-teste", "close"]]),
    alertStates: [state({ last_status: "close", last_alert_kind: "down", last_alert_at: "2026-11-11T09:00:00.000Z" })],
    now
  });
  assert.equal(old.alerts.length, 1);
  assert.equal(old.alerts[0].kind, "reminder");
});

test("canal que volta depois de cair avisa 'recovered' uma unica vez", () => {
  const back = decideAlerts({
    channels: [channel({ status: "close" })],
    states: new Map([["novaesweb-ia-teste", "open"]]),
    alertStates: [state({ last_status: "close", last_alert_kind: "down" })]
  });
  assert.equal(back.alerts.length, 1);
  assert.equal(back.alerts[0].kind, "recovered");

  // Ja avisou que voltou: proximo ciclo nao repete.
  const again = decideAlerts({
    channels: [channel({ status: "connected" })],
    states: new Map([["novaesweb-ia-teste", "open"]]),
    alertStates: [state({ last_status: "connected", last_alert_kind: "recovered" })]
  });
  assert.equal(again.alerts.length, 0);
});

test("mensagem de alerta identifica a loja e o canal", () => {
  const msg = buildAlertMessage(
    { tenantId: "t-1", channelId: "ch-1", instanceName: "novaesweb-ia-teste", kind: "down", previousStatus: "connected", currentStatus: "close" },
    "NovaesWeb"
  );
  assert.match(msg, /Canal de WhatsApp caiu/);
  assert.match(msg, /NovaesWeb/);
  assert.match(msg, /novaesweb-ia-teste/);
});
