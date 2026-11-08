import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

test("outbound authorization denies outages, human takeover and channels outside the current plan", async () => {
  const state = {fail: false, human: false, slot: 1, suspended: false, channel: true};
  const dependencies: Record<string, unknown> = {
    "server-only": {},
    "./plans": {getEffectiveTenantPlan: async () => {
      if (state.fail) throw Error("unavailable");
      return {isSuspended: state.suspended, maxWhatsappConnections: 3, featureStates: {ai_chat: {state: "allowed"}}};
    }},
    "./whatsapp-slots": {extractSlotFromInstanceName: () => state.slot},
    "./supabase-ingest": {resolveChannelForInstance: async () => state.channel ? {tenant_id: "fixture", status: "connected"} : null},
  };
  const code = ts.transpileModule(readFileSync("src/lib/crm/outbound-guard.ts", "utf8"), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
  }).outputText;
  const fixtureModule = {exports: {} as {outboundAllowed: (input: object) => Promise<boolean>}};
  vm.runInNewContext(code, {
    module: fixtureModule, exports: fixtureModule.exports,
    require: (name: string) => {assert.ok(name in dependencies); return dependencies[name];},
    process: {env: {CRM_SUPABASE_URL: "https://fixture.supabase.co", CRM_SUPABASE_SERVICE_ROLE_KEY: "fixture"}},
    fetch: async (url: string) => {
      if (url.includes("crm_tenants")) return Response.json([{status: "active"}]);
      if (url.includes("crm_contacts")) return Response.json([{id: "contact"}]);
      if (url.includes("crm_conversations")) return Response.json([{mode: state.human ? "human" : "ai", status: "open"}]);
      throw Error("Unexpected traffic");
    },
  });
  const allowed = () => fixtureModule.exports.outboundAllowed({instance: "crmtest", number: "fixture"});
  assert.equal(await allowed(), true);
  state.fail = true; assert.equal(await allowed(), false);
  state.fail = false; state.human = true; assert.equal(await allowed(), false);
  state.human = false; state.slot = 5; assert.equal(await allowed(), false);
  state.slot = 1; state.suspended = true; assert.equal(await allowed(), false);
  state.suspended = false; state.channel = false; assert.equal(await allowed(), false, "test instance names never bypass ownership");
});
