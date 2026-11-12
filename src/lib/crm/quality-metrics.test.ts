import { test } from "node:test";
import assert from "node:assert/strict";
import { periodKeyFor } from "./quality-metrics";

test("periodKeyFor usa o fuso do cliente, não UTC", () => {
  // 2026-12-01T02:00Z ainda é 30/11 em São Paulo (GMT-3).
  const d = new Date("2026-12-01T02:00:00Z");
  assert.equal(periodKeyFor(d, "America/Sao_Paulo"), "2026-11");
  assert.equal(periodKeyFor(d, "UTC"), "2026-12");
});

test("periodKeyFor preenche o mês com zero à esquerda", () => {
  assert.equal(periodKeyFor(new Date("2026-01-15T12:00:00Z"), "America/Sao_Paulo"), "2026-01");
});

test("periodKeyFor aceita o fuso padrão quando omitido", () => {
  assert.equal(periodKeyFor(new Date("2026-11-11T15:00:00Z")), "2026-11");
});
