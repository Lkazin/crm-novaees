import { NextRequest } from "next/server";
import { authorizeCrmTenant } from "@/lib/crm/tenant-access";
import { isAllowedOrigin, privateJson, supabaseSettings } from "@/lib/crm/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin, request.url)) return privateJson({ error: "origin_forbidden" }, 403);

  try {
    const body = await request.json().catch(() => ({}));
    const tenantId = typeof body.tenantId === "string" ? body.tenantId : "";
    const conversationId = typeof body.conversationId === "string" ? body.conversationId : "";

    if (!UUID.test(tenantId) || !UUID.test(conversationId)) {
      return privateJson({ error: "invalid_request" }, 400);
    }

    const access = await authorizeCrmTenant(request, tenantId);
    if (!access) return privateJson({ error: "unauthorized" }, 401);

    const { url, key } = supabaseSettings();
    const secret = (process.env.CRM_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim() || key;
    if (!secret) return privateJson({ error: "supabase_unconfigured" }, 503);

    // Fetch conversation messages
    const rMsgs = await fetch(
      `${url}/rest/v1/crm_messages?conversation_id=eq.${conversationId}&select=direction,sender_type,body,created_at&order=created_at.desc&limit=25`,
      {
        headers: { apikey: secret, Authorization: `Bearer ${secret}` },
        cache: "no-store",
        signal: AbortSignal.timeout(8000)
      }
    );

    if (!rMsgs.ok) return privateJson({ error: "messages_fetch_failed" }, 500);
    const msgs = ((await rMsgs.json()) as Array<{ direction: string; sender_type: string; body: string; created_at: string }>).reverse();

    if (!msgs || msgs.length === 0) {
      return privateJson({
        summary: "Nenhuma mensagem encontrada nesta conversa para gerar resumo."
      });
    }

    const transcript = msgs
      .map(m => {
        const sender = m.direction === "inbound" ? "Cliente" : m.sender_type === "agent" ? "IA" : "Atendente";
        return `${sender}: ${m.body}`;
      })
      .join("\n");

    // Call AI to summarize
    const aiUrl = (process.env.AGENT_AI_URL || process.env.AI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai/").replace(/\/+$/, "");
    const aiKey = process.env.AGENT_AI_KEY || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || "";
    const aiModel = process.env.AGENT_AI_MODEL || "gemini-1.5-flash";

    let summaryText = "";

    if (aiKey && aiUrl) {
      try {
        const rAi = await fetch(`${aiUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${aiKey}`
          },
          body: JSON.stringify({
            model: aiModel,
            messages: [
              {
                role: "system",
                content:
                  "Você é um assistente de CRM de atendimento ao cliente. Analise a conversa a seguir e gere um resumo conciso, claro e objetivo em 3 tópicos claros:\n• Objetivo / O que o cliente deseja\n• O que já foi respondido / combinado\n• Próximo passo ou pendência\nSeja direto e use no máximo 4 linhas."
              },
              {
                role: "user",
                content: `Aqui está o histórico das últimas mensagens:\n\n${transcript}\n\nGere o resumo:`
              }
            ],
            temperature: 0.3,
            max_tokens: 300
          }),
          signal: AbortSignal.timeout(12000)
        });

        if (rAi.ok) {
          const aiJson = await rAi.json();
          summaryText = aiJson.choices?.[0]?.message?.content?.trim() || "";
        }
      } catch (aiErr) {
        console.warn("[ai-summary] Call failed:", aiErr);
      }
    }

    if (!summaryText) {
      // Fallback deterministic summary
      const clientMsgs = msgs.filter(m => m.direction === "inbound");
      const lastClientMsg = clientMsgs[clientMsgs.length - 1]?.body || "Sem mensagens recentes";
      summaryText = `• Última interação do cliente: "${lastClientMsg.slice(0, 100)}"\n• Total de mensagens trocadas: ${msgs.length}\n• Status: Conversa aguardando continuidade do atendimento.`;
    }

    return privateJson({ ok: true, summary: summaryText, messageCount: msgs.length });
  } catch (e) {
    return privateJson({ error: e instanceof Error ? e.message : "summary_error" }, 500);
  }
}
