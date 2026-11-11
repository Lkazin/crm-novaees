import test from "node:test";
import assert from "node:assert/strict";
import { EvolutionSendError, sendText, sendPresence, typingDurationFor } from "./evolution";

const cfg = { evolutionUrl: "http://evolution.fixture", evolutionKey: "fixture-only", instance: "fixture", sendFormat: "v2" as const };

test("Evolution classifica rejeição confirmada versus resultado incerto sem enviar tráfego real", async () => {
  const original = globalThis.fetch;
  try {
    for (const [status, outcome] of [[400, "rejected"], [401, "rejected"], [429, "rejected"], [408, "uncertain"], [500, "uncertain"], [503, "uncertain"]] as const) {
      globalThis.fetch = async () => new Response("fixture rejection", { status });
      await assert.rejects(sendText("5511999999999", "Fixture", cfg), error => error instanceof EvolutionSendError && error.outcome === outcome);
    }
    globalThis.fetch = async () => { throw new TypeError("fixture network timeout"); };
    await assert.rejects(sendText("5511999999999", "Fixture", cfg), error => !(error instanceof EvolutionSendError) && error instanceof TypeError);
    globalThis.fetch = async () => new Response("{}", { status: 201 });
    await sendText("5511999999999", "Fixture", cfg);
  } finally {
    globalThis.fetch = original;
  }
});

test("sendPresence envia status composing com delay e não quebra se falhar", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response("{}", { status: 201 });
    const ok = await sendPresence("5511999999999", "composing", cfg, "fixture");
    assert.equal(ok, true);

    globalThis.fetch = async () => { throw new Error("network error"); };
    const fail = await sendPresence("5511999999999", "composing", cfg, "fixture");
    assert.equal(fail, false);
  } finally {
    globalThis.fetch = original;
  }
});

test("typingDurationFor cresce com o tamanho da resposta e fica entre 1.5s e 6s", () => {
  // Resposta curta ("ok") nao deve segurar o cliente por mais de 1.5s.
  assert.equal(typingDurationFor("ok"), 1500);
  // Resposta vazia tambem respeita o piso.
  assert.equal(typingDurationFor(""), 1500);
  // 120 caracteres => 120 * 25ms = 3s, parecido com uma pessoa digitando.
  assert.equal(typingDurationFor("a".repeat(120)), 3000);
  // Resposta muito longa nao passa do teto de 6s (nao trava a fila).
  assert.equal(typingDurationFor("a".repeat(500)), 6000);
});
