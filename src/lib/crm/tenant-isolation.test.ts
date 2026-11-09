import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import {
  TENANT_UUID,
  getCrmAccess,
  selectCrmTenant,
  authorizeCrmTenant,
  authorizeCrmInstance,
  ownsCrmResource
} from "./tenant-access";

const TENANT_A_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENANT_B_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OPERATOR_A_ID = "11111111-1111-4111-8111-111111111111";

describe("Isolamento Multi-Tenant Rigoroso: Empresa A vs Empresa B", () => {
  it("Empresa A não pode acessar nem selecionar o tenant da Empresa B", async () => {
    const request = new NextRequest(`http://localhost/api/crm/operator/data?tenant=${TENANT_B_ID}`);
    const verifyMaster = async () => ({ authorized: false, actor: "" });

    const checks = {
      verifyMaster,
      verifyOperator: async () => ({ id: OPERATOR_A_ID, email: "operador@empresa-a.com", token: "token-a" }),
      rows: async <T>(path: string) => {
        if (path.startsWith("crm_tenant_memberships")) {
          return [{ tenant_id: TENANT_A_ID, role: "agent" }] as T;
        }
        if (path.startsWith("crm_tenants")) {
          return [{ id: TENANT_A_ID, name: "Loja Alpha", status: "active" }] as T;
        }
        return [] as T;
      }
    };

    // Sessão autenticada pertence exclusivamente ao Operador da Empresa A
    const access = await getCrmAccess(request, checks);

    assert.ok(access, "Acesso do operador deve ser reconhecido");
    assert.equal(access.isMaster, false);
    assert.equal(access.operatorId, OPERATOR_A_ID);

    // 1. selectCrmTenant: tentar selecionar tenant B com credencial da loja A retorna undefined
    const selectedB = selectCrmTenant(access, TENANT_B_ID);
    assert.equal(selectedB, undefined, "Empresa A NUNCA deve conseguir selecionar a Empresa B");

    // 2. selectCrmTenant: selecionar tenant A funciona normalmente
    const selectedA = selectCrmTenant(access, TENANT_A_ID);
    assert.equal(selectedA?.id, TENANT_A_ID);
    assert.equal(selectedA?.name, "Loja Alpha");

    // 3. authorizeCrmTenant com ID da Empresa B retorna null (acesso negado fail-closed)
    const authResultB = await authorizeCrmTenant(request, TENANT_B_ID, undefined, checks);
    assert.equal(authResultB, null, "authorizeCrmTenant deve rejeitar cross-tenant access");
  });

  it("Empresa A não pode enviar mensagens nem manipular canais do WhatsApp da Empresa B", async () => {
    const originalFetch = globalThis.fetch;
    const request = new NextRequest(`http://localhost/api/crm/operator/send?tenant=${TENANT_A_ID}`);

    const previousUrl = process.env.CRM_SUPABASE_URL;
    const previousKey = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY;
    process.env.CRM_SUPABASE_URL = "https://mock.supabase.co";
    process.env.CRM_SUPABASE_SERVICE_ROLE_KEY = "test-service-key-".repeat(4);

    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/crm_tenant_memberships")) {
        return Response.json([{ tenant_id: TENANT_A_ID, role: "agent" }]);
      }
      if (url.pathname.endsWith("/crm_tenants")) {
        return Response.json([{ id: TENANT_A_ID, name: "Loja Alpha", status: "active" }]);
      }
      if (url.pathname.endsWith("/crm_channels")) {
        if (url.searchParams.get("tenant_id") === `eq.${TENANT_A_ID}`) {
          return Response.json([{ instance_name: "loja-alpha-ia" }]);
        }
        if (url.searchParams.get("instance_name") === "eq.loja-beta-ia") {
          return Response.json([{ tenant_id: TENANT_B_ID }]);
        }
      }
      return Response.json([]);
    };

    const checks = {
      verifyMaster: async () => ({ authorized: false, actor: "" }),
      verifyOperator: async () => ({ id: OPERATOR_A_ID, email: "operador@empresa-a.com", token: "token-a" }),
      rows: async <T>(path: string) => {
        if (path.startsWith("crm_tenant_memberships")) {
          return [{ tenant_id: TENANT_A_ID, role: "agent" }] as T;
        }
        if (path.startsWith("crm_tenants")) {
          return [{ id: TENANT_A_ID, name: "Loja Alpha", status: "active" }] as T;
        }
        return [] as T;
      }
    };

    try {
      // 1. Tentar autorizar a instância da Empresa B usando o escopo da Empresa A
      const resultCross = await authorizeCrmInstance(request, TENANT_A_ID, "loja-beta-ia", false, checks);
      assert.equal(resultCross, null, "Não pode autorizar envio por canal de outra empresa");

      // 2. Tentar adotar o nome de canal da Empresa B mesmo com allowNew=true
      const resultAdopt = await authorizeCrmInstance(request, TENANT_A_ID, "loja-beta-ia", true, checks);
      assert.equal(resultAdopt, null, "Não pode adotar nome de instância de outra loja");

      // 3. Instância própria da Empresa A é autorizada
      const resultOwn = await authorizeCrmInstance(request, TENANT_A_ID, "loja-alpha-ia", false, checks);
      assert.ok(resultOwn, "Instância própria da Empresa A deve ser permitida");
      assert.equal(resultOwn.tenant.id, TENANT_A_ID);
    } finally {
      globalThis.fetch = originalFetch;
      if (previousUrl === undefined) delete process.env.CRM_SUPABASE_URL;
      else process.env.CRM_SUPABASE_URL = previousUrl;
      if (previousKey === undefined) delete process.env.CRM_SUPABASE_SERVICE_ROLE_KEY;
      else process.env.CRM_SUPABASE_SERVICE_ROLE_KEY = previousKey;
    }
  });

  it("ownsCrmResource impede acesso a conversas, contatos e tags de outra empresa", async () => {
    const originalFetch = globalThis.fetch;
    const CONVERSATION_A = "33333333-3333-4333-8333-333333333333";
    const CONVERSATION_B = "44444444-4444-4444-8444-444444444444";

    const previousUrl = process.env.CRM_SUPABASE_URL;
    const previousKey = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY;
    process.env.CRM_SUPABASE_URL = "https://mock.supabase.co";
    process.env.CRM_SUPABASE_SERVICE_ROLE_KEY = "test-service-key-".repeat(4);

    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/crm_conversations")) {
        const tenantParam = url.searchParams.get("tenant_id");
        const idParam = url.searchParams.get("id");
        if (tenantParam === `eq.${TENANT_A_ID}` && idParam === `eq.${CONVERSATION_A}`) {
          return Response.json([{ id: CONVERSATION_A }]);
        }
        return Response.json([]);
      }
      return Response.json([]);
    };

    try {
      // Conversa da Empresa A consultada sob o Tenant A -> verdadeiro
      const ownsOwn = await ownsCrmResource(TENANT_A_ID, "crm_conversations", CONVERSATION_A);
      assert.equal(ownsOwn, true);

      // Conversa da Empresa B consultada sob o Tenant A -> falso
      const ownsCross = await ownsCrmResource(TENANT_A_ID, "crm_conversations", CONVERSATION_B);
      assert.equal(ownsCross, false, "Empresa A nunca deve possuir recurso da Empresa B");

      // Injeção de ID inválido / não-UUID -> falso imediato
      const invalidTenant = await ownsCrmResource("invalid-tenant-id", "crm_conversations", CONVERSATION_A);
      assert.equal(invalidTenant, false);
      const invalidResource = await ownsCrmResource(TENANT_A_ID, "crm_conversations", "../etc/passwd");
      assert.equal(invalidResource, false);
    } finally {
      globalThis.fetch = originalFetch;
      if (previousUrl === undefined) delete process.env.CRM_SUPABASE_URL;
      else process.env.CRM_SUPABASE_URL = previousUrl;
      if (previousKey === undefined) delete process.env.CRM_SUPABASE_SERVICE_ROLE_KEY;
      else process.env.CRM_SUPABASE_SERVICE_ROLE_KEY = previousKey;
    }
  });

  it("validação estrita de roles bloqueia operador de realizar ações administrativas na própria empresa", async () => {
    const request = new NextRequest(`http://localhost/api/crm/operator/settings?tenant=${TENANT_A_ID}`);
    const verifyMaster = async () => ({ authorized: false, actor: "" });

    // Operador comum (agent) na Empresa A
    const checks = {
      verifyMaster,
      verifyOperator: async () => ({ id: OPERATOR_A_ID, email: "agente@loja-alpha.com", token: "tok-agent" }),
      rows: async <T>(path: string) => {
        if (path.startsWith("crm_tenant_memberships")) {
          return [{ tenant_id: TENANT_A_ID, role: "agent" }] as T;
        }
        if (path.startsWith("crm_tenants")) {
          return [{ id: TENANT_A_ID, name: "Loja Alpha", status: "active" }] as T;
        }
        return [] as T;
      }
    };

    // Ação permitida para qualquer membro
    const access = await authorizeCrmTenant(request, TENANT_A_ID, undefined, checks);
    assert.ok(access, "Membro comum pode acessar visualização do tenant");

    // Ação que exige privilégio de 'admin' ou 'owner' deve falhar para role 'agent'
    const adminAccess = await authorizeCrmTenant(request, TENANT_A_ID, ["admin", "owner"], checks);
    assert.equal(adminAccess, null, "Operador sem papel admin/owner deve ser rejeitado");
  });

  it("regex TENANT_UUID rejeita tentativas de injeção, spoofing e bypass", () => {
    assert.equal(TENANT_UUID.test(TENANT_A_ID), true);
    assert.equal(TENANT_UUID.test(TENANT_B_ID), true);
    assert.equal(TENANT_UUID.test(""), false);
    assert.equal(TENANT_UUID.test("admin"), false);
    assert.equal(TENANT_UUID.test("1' OR '1'='1"), false);
    assert.equal(TENANT_UUID.test("../../../etc/passwd"), false);
    assert.equal(TENANT_UUID.test("null"), false);
    assert.equal(TENANT_UUID.test("undefined"), false);
    assert.equal(TENANT_UUID.test("00000000-0000-0000-0000-000000000000"), true);
  });
});
