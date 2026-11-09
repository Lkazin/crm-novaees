import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { signMasterToken } from "./master-auth";
import { POST as operatorSend } from "../../app/api/crm/operator/send/route";
import { POST as operatorSimulator } from "../../app/api/crm/operator/simulator/route";

const TENANT_ID = "3298bdbe-c84e-4121-b363-a6c180c87cfa";
const CONV_ID = "1895ecfa-c14a-4e58-bcbc-db8ef5f3ce89";

describe("Operator Send & AI Simulator - Correções e Resiliência", () => {
  process.env.CRM_SUPABASE_URL = "https://mpteambmrlflllfqtkmq.supabase.co";
  process.env.CRM_SUPABASE_SERVICE_ROLE_KEY = "sb_secret_fixture_key_longer_than_thirty_chars_long";
  process.env.CRM_SUPABASE_PUBLISHABLE_KEY = "sb_pub_fixture_key_longer_than_twenty_chars";
  process.env.AI_API_KEY = "mock-ai-key";
  process.env.AI_OPENAI_BASE_URL = "http://127.0.0.1:20128/v1";

  const defaultMockFetch = async (input: RequestInfo | URL) => {
    const urlStr = String(input);
    if (urlStr.includes("crm_tenant_settings")) {
      return new Response(JSON.stringify([{
        business_description: JSON.stringify({
          plan: { planId: "crm-premium", name: "CRM Premium", status: "paid" },
          ai_settings: {}
        })
      }]), { status: 200 });
    }
    if (urlStr.includes("crm_tenants")) {
      return new Response(JSON.stringify([{ id: TENANT_ID, name: "NovaesWeb", status: "active" }]), { status: 200 });
    }
    if (urlStr.includes("crm_conversations?id=eq.")) {
      return new Response(JSON.stringify([{ id: CONV_ID, contact_id: "22222222-2222-4222-8222-222222222222", channel_id: "33333333-3333-4333-8333-333333333333" }]), { status: 200 });
    }
    if (urlStr.includes("crm_contacts?id=eq.")) {
      return new Response(JSON.stringify([{ id: "22222222-2222-4222-8222-222222222222", phone: "5511999999999", display_name: "Cliente" }]), { status: 200 });
    }
    if (urlStr.includes("crm_channels?id=eq.")) {
      // Channel is disconnected!
      return new Response(JSON.stringify([{ instance_name: "loja_pizza", status: "disconnected" }]), { status: 200 });
    }
    if (urlStr.includes("crm_channels?tenant_id=eq.")) {
      // No active connected channels
      return new Response(JSON.stringify([{ id: "33333333-3333-4333-8333-333333333333", instance_name: "loja_pizza", status: "disconnected" }]), { status: 200 });
    }
    if (urlStr.includes("crm_agents")) {
      return new Response(JSON.stringify([{ label: "Assistente Teste", instructions: "Instruções", provider_route: "auto/best-chat" }]), { status: 200 });
    }
    if (urlStr.includes("crm_knowledge_articles")) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (urlStr.includes("/chat/completions")) {
      return new Response(JSON.stringify({
        choices: [{ message: { content: "Olá! Esta é uma resposta de teste da IA." } }]
      }), { status: 200 });
    }
    return new Response(JSON.stringify([]), { status: 200 });
  };

  it("Operator Send rejeita com mensagem clara em português se nenhum canal estiver conectado", async () => {
    process.env.CRM_MASTER_SESSION_SECRET = "fixture-session-secret-".repeat(3);
    const masterCookie = signMasterToken("master_admin");
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = defaultMockFetch;

      const req = new NextRequest("http://localhost:3040/api/crm/operator/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: `nw_master_session=${masterCookie}` },
        body: JSON.stringify({ tenantId: TENANT_ID, conversationId: CONV_ID, message: "Olá cliente" })
      });

      const res = await operatorSend(req);
      assert.equal(res.status, 403);
      const json = await res.json();
      assert.equal(json.error, "channel_unavailable_or_locked");
      assert.ok(json.message.includes("WhatsApp desta empresa está desconectado"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("Operator Simulator responde com answer e reply e aceita context de rascunho", async () => {
    process.env.CRM_MASTER_SESSION_SECRET = "fixture-session-secret-".repeat(3);
    const masterCookie = signMasterToken("master_admin");
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = defaultMockFetch;

      const req = new NextRequest("http://localhost:3040/api/crm/operator/simulator", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: `nw_master_session=${masterCookie}` },
        body: JSON.stringify({
          tenantId: TENANT_ID,
          message: "Qual o horário de atendimento?",
          history: []
        })
      });

      const res = await operatorSimulator(req);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.ok(json.answer);
      assert.equal(json.reply, json.answer);
      assert.equal(json.isSimulation, true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("Operator Simulator detecta intenção de escalação humana e responde instantaneamente", async () => {
    process.env.CRM_MASTER_SESSION_SECRET = "fixture-session-secret-".repeat(3);
    const masterCookie = signMasterToken("master_admin");
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = defaultMockFetch;

      const req = new NextRequest("http://localhost:3040/api/crm/operator/simulator", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: `nw_master_session=${masterCookie}` },
        body: JSON.stringify({
          tenantId: TENANT_ID,
          message: "Quero falar com um humano agora mesmo, cancela meu pedido",
          history: []
        })
      });

      const res = await operatorSimulator(req);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.isEscalation, true);
      assert.ok(json.answer);
      assert.equal(json.reply, json.answer);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
