import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { runDeletionPurge } from "./account-deletion";

// Testa o fluxo do purge com fetch falso: nenhuma chamada real ao Supabase.
const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_ENV = {
  url: process.env.CRM_SUPABASE_URL,
  key: process.env.CRM_SUPABASE_SERVICE_ROLE_KEY,
};

function stubFetch(handler: (url: string, init?: RequestInit) => { ok: boolean; body: unknown }) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const r = handler(url, init);
    return {
      ok: r.ok,
      status: r.ok ? 200 : 500,
      json: async () => r.body,
      text: async () => JSON.stringify(r.body),
    } as unknown as Response;
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  if (ORIGINAL_ENV.url === undefined) delete process.env.CRM_SUPABASE_URL;
  else process.env.CRM_SUPABASE_URL = ORIGINAL_ENV.url;
  if (ORIGINAL_ENV.key === undefined) delete process.env.CRM_SUPABASE_SERVICE_ROLE_KEY;
  else process.env.CRM_SUPABASE_SERVICE_ROLE_KEY = ORIGINAL_ENV.key;
});

test("purge de pedido vencido chama a RPC e marca como purgado", async () => {
  process.env.CRM_SUPABASE_URL = "https://fake.supabase.co";
  process.env.CRM_SUPABASE_SERVICE_ROLE_KEY = "fake-key";

  const calls: string[] = [];
  stubFetch((url, init) => {
    calls.push(`${init?.method ?? "GET"} ${url.split("/rest/v1/")[1]}`);
    if (url.includes("crm_deletion_requests?status=eq.scheduled")) {
      return {
        ok: true,
        body: [
          {
            id: "req-1",
            tenant_id: "11111111-1111-1111-1111-111111111111",
            status: "scheduled",
            active_until: "2026-11-01T03:00:00.000Z",
            purge_after: "2026-11-01T03:00:00.000Z",
            created_at: "2026-10-01T00:00:00.000Z",
          },
        ],
      };
    }
    if (url.includes("rpc/crm_purge_tenant")) {
      return { ok: true, body: { crm_contacts: 2, crm_tenants: 1 } };
    }
    if (url.includes("crm_deletion_requests?id=eq.req-1")) {
      return { ok: true, body: [{ id: "req-1" }] };
    }
    return { ok: false, body: {} };
  });

  const result = await runDeletionPurge(new Date("2026-11-12T12:00:00Z"));
  assert.equal(result.checked, 1);
  assert.equal(result.purged.length, 1);
  assert.equal(result.failed.length, 0);
  assert.deepEqual(result.purged[0].counts, { crm_contacts: 2, crm_tenants: 1 });
  assert.ok(calls.some((c) => c.startsWith("POST rpc/crm_purge_tenant")));
  assert.ok(calls.some((c) => c.startsWith("PATCH crm_deletion_requests?id=eq.req-1")));
});

test("falha na RPC mantem o pedido agendado e reporta o erro", async () => {
  process.env.CRM_SUPABASE_URL = "https://fake.supabase.co";
  process.env.CRM_SUPABASE_SERVICE_ROLE_KEY = "fake-key";

  stubFetch((url) => {
    if (url.includes("crm_deletion_requests?status=eq.scheduled")) {
      return {
        ok: true,
        body: [
          {
            id: "req-2",
            tenant_id: "22222222-2222-2222-2222-222222222222",
            status: "scheduled",
            active_until: "2026-11-01T03:00:00.000Z",
            purge_after: "2026-11-01T03:00:00.000Z",
            created_at: "2026-10-01T00:00:00.000Z",
          },
        ],
      };
    }
    return { ok: false, body: {} };
  });

  const result = await runDeletionPurge(new Date("2026-11-12T12:00:00Z"));
  assert.equal(result.purged.length, 0);
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0].error, "purge_rpc_failed");
});

test("sem pedido vencido, nada e apagado", async () => {
  process.env.CRM_SUPABASE_URL = "https://fake.supabase.co";
  process.env.CRM_SUPABASE_SERVICE_ROLE_KEY = "fake-key";

  stubFetch(() => ({ ok: true, body: [] }));
  const result = await runDeletionPurge(new Date("2026-11-12T12:00:00Z"));
  assert.equal(result.checked, 0);
  assert.equal(result.purged.length, 0);
  assert.equal(result.failed.length, 0);
});
