import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { NextRequest } from "next/server";
import { ALL_DEFAULT_PLANS, DEFAULT_PLANS, TRIAL_PLAN, selectPublishedPlan } from "./plans";

const TENANT = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";

function setupUsersFixture() {
  const calls: Array<{ path: string; method?: string; body?: Record<string, unknown> }> = [];
  const dependencies: Record<string, unknown> = {
    "@/lib/crm/supabase-server": {
      privateJson: (body: unknown, status = 200) => Response.json(body, { status })
    },
    "@/lib/crm/master-auth": {
      verifyMasterRequest: async () => ({ authorized: true, actor: "fixture-master" })
    }
  };

  const fetchFixture = async (input: string | URL, init?: RequestInit) => {
    const u = new URL(String(input));
    const method = init?.method || "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ path: u.pathname, method, body });

    if (u.pathname === "/auth/v1/admin/users" && method === "GET") {
      return Response.json({
        users: [
          {
            id: USER,
            email: "joao@example.com",
            created_at: new Date().toISOString(),
            user_metadata: { name: "João Silva", whatsapp: "51999998888", role: "CLIENT", is_blocked: false }
          },
          {
            id: "33333333-3333-4333-8333-333333333333",
            email: "maria@example.com",
            created_at: new Date().toISOString(),
            user_metadata: { name: "Maria Santos", whatsapp: "51988887777", role: "CLIENT", is_blocked: true }
          }
        ]
      });
    }

    if (u.pathname === "/rest/v1/crm_tenant_memberships" && method === "GET") {
      const rows = [{ tenant_id: TENANT, user_id: USER, role: "admin", is_active: true }];
      const filter = u.searchParams.get("user_id");
      return Response.json(filter ? rows.filter(r => `eq.${r.user_id}` === filter) : rows);
    }

    if (u.pathname.startsWith("/auth/v1/admin/users/") && method === "DELETE") {
      return Response.json({});
    }

    if (u.pathname === "/rest/v1/crm_tenants" && method === "GET") {
      return Response.json([
        { id: TENANT, name: "Pizzaria do João", status: "active" }
      ]);
    }

    if (u.pathname === "/rest/v1/crm_tenant_settings" && method === "GET") {
      return Response.json([
        { tenant_id: TENANT, business_description: JSON.stringify({ plan: { name: "CRM Pro" } }) }
      ]);
    }

    if (u.pathname === "/auth/v1/admin/users" && method === "POST") {
      return Response.json({
        id: "44444444-4444-4444-8444-444444444444",
        email: body?.email,
        created_at: new Date().toISOString()
      }, { status: 201 });
    }

    if (u.pathname.startsWith("/auth/v1/admin/users/") && method === "PUT") {
      return Response.json({ success: true });
    }

    throw Error("Unexpected fetch in users route " + u.pathname);
  };

  const filename = resolve("src/app/api/crm/admin/users/route.ts");
  const code = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText;
  const fixtureModule = { exports: {} as Record<string, (req: NextRequest) => Promise<Response>> };
  const context = vm.createContext({
    module: fixtureModule,
    exports: fixtureModule.exports,
    Response,
    URL,
    AbortSignal,
    console,
    fetch: fetchFixture,
    process: { env: { CRM_SUPABASE_URL: "https://fixture.supabase.co", CRM_SUPABASE_SERVICE_ROLE_KEY: "fixture-key" } },
    require: (id: string) => dependencies[id]
  });
  new vm.Script(code, { filename }).runInContext(context);

  return {
    calls,
    get: () => fixtureModule.exports.GET(new NextRequest("http://fixture.invalid/api/crm/admin/users")),
    post: (data: Record<string, unknown>) => fixtureModule.exports.POST(new NextRequest("http://fixture.invalid/api/crm/admin/users", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data)
    })),
    patch: (data: Record<string, unknown>) => fixtureModule.exports.PATCH(new NextRequest("http://fixture.invalid/api/crm/admin/users", {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(data)
    })),
    del: (userId: string) => fixtureModule.exports.DELETE(new NextRequest(`http://fixture.invalid/api/crm/admin/users?userId=${userId}`, { method: "DELETE" }))
  };
}

test("DELETE /api/crm/admin/users refuses linked users and deletes unlinked ones", async () => {
  const fx = setupUsersFixture();
  const linked = await fx.del(USER);
  assert.equal(linked.status, 409);
  assert.equal(fx.calls.some(c => c.method === "DELETE"), false);

  const free = "55555555-5555-4555-8555-555555555555";
  const ok = await fx.del(free);
  assert.equal(ok.status, 200);
  assert.ok(fx.calls.some(c => c.method === "DELETE" && c.path === `/auth/v1/admin/users/${free}`));
});

test("GET /api/crm/admin/users correctly categorizes linked, blocked, and waiting_store users", async () => {
  const f = setupUsersFixture();
  const res = await f.get();
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.users.length, 2);

  const joao = data.users.find((u: { email: string }) => u.email === "joao@example.com");
  assert.equal(joao.name, "João Silva");
  assert.equal(joao.status, "linked");
  assert.equal(joao.linkedTenants.length, 1);
  assert.equal(joao.linkedTenants[0].tenantName, "Pizzaria do João");

  const maria = data.users.find((u: { email: string }) => u.email === "maria@example.com");
  assert.equal(maria.name, "Maria Santos");
  assert.equal(maria.status, "blocked");
  assert.equal(maria.isBlocked, true);
});

test("POST /api/crm/admin/users validates required fields and creates user in Supabase Auth", async () => {
  const f = setupUsersFixture();
  // Name too short
  const res1 = await f.post({ name: "J", email: "new@example.com", whatsapp: "51999998888", password: "password123" });
  assert.equal(res1.status, 400);

  // Invalid email
  const res2 = await f.post({ name: "Carlos", email: "invalid-email", whatsapp: "51999998888", password: "password123" });
  assert.equal(res2.status, 400);

  // WhatsApp too short
  const res3 = await f.post({ name: "Carlos", email: "new@example.com", whatsapp: "123", password: "password123" });
  assert.equal(res3.status, 400);

  // Password too short
  const res4 = await f.post({ name: "Carlos", email: "new@example.com", whatsapp: "51999998888", password: "123" });
  assert.equal(res4.status, 400);

  // Valid submission
  const res5 = await f.post({ name: "Carlos Oliveira", email: "carlos@example.com", whatsapp: "51999991111", password: "secure-password-123" });
  assert.equal(res5.status, 201);
  const data = await res5.json();
  assert.equal(data.success, true);
  assert.equal(data.user.name, "Carlos Oliveira");
  assert.equal(data.user.email, "carlos@example.com");
  assert.equal(data.user.status, "waiting_store");
});

test("POST /api/crm/admin/clients with pre-existing userId links store without re-creating user", async () => {
  const calls: Array<{ path: string; method?: string; body?: Record<string, unknown> }> = [];
  const dependencies: Record<string, unknown> = {
    "next/server": { NextRequest },
    "@/lib/crm/supabase-server": { privateJson: (body: unknown, status = 200) => Response.json(body, { status }), isAllowedOrigin: () => true },
    "@/lib/crm/tenant-access": { TENANT_UUID: /^[0-9a-f-]{36}$/i, patchCrmConfig: async () => { throw Error("Unexpected patch"); } },
    "@/lib/crm/master-auth": { verifyMasterRequest: async () => ({ authorized: true, actor: "fixture-master" }) },
    "@/lib/crm/plans": {
      getMasterPlans: async () => ALL_DEFAULT_PLANS,
      selectPublishedPlan,
      DEFAULT_PLANS,
      TRIAL_PLAN,
      checkTrialEligibility: async () => ({ eligible: true }),
      recordTrialRegistration: async () => undefined,
      syncTenantUsageLimits: async () => undefined
    },
    "@/lib/crm/whatsapp-slots": {}
  };

  const fetchFixture = async (input: string | URL, init?: RequestInit) => {
    const u = new URL(String(input));
    const method = init?.method || "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ path: u.pathname, method, body });

    if (method === "GET" && u.pathname === `/auth/v1/admin/users/${USER}`) {
      return Response.json({
        id: USER,
        email: "joao@example.com",
        user_metadata: { name: "João Silva", whatsapp: "51999998888" }
      });
    }
    if (method === "POST" && u.pathname === "/rest/v1/crm_tenants") {
      return Response.json([{ id: TENANT }]);
    }
    if (method === "PATCH" && u.pathname === "/rest/v1/crm_tenants") {
      return Response.json([{ id: TENANT, status: "active" }]);
    }
    if (method === "POST" && ["/rest/v1/crm_tenant_memberships", "/rest/v1/crm_tenant_settings", "/rest/v1/crm_agents", "/rest/v1/crm_channels"].includes(u.pathname)) {
      return new Response(null, { status: 201 });
    }
    throw Error("Unexpected fetch in clients route: " + method + " " + u.pathname);
  };

  const filename = resolve("src/app/api/crm/admin/clients/route.ts");
  const code = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText;
  const fixtureModule = { exports: {} as Record<string, (req: NextRequest) => Promise<Response>> };
  const context = vm.createContext({
    module: fixtureModule,
    exports: fixtureModule.exports,
    Response,
    URL,
    AbortSignal,
    console,
    fetch: fetchFixture,
    process: { env: { CRM_SUPABASE_URL: "https://fixture.supabase.co", CRM_SUPABASE_SERVICE_ROLE_KEY: "fixture-key" } },
    require: (id: string) => dependencies[id]
  });
  new vm.Script(code, { filename }).runInContext(context);

  const res = await fixtureModule.exports.POST(new NextRequest("http://fixture.invalid/api/crm/admin/clients", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      storeName: "Loja do João",
      userId: USER,
      niche: "Hamburgueria",
      businessWhatsapp: "51999997777",
      document: "12.345.678/0001-90",
      agentName: "Max Atendente",
      planId: "crm-premium"
    })
  }));

  assert.equal(res.status, 201);

  // Verify that /auth/v1/admin/users POST was NEVER called (user was NOT re-created)
  const authCreateCall = calls.find(c => c.path === "/auth/v1/admin/users" && c.method === "POST");
  assert.equal(authCreateCall, undefined);

  // Verify membership was linked with USER
  const membCall = calls.find(c => c.path === "/rest/v1/crm_tenant_memberships" && c.method === "POST");
  assert.ok(membCall);
  assert.equal(membCall.body?.user_id, USER);
  assert.equal(membCall.body?.tenant_id, TENANT);

  // Verify agent was configured with custom agentName and niche
  const agentCall = calls.find(c => c.path === "/rest/v1/crm_agents" && c.method === "POST");
  assert.ok(agentCall);
  assert.equal(agentCall.body?.label, "Max Atendente");
  assert.match(String(agentCall.body?.instructions), /Hamburgueria/);
});
