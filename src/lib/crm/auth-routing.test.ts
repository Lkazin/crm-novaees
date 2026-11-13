import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { NextRequest, NextResponse } from "next/server";

const USER = "11111111-1111-4111-8111-111111111111";
const TENANT = "22222222-2222-4222-8222-222222222222";

function fixture() {
  const state = { attempts: 0, member: true, user: false, master: false, authCalls: 0 };
  const redis = {
    status: "ready", get: async () => String(state.attempts),
    del: async () => { state.attempts = 0; },
    incr: async () => ++state.attempts, expire: async () => 1,
  };
  const dependencies: Record<string, unknown> = {
    "next/server": { NextRequest, NextResponse },
    "@/lib/crm/plans": { getRedis: () => redis },
    "@/lib/crm/recovery-store": {
      findUserRecoveryPhoneByEmail: async () => null,
      createRecoveryChallenge: async () => ({ id: "chal_test", expiresAt: Date.now() + 600000 }),
    },
    "@/lib/crm/master-auth": {
      MASTER_COOKIE_NAME: "nw_master_session", MASTER_SESSION_TTL_SEC: 43200, MASTER_REMEMBER_TTL_SEC: 2592000,
      getMasterPassword: () => "fixture-master-password",
      getDynamicMasterPassword: async () => "fixture-master-password",
      getStoredMasterSecret: async () => null,
      verifyMasterPasswordCandidate: () => false,
      migrateMasterPasswordToHash: async () => {},
      getLegacyAdminToken: () => "fixture-admin-token",
      timingSafeMatch: (a: string, b: string) => a === b, signMasterToken: () => "fixture-signed-session",
      verifyMasterRequest: async () => ({ authorized: state.master, actor: "fixture" }),
      revokeMasterToken: async () => {},
      dispatchMasterRecoveryOtp: async () => "123456",
      isLoginBlocked: async () => ({ blocked: state.attempts >= 5, remainingSec: 900 }),
      recordFailedLoginAttempt: async () => {
        state.attempts++;
        return { attempts: state.attempts, blocked: state.attempts >= 5, otpDispatched: state.attempts >= 5 };
      },
      resetLoginAttempts: async () => { state.attempts = 0; },
      getActiveMasterOtpForIp: async () => null,
    },
    "@/lib/crm/supabase-server": {
      isAllowedOrigin: () => true, privateJson: (value: unknown, status = 200) => Response.json(value, {status}),
      sessionCookieName: () => "nw_crm_session", supabaseSettings: () => ({url: "https://fixture.supabase.co", key: "fixture-public-key"}),
      verifyOperator: async () => state.user ? {id: USER, email: "fixture@example.invalid", token: "fixture-client-token"} : null,
      supabaseRows: async (path: string) => {
        if (path.startsWith("crm_tenant_memberships")) {
          assert.ok(path.includes("is_active=eq.true"), "inactive memberships cannot log in");
          return state.member ? [{tenant_id: TENANT, role: "owner"}] : [];
        }
        if (path.startsWith("crm_tenants")) return [{id: TENANT, name: "Fixture", status: "active"}];
        if (path.startsWith("platform_staff")) return [];
        throw new Error("Unexpected data access");
      },
    },
  };
  const source = ts.transpileModule(readFileSync("src/app/api/crm/auth/session/route.ts", "utf8"), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
  }).outputText;
  const mod = {exports: {} as Record<string, (request: NextRequest) => Promise<Response>>};
  vm.runInNewContext(source, {
    exports: mod.exports, module: mod, require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; },
    Response, URL, AbortSignal, console,
    fetch: async (_url: string, init: RequestInit) => {
      state.authCalls++;
      const body = JSON.parse(String(init.body));
      return body.password === "fixture-client-password"
        ? Response.json({access_token: "fixture-client-token", user: {id: USER, email: "fixture@example.invalid"}, expires_in: 3600})
        : Response.json({error: "invalid_credentials"}, {status: 400});
    },
  });
  const post = (password: string, scope: string, email = "") => mod.exports.POST(new NextRequest("http://localhost/api/crm/auth/session", {
    method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({password, scope, email}),
  }));
  return {state, post, get: (scope: string) => mod.exports.GET(new NextRequest("http://localhost/api/crm/auth/session?scope=" + scope))};
}

test("Client and Master credentials issue only the selected panel session", async () => {
  const f = fixture();
  const denied = await f.post("fixture-master-password", "client");
  assert.equal(denied.status, 401);
  assert.equal(denied.headers.get("set-cookie"), null);
  const master = await f.post("fixture-master-password", "master");
  assert.equal((await master.json()).redirectTo, "/admin");
  assert.match(master.headers.get("set-cookie") || "", /nw_master_session=fixture-signed-session/);
  assert.match(master.headers.get("set-cookie") || "", /nw_crm_session=;.*Max-Age=0/);
  const client = await f.post("fixture-client-password", "client", "fixture@example.invalid");
  assert.equal((await client.json()).redirectTo, "/cliente");
  assert.match(client.headers.get("set-cookie") || "", /nw_crm_session=fixture-client-token/);
  assert.match(client.headers.get("set-cookie") || "", /nw_master_session=;.*Max-Age=0/);
  assert.equal((await f.post("fixture-client-password", "master", "fixture@example.invalid")).status, 401);
});

test("Login refuses inactive memberships, unknown scope and repeated invalid Master passwords", async () => {
  const f = fixture();
  f.state.member = false;
  assert.equal((await f.post("fixture-client-password", "client", "fixture@example.invalid")).status, 403);
  assert.equal((await f.post("fixture-master-password", "unknown")).status, 400);
  for (let i = 0; i < 4; i++) assert.equal((await f.post("incorrect", "master")).status, 401);
  assert.equal((await f.post("incorrect", "master")).status, 429);
  assert.equal((await f.post("incorrect", "master")).status, 429);
});

test("Panel-specific session checks cannot use the other panel session", async () => {
  const f = fixture();
  f.state.master = true;
  assert.equal((await (await f.get("client")).json()).authenticated, false);
  f.state.master = false; f.state.user = true;
  assert.equal((await (await f.get("master")).json()).authenticated, false);
  assert.equal((await (await f.get("client")).json()).role, "client");
});
