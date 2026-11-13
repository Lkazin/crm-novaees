import { NextRequest } from "next/server";
import { requireTenantFeature } from "@/lib/crm/plans";
import { authorizeCrmTenant } from "@/lib/crm/tenant-access";
import { isAllowedOrigin, privateJson } from "@/lib/crm/supabase-server";
import {
  buildNextInterviewTurn,
  compileProfileFromInterview,
  INTERVIEW_STEPS,
  type InterviewMessage,
} from "@/lib/crm/onboarding-interviewer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getLlmConfig() {
  let omniUrl = process.env.AI_OPENAI_BASE_URL?.trim().replace(/\/$/, "") || "";
  if (omniUrl.includes("host.docker.internal") && (process.platform === "win32" || !process.env.DOCKER_CONTAINER)) {
    omniUrl = omniUrl.replace("host.docker.internal", "127.0.0.1");
  }
  const omniKey = process.env.AI_API_KEY?.trim() || "";
  return { omniUrl, omniKey };
}

export async function POST(request: NextRequest) {
  if (!isAllowedOrigin(request.headers.get("origin"), request.url)) {
    return privateJson({ error: "origin_forbidden" }, 403);
  }
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return privateJson({ error: "json_required" }, 415);
  }

  try {
    const body = await request.json();
    const tenantId = typeof body.tenantId === "string" ? body.tenantId.trim() : "";
    const action = body.action === "compile" ? "compile" : "chat";
    const storeName = typeof body.storeName === "string" && body.storeName.trim() ? body.storeName.trim() : "Sua Empresa";
    const interviewerName =
      typeof body.interviewerName === "string" && body.interviewerName.trim()
        ? body.interviewerName.trim()
        : "Maya (Consultora NovaesWeb)";
    const rawMessages: unknown[] = Array.isArray(body.messages) ? body.messages : [];
    const messages: InterviewMessage[] = rawMessages
      .filter((m: unknown): m is { role: string; content: string } => Boolean(m && typeof m === "object"))
      .map((m: { role: string; content: string }): InterviewMessage => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: typeof m.content === "string" ? m.content.trim() : "",
      }))
      .filter((m: InterviewMessage) => m.content.length > 0);

    if (!UUID.test(tenantId)) {
      return privateJson({ error: "invalid_tenant", message: "ID de empresa inválido." }, 400);
    }

    const access = await authorizeCrmTenant(request, tenantId);
    if (!access) {
      return privateJson({ error: "not_authorized", message: "Acesso não autorizado para esta empresa." }, 403);
    }

    const featureGuard = await requireTenantFeature(tenantId, "ai_chat");
    if (!featureGuard.allowed) {
      return privateJson(
        { error: featureGuard.errorCode, state: featureGuard.state, message: featureGuard.message },
        featureGuard.statusHttp,
      );
    }

    if (action === "compile") {
      const compiled = compileProfileFromInterview(messages, storeName);
      return privateJson({
        ok: true,
        profile: compiled,
      });
    }

    // Default structured interview flow
    const deterministicTurn = buildNextInterviewTurn(messages, interviewerName, storeName);

    // Optional natural transition enrichment via LLM if configured and still interviewing
    const { omniUrl, omniKey } = getLlmConfig();
    if (omniUrl && omniKey && messages.length > 0 && !deterministicTurn.readyToCompile) {
      try {
        const lastUserMessage = [...messages].reverse().find((m) => m.role === "user")?.content || "";
        const nextQuestionObj = INTERVIEW_STEPS[deterministicTurn.currentStep - 1];
        const baseNextQuestion = nextQuestionObj ? nextQuestionObj.question(interviewerName, storeName) : deterministicTurn.reply;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3500);
        const llmRes = await fetch(`${omniUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${omniKey}`,
          },
          body: JSON.stringify({
            model: "auto/best-chat",
            temperature: 0.4,
            max_tokens: 220,
            messages: [
              {
                role: "system",
                content: `Você é ${interviewerName}, especialista de onboarding da NovaesWeb configurando o atendimento da empresa "${storeName}". Confirme em 1 frase curta e simpática o que o lojista acabou de responder ("${lastUserMessage.slice(0, 200)}") e em seguida faça exatamente a próxima pergunta da etapa ${deterministicTurn.currentStep} de ${deterministicTurn.totalSteps}:\n\n${baseNextQuestion}`,
              },
              { role: "user", content: lastUserMessage },
            ],
          }),
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (llmRes.ok) {
          const data = await llmRes.json();
          const aiReply = data?.choices?.[0]?.message?.content?.trim();
          if (aiReply && aiReply.length > 20) {
            return privateJson({
              ok: true,
              reply: aiReply,
              currentStep: deterministicTurn.currentStep,
              totalSteps: deterministicTurn.totalSteps,
              readyToCompile: deterministicTurn.readyToCompile,
            });
          }
        }
      } catch {
        // Fallback to deterministic question
      }
    }

    return privateJson({
      ok: true,
      reply: deterministicTurn.reply,
      currentStep: deterministicTurn.currentStep,
      totalSteps: deterministicTurn.totalSteps,
      readyToCompile: deterministicTurn.readyToCompile,
    });
  } catch (e) {
    return privateJson(
      {
        error: "interviewer_failed",
        message: e instanceof Error ? e.message : "Erro ao processar etapa da entrevista.",
      },
      500,
    );
  }
}
