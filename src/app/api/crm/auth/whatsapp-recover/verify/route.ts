import { NextRequest } from "next/server";
import { isAllowedOrigin, privateJson } from "@/lib/crm/supabase-server";
import { verifyRecoveryChallenge } from "@/lib/crm/recovery-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isAllowedOrigin(request.headers.get("origin"), request.url)) {
    return privateJson({ error: "forbidden" }, 403);
  }
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return privateJson({ error: "json_required" }, 415);
  }

  try {
    const body = await request.json();
    const challengeId = typeof body.challengeId === "string" ? body.challengeId : "";
    const code = typeof body.code === "string" ? body.code.trim() : "";

    if (!challengeId || code.length !== 6) {
      return privateJson({ error: "invalid_input", message: "Informe o código de segurança de 6 dígitos recebido no seu WhatsApp." }, 400);
    }

    const verification = await verifyRecoveryChallenge(challengeId, code);

    if (!verification.success) {
      if (verification.error === "invalid_code") {
        return privateJson({
          error: "invalid_code",
          attemptsRemaining: verification.attemptsRemaining,
          message: `Código incorreto. Você ainda tem ${verification.attemptsRemaining} tentativa(s) antes do bloqueio.`
        }, 400);
      }
      if (verification.error === "max_attempts_exceeded") {
        return privateJson({
          error: "max_attempts_exceeded",
          message: "Número máximo de tentativas excedido para este código. Por favor, solicite um novo código de recuperação."
        }, 429);
      }
      if (verification.error === "code_expired") {
        return privateJson({
          error: "code_expired",
          message: "Este código expirou (validade de 10 minutos). Solicite um novo código para continuar."
        }, 400);
      }
      return privateJson({
        error: "verification_failed",
        message: "Não foi possível validar este código ou ele já foi utilizado."
      }, 400);
    }

    return privateJson({
      ok: true,
      ticket: verification.ticket,
      message: "Código validado com sucesso! Agora defina sua nova senha definitiva."
    });
  } catch (err) {
    console.error("[whatsapp-recover-verify-err]", err);
    return privateJson({ error: "internal_error", message: "Falha ao validar código de recuperação." }, 500);
  }
}

