import { NextRequest } from "next/server";
import { isAllowedOrigin, privateJson, supabaseRows, verifyOperator } from "@/lib/crm/supabase-server";
import { generateAnswer, StoreAiContext } from "@/lib/agent/ai";
import { AiConfig } from "@/lib/agent/config";
import { detectCustomerEscalation } from "@/lib/agent/escalation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getServiceConfig() {
  const url = process.env.CRM_SUPABASE_URL?.trim().replace(/\/$/, "") ?? "";
  const serviceKey = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  const omniUrl = process.env.AI_OPENAI_BASE_URL?.trim().replace(/\/$/, "") || "http://host.docker.internal:20128/v1";
  const omniKey = process.env.AI_API_KEY?.trim() || "sk-9208b8c0f2bfd069-e12668-5717db14";
  return { url, serviceKey, omniUrl, omniKey };
}

export async function POST(request: NextRequest) {
  if (!isAllowedOrigin(request.headers.get("origin"), request.url)) return privateJson({ error: "origin_forbidden" }, 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return privateJson({ error: "json_required" }, 415);

  try {
    const operator = await verifyOperator();
    if (!operator) return privateJson({ error: "unauthorized" }, 401);

    const body = await request.json();
    const tenantId = typeof body.tenantId === "string" ? body.tenantId : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const history = Array.isArray(body.history) ? body.history : [];

    if (!UUID.test(tenantId)) return privateJson({ error: "invalid_tenant" }, 400);
    if (!message || message.length < 1) return privateJson({ error: "empty_message" }, 400);

    // Verify operator belongs to this tenant
    const members = await supabaseRows<Array<{ tenant_id: string }>>(
      "crm_tenant_memberships?select=tenant_id&tenant_id=eq." + tenantId + "&user_id=eq." + operator.id + "&limit=1",
      operator.token
    );
    if (!members.length) return privateJson({ error: "tenant_forbidden" }, 403);

    // Check for customer dissatisfaction / escalation first
    const escalation = detectCustomerEscalation(message);
    if (escalation.isEscalation) {
      return privateJson({
        answer: escalation.customerReply,
        isEscalation: true,
        escalationCategory: escalation.category,
        escalationReason: escalation.reason,
        sentiment: escalation.sentiment,
        latencyMs: 15,
        timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        isSimulation: true
      });
    }

    const { url, serviceKey, omniUrl, omniKey } = getServiceConfig();

    // 1. Fetch store name
    const rTenant = await fetch(url + `/rest/v1/crm_tenants?id=eq.${tenantId}&select=name`, {
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
      cache: "no-store"
    });
    const tenants = (await rTenant.json()) as Array<{ name: string }>;
    const storeName = tenants[0]?.name || "Nossa Loja";

    // 2. Fetch agent instructions
    const rAgent = await fetch(url + `/rest/v1/crm_agents?tenant_id=eq.${tenantId}&limit=1`, {
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
      cache: "no-store"
    });
    const agents = (await rAgent.json()) as Array<{ label: string; instructions: string; provider_route: string }>;
    const instructions = agents[0]?.instructions || "Atenda os clientes com simpatia, agilidade e clareza.";
    const preferredModel = agents[0]?.provider_route || "auto/best-chat";

    // 3. Fetch published knowledge articles
    const rArticles = await fetch(
      url + `/rest/v1/crm_knowledge_articles?tenant_id=eq.${tenantId}&status=eq.published&order=updated_at.desc&limit=5`,
      {
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
        cache: "no-store"
      }
    );
    const articles = (await rArticles.json()) as Array<{ title: string; body: string }>;
    const storeInfo = Array.isArray(articles)
      ? articles.map(a => `### ${a.title}\n${a.body}`).join("\n\n")
      : "";

    // 4. Build context
    const context: StoreAiContext = {
      storeName,
      instructions,
      storeInfo,
      history
    };

    const cfg: AiConfig = {
      aiUrl: omniUrl,
      aiKey: omniKey,
      aiModel: preferredModel.startsWith("auto/") ? preferredModel : "auto/best-chat",
      systemPrompt: "Informações gerais da loja."
    };

    const startTime = Date.now();
    const answer = await generateAnswer(message, cfg, context);
    const latencyMs = Date.now() - startTime;

    return privateJson({
      answer,
      latencyMs,
      timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      isSimulation: true
    });
  } catch (e) {
    return privateJson({ error: e instanceof Error ? e.message : "simulation_failed" }, 503);
  }
}
