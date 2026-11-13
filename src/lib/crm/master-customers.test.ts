import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { NextRequest } from "next/server";
import {
  createCustomerRecord,
  resetInMemoryCustomersCatalogForTests,
  validateMasterCustomerInput,
  type MasterCustomer
} from "./master-customers";
import { ALL_DEFAULT_PLANS, DEFAULT_PLANS, TRIAL_PLAN, selectPublishedPlan } from "./plans";

const TENANT_1 = "11111111-1111-4111-8111-111111111111";
const TENANT_2 = "22222222-2222-4222-8222-222222222222";
const USER_ANA = "33333333-3333-4333-8333-333333333333";
const CUST_ANA = "44444444-4444-4444-8444-444444444444";

test("Etapa 1 (1. Clientes): validateMasterCustomerInput e createCustomerRecord criam cliente comercial sem exigir senha", () => {
  const errMissing = validateMasterCustomerInput({ name: "A", email: "invalido" });
  assert.equal(errMissing.ok, false);

  const resOk = validateMasterCustomerInput({
    name: "Carlos Eduardo Silva",
    email: "CARLOS@EMPRESA.COM.BR",
    whatsapp: "(51) 98196-4238",
    document: "12.345.678/0001-90",
    notes: "Titular de duas lojas"
  });
  assert.equal(resOk.ok, true);

  const record = createCustomerRecord({
    name: "Carlos Eduardo Silva",
    email: "CARLOS@EMPRESA.COM.BR",
    whatsapp: "(51) 98196-4238",
    document: "12.345.678/0001-90",
    notes: "Titular de duas lojas"
  });

  assert.ok(record.id.length >= 36);
  assert.equal(record.name, "Carlos Eduardo Silva");
  assert.equal(record.email, "carlos@empresa.com.br");
  assert.equal(record.whatsapp, "51981964238");
  assert.equal(record.document, "12.345.678/0001-90");
});

test("Etapa 1 (/api/crm/admin/customers): cadastra, edita e consulta cliente responsável sem chamar auth.users", async () => {
  resetInMemoryCustomersCatalogForTests();
  const authCalls: string[] = [];
  let catalogStore: MasterCustomer[] = [];

  const dependencies: Record<string, unknown> = {
    "next/server": { NextRequest },
    "@/lib/crm/supabase-server": {
      isAllowedOrigin: () => true,
      privateJson: (body: unknown, status = 200) => Response.json(body, { status })
    },
    "@/lib/crm/tenant-access": {
      TENANT_UUID: /^[0-9a-f-]{36}$/i
    },
    "@/lib/crm/master-auth": {
      verifyMasterRequest: async () => ({ authorized: true, actor: "fixture-master" })
    },
    "@/lib/crm/master-customers": {
      validateMasterCustomerInput,
      createCustomerRecord,
      loadMasterCustomersCatalog: async () => catalogStore,
      saveMasterCustomersCatalog: async (list: MasterCustomer[]) => {
        catalogStore = list;
      }
    }
  };

  const fetchFixture = async (input: string | URL, init?: RequestInit) => {
    const u = new URL(String(input));
    const method = init?.method || "GET";
    if (u.pathname.startsWith("/auth/v1/admin/users") && method !== "GET") {
      authCalls.push(`${method} ${u.pathname}`);
    }
    if (u.pathname === "/rest/v1/crm_tenants") return Response.json([]);
    if (u.pathname === "/rest/v1/crm_tenant_settings") return Response.json([]);
    if (u.pathname === "/rest/v1/crm_tenant_memberships") return Response.json([]);
    if (u.pathname === "/auth/v1/admin/users") return Response.json({ users: [] });
    return Response.json({});
  };

  const filename = resolve("src/app/api/crm/admin/customers/route.ts");
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
    crypto,
    console,
    fetch: fetchFixture,
    process: { env: { CRM_SUPABASE_URL: "https://fixture.supabase.co", CRM_SUPABASE_SERVICE_ROLE_KEY: "fixture-key" } },
    require: (id: string) => dependencies[id]
  });
  new vm.Script(code, { filename }).runInContext(context);

  // Create customer (POST) without password
  const createRes = await fixtureModule.exports.POST(
    new NextRequest("http://fixture.invalid/api/crm/admin/customers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Ana Paula Costa",
        email: "ana@fornonobre.com.br",
        whatsapp: "51991112222",
        document: "111.222.333-44"
      })
    })
  );
  assert.equal(createRes.status, 201);
  const createdJson = await createRes.json();
  assert.equal(createdJson.customer.name, "Ana Paula Costa");
  assert.equal(createdJson.customer.email, "ana@fornonobre.com.br");
  assert.equal(authCalls.length, 0, "Step 1 must NOT create or mutate auth.users");

  // Edit customer (PATCH)
  const patchRes = await fixtureModule.exports.PATCH(
    new NextRequest("http://fixture.invalid/api/crm/admin/customers", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customerId: createdJson.customer.id,
        name: "Ana Paula Costa (Rede)",
        email: "ana@fornonobre.com.br",
        whatsapp: "51991113333"
      })
    })
  );
  assert.equal(patchRes.status, 200);

  // List customers (GET)
  const getRes = await fixtureModule.exports.GET(
    new NextRequest("http://fixture.invalid/api/crm/admin/customers")
  );
  assert.equal(getRes.status, 200);
  const getJson = await getRes.json();
  assert.equal(getJson.customers.length, 1);
  assert.equal(getJson.customers[0].name, "Ana Paula Costa (Rede)");
  assert.equal(getJson.customers[0].hasLogin, false);
});

test("Etapa 2 (/api/crm/admin/clients): cria múltiplas empresas para o mesmo customerId com plano definido e sem exigir senha/login", async () => {
  const authPostCalls: unknown[] = [];
  const createdTenants: Array<{ id: string; name: string }> = [];
  const savedSettingsBodies: Array<Record<string, unknown>> = [];

  const dependencies: Record<string, unknown> = {
    "next/server": { NextRequest },
    "@/lib/crm/supabase-server": {
      isAllowedOrigin: () => true,
      privateJson: (body: unknown, status = 200) => Response.json(body, { status })
    },
    "@/lib/crm/tenant-access": {
      TENANT_UUID: /^[0-9a-f-]{36}$/i,
      patchCrmConfig: async () => undefined
    },
    "@/lib/crm/master-auth": {
      verifyMasterRequest: async () => ({ authorized: true, actor: "fixture-master" })
    },
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

  let seq = 1;
  const fetchFixture = async (input: string | URL, init?: RequestInit) => {
    const u = new URL(String(input));
    const method = init?.method || "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;

    if (u.pathname === "/auth/v1/admin/users" && method === "POST") {
      authPostCalls.push(body);
      return Response.json({ id: "unexpected-user" }, { status: 201 });
    }
    if (u.pathname === "/rest/v1/crm_tenants" && method === "POST") {
      const t = { id: `00000000-0000-4000-8000-00000000000${seq++}`, name: String(body?.name) };
      createdTenants.push(t);
      return Response.json([t], { status: 201 });
    }
    if (u.pathname === "/rest/v1/crm_tenants" && method === "PATCH") {
      return Response.json([{ id: createdTenants.at(-1)?.id, status: "active" }]);
    }
    if (u.pathname === "/rest/v1/crm_tenant_settings" && method === "POST") {
      savedSettingsBodies.push(body as Record<string, unknown>);
      return new Response(null, { status: 201 });
    }
    if (["/rest/v1/crm_tenant_memberships", "/rest/v1/crm_agents", "/rest/v1/crm_channels"].includes(u.pathname)) {
      return new Response(null, { status: 201 });
    }
    throw new Error(`Unexpected fetch in Etapa 2 test: ${method} ${u.pathname}`);
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
    crypto,
    console,
    fetch: fetchFixture,
    process: { env: { CRM_SUPABASE_URL: "https://fixture.supabase.co", CRM_SUPABASE_SERVICE_ROLE_KEY: "fixture-key" } },
    require: (id: string) => dependencies[id]
  });
  new vm.Script(code, { filename }).runInContext(context);

  // Create Store 1 for customerId CUST_ANA without password
  const res1 = await fixtureModule.exports.POST(
    new NextRequest("http://fixture.invalid/api/crm/admin/clients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        storeName: "Forno Nobre Centro",
        customerId: CUST_ANA,
        ownerName: "Ana Paula Costa",
        email: "ana@fornonobre.com.br",
        planId: "crm-premium",
        planName: "CRM Premium"
      })
    })
  );
  assert.equal(res1.status, 201);

  // Create Store 2 for the SAME customerId CUST_ANA without password
  const res2 = await fixtureModule.exports.POST(
    new NextRequest("http://fixture.invalid/api/crm/admin/clients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        storeName: "Forno Nobre Zona Sul",
        customerId: CUST_ANA,
        ownerName: "Ana Paula Costa",
        email: "ana@fornonobre.com.br",
        planId: "crm-premium",
        planName: "CRM Premium"
      })
    })
  );
  assert.equal(res2.status, 201);

  assert.equal(authPostCalls.length, 0, "Step 2 with customerId and no password must NOT create an Auth user");
  assert.equal(createdTenants.length, 2, "Both stores must be created for the same responsible customer");
  const desc1 = JSON.parse(String(savedSettingsBodies[0].business_description));
  const desc2 = JSON.parse(String(savedSettingsBodies[1].business_description));
  assert.equal(desc1.businessDetails.customerId, CUST_ANA);
  assert.equal(desc2.businessDetails.customerId, CUST_ANA);
});

test("Etapa 3 (/api/crm/admin/users): cria login vinculado à empresa com permissões e vincula segunda empresa ao mesmo login", async () => {
  const memberships: Array<{ tenant_id: string; user_id: string; role: string; is_active: boolean }> = [];
  let lastUserMetadata: Record<string, unknown> = {};

  const dependencies: Record<string, unknown> = {
    "next/server": { NextRequest },
    "@/lib/crm/supabase-server": {
      isAllowedOrigin: () => true,
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

    if (u.pathname === "/auth/v1/admin/users" && method === "POST") {
      lastUserMetadata = (body?.user_metadata || {}) as Record<string, unknown>;
      return Response.json({ id: USER_ANA, email: body?.email, created_at: new Date().toISOString() }, { status: 201 });
    }
    if (u.pathname === `/auth/v1/admin/users/${USER_ANA}` && method === "GET") {
      return Response.json({ id: USER_ANA, user_metadata: lastUserMetadata });
    }
    if (u.pathname === `/auth/v1/admin/users/${USER_ANA}` && method === "PUT") {
      lastUserMetadata = (body?.user_metadata || {}) as Record<string, unknown>;
      return Response.json({ id: USER_ANA, user_metadata: lastUserMetadata });
    }
    if (u.pathname === "/rest/v1/crm_tenant_memberships" && method === "POST") {
      memberships.push(body as { tenant_id: string; user_id: string; role: string; is_active: boolean });
      return Response.json([body], { status: 201 });
    }
    return Response.json({});
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
    crypto,
    console,
    fetch: fetchFixture,
    process: { env: { CRM_SUPABASE_URL: "https://fixture.supabase.co", CRM_SUPABASE_SERVICE_ROLE_KEY: "fixture-key" } },
    require: (id: string) => dependencies[id]
  });
  new vm.Script(code, { filename }).runInContext(context);

  // Create login linked to Store 1 with granular permissions
  const postRes = await fixtureModule.exports.POST(
    new NextRequest("http://fixture.invalid/api/crm/admin/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Ana Paula Costa",
        email: "ana@fornonobre.com.br",
        whatsapp: "51991112222",
        password: "StrongPassword123!",
        tenantId: TENANT_1,
        customerId: CUST_ANA,
        role: "owner",
        permissions: {
          canManageAi: true,
          canManageWhatsapp: true,
          canManageTeam: true,
          canViewReports: true,
          canManageBilling: true
        }
      })
    })
  );
  assert.equal(postRes.status, 201);
  assert.equal(memberships.length, 1);
  assert.equal(memberships[0].tenant_id, TENANT_1);
  assert.equal(memberships[0].role, "owner");
  assert.equal(lastUserMetadata.accessRole, "owner");

  // Link Store 2 to the SAME login via PATCH link_tenant
  const linkRes = await fixtureModule.exports.PATCH(
    new NextRequest("http://fixture.invalid/api/crm/admin/users", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId: USER_ANA,
        action: "link_tenant",
        tenantId: TENANT_2,
        role: "owner"
      })
    })
  );
  assert.equal(linkRes.status, 200);
  assert.equal(memberships.length, 2);
  assert.equal(memberships[1].tenant_id, TENANT_2);
});
