import { test } from "node:test";
import assert from "node:assert/strict";
import { daysUntilPurge, endOfBillingCycle } from "./account-deletion";

test("endOfBillingCycle cai no dia 1º do mês seguinte, no fuso do cliente", () => {
  // 12/11/2026 12:00 em São Paulo -> ciclo termina em 01/12/2026 00:00 -03:00
  const now = new Date("2026-11-12T15:00:00Z");
  const end = endOfBillingCycle(now, "America/Sao_Paulo");
  assert.equal(end.toISOString(), "2026-12-01T03:00:00.000Z");
});

test("endOfBillingCycle vira o ano em dezembro", () => {
  const now = new Date("2026-12-20T15:00:00Z");
  const end = endOfBillingCycle(now, "America/Sao_Paulo");
  assert.equal(end.toISOString(), "2027-01-01T03:00:00.000Z");
});

test("endOfBillingCycle respeita o fuso: 01/12 02:00Z ainda é novembro em SP", () => {
  const now = new Date("2026-12-01T02:00:00Z");
  const end = endOfBillingCycle(now, "America/Sao_Paulo");
  assert.equal(end.toISOString(), "2026-12-01T03:00:00.000Z");
});

test("daysUntilPurge conta dias cheios para cima e nunca fica negativo", () => {
  const now = new Date("2026-11-12T12:00:00Z");
  assert.equal(daysUntilPurge("2026-11-22T12:00:00Z", now), 10);
  assert.equal(daysUntilPurge("2026-11-01T12:00:00Z", now), 0);
  assert.equal(daysUntilPurge("data-invalida", now), 0);
});
