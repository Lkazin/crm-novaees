import { NextRequest } from "next/server";
import { requireTenantFeature } from "@/lib/crm/plans";
import { authorizeCrmTenant } from "@/lib/crm/tenant-access";
import { isAllowedOrigin, privateJson } from "@/lib/crm/supabase-server";
import { generateAnswer, StoreAiContext } from "@/lib/agent/ai";
import { AiConfig } from "@/lib/agent/config";
import { detectCustomerEscalation } from "@/lib/agent/escalation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getServiceConfig() {
  const url = process.env.CRM_SUPABASE_URL?.trim().replace(/\/$/, "") ?? "";
  const serviceKey = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  let omniUrl = process.env.AI_OPENAI_BASE_URL?.trim().replace(/\/$/, "") || "http://127.0.0.1:20128/v1";
  if (omniUrl.includes("host.docker.internal") && (process.platform === "win32" || !process.env.DOCKER_CONTAINER)) {
    omniUrl = omniUrl.replace("host.docker.internal", "127.0.0.1");
  }
  const omniKey = process.env.AI_API_KEY?.trim() || "";
  return { url, serviceKey, omniUrl, omniKey };
}

export async function POST(request: NextRequest) {
  if (!isAllowedOrigin(request.headers.get("origin"), request.url)) return privateJson({ error: "origin_forbidden" }, 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return privateJson({ error: "json_required" }, 415);

  try {

    const body = await request.json();
    const tenantId = typeof body.tenantId === "string" ? body.tenantId : "";
    const rawMsg = typeof body.message === "string" ? body.message : (typeof body.question === "string" ? body.question : "");
    const message = rawMsg.trim();
    const history = Array.isArray(body.history)
      ? body.history
      : (Array.isArray(body.context?.history) ? body.context.history : []);

    if (!UUID.test(tenantId)) return privateJson({ error: "invalid_tenant", message: "ID de empresa inválido." }, 400);
    if (!message || message.length < 1) return privateJson({ error: "empty_message", message: "Mensagem não pode ser vazia." }, 400);

    // Verify operator belongs to this tenant
    const access = await authorizeCrmTenant(request, tenantId);
    if (!access) return privateJson({ error: "not_authorized", message: "Acesso não autorizado para esta empresa." }, 403);
    const featureGuard = await requireTenantFeature(tenantId, "simulator");
    if (!featureGuard.allowed) return privateJson({ error: featureGuard.errorCode, state: featureGuard.state, message: featureGuard.message }, featureGuard.statusHttp);

    // Check for customer dissatisfaction / escalation first
    const escalation = detectCustomerEscalation(message);
    if (escalation.isEscalation) {
      return privateJson({
        answer: escalation.customerReply,
        reply: escalation.customerReply,
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
    if (!url || !serviceKey || !omniKey) return privateJson({ error: "simulator_not_configured", message: "Simulador de IA não configurado no servidor." }, 503);

    // 1. Fetch store name
    const rTenant = await fetch(url + `/rest/v1/crm_tenants?id=eq.${tenantId}&select=name`, {
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
      cache: "no-store"
    });
    const tenants = (await rTenant.json()) as Array<{ name: string }>;
    const defaultStoreName = tenants[0]?.name || "Nossa Loja";

    // 2. Fetch agent instructions & label
    const rAgent = await fetch(url + `/rest/v1/crm_agents?tenant_id=eq.${tenantId}&limit=1`, {
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
      cache: "no-store"
    });
    const agents = (await rAgent.json()) as Array<{ label: string; instructions: string; provider_route: string }>;
    const defaultAgentLabel = agents[0]?.label || "Assistente Virtual";
    const defaultInstructions = agents[0]?.instructions || "Atenda os clientes com simpatia, agilidade e clareza.";
    const preferredModel = agents[0]?.provider_route || "auto/best-chat";

    // 3. Fetch published knowledge articles (up to 20)
    const rArticles = await fetch(
      url + `/rest/v1/crm_knowledge_articles?tenant_id=eq.${tenantId}&status=eq.published&order=updated_at.desc&limit=20`,
      {
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
        cache: "no-store"
      }
    );
    const articles = (await rArticles.json()) as Array<{ title: string; body: string }>;
    const defaultStoreInfo = Array.isArray(articles)
      ? articles.map(a => `### ${a.title}\n${a.body}`).join("\n\n")
      : "";

    // 4. Fetch operating hours from crm_tenant_settings
    let operatingHours: StoreAiContext["operatingHours"] = undefined;
    try {
      const rSettings = await fetch(url + `/rest/v1/crm_tenant_settings?tenant_id=eq.${tenantId}&select=timezone,business_description&limit=1`, {
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
        cache: "no-store"
      });
      if (rSettings.ok) {
        const settings = (await rSettings.json()) as Array<{ timezone?: string; business_description: string }>;
        const dbTimezone = settings[0]?.timezone || "America/Sao_Paulo";
        const rawDesc = settings[0]?.business_description ?? "";
        if (rawDesc.startsWith("{")) {
          const parsed = JSON.parse(rawDesc);
          if (parsed.ai_settings?.operatingHours) {
            operatingHours = {
              timezone: dbTimezone,
              ...parsed.ai_settings.operatingHours
            };
          }
        }
      }
    } catch {}

    // 5. Merge draft context if passed (e.g. from setup wizard)
    const draftContext = body.context && typeof body.context === "object" ? body.context : {};
    const storeName = draftContext.storeName || defaultStoreName;
    const agentLabel = draftContext.agentLabel || defaultAgentLabel;
    const instructions = draftContext.instructions || defaultInstructions;
    const storeInfo = draftContext.storeInfo || defaultStoreInfo;

    const context: StoreAiContext = {
      storeName,
      agentLabel,
      instructions,
      storeInfo,
      history,
      primaryModel: preferredModel,
      operatingHours,
      allowFallback: true
    };

    const cfg: AiConfig = {
      aiUrl: omniUrl,
      aiKey: omniKey,
      aiModel: preferredModel.startsWith("auto") ? preferredModel : "auto/best-chat",
      systemPrompt: "Informações gerais da loja."
    };

    const startTime = Date.now();
    const answer = await generateAnswer(message, cfg, context);
    const latencyMs = Date.now() - startTime;

    return privateJson({
      answer,
      reply: answer,
      latencyMs,
      timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      isSimulation: true
    });
  } catch (e) {
    console.error("[operator-simulator-error]", e);
    return privateJson({
      error: "simulation_failed",
      message: e instanceof Error ? e.message : "Falha na comunicação com o simulador de IA."
    }, 500);
  }
}
