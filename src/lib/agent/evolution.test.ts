import test from "node:test";
import assert from "node:assert/strict";
import { EvolutionSendError, sendText, sendPresence } from "./evolution";

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
