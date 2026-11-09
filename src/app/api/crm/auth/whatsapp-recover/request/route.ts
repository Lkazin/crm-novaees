import { NextRequest } from "next/server";
import { isAllowedOrigin, privateJson } from "@/lib/crm/supabase-server";
import {
  getMasterRecoveryPhoneConfig,
  findUserRecoveryPhoneByEmail,
  createRecoveryChallenge
} from "@/lib/crm/recovery-store";

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
    const scope = body.scope === "master" ? "master" : "client";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    if (scope === "master") {
      const masterConfig = await getMasterRecoveryPhoneConfig();
      if (!masterConfig.phone) {
        return privateJson({
          error: "no_recovery_phone",
          message: "Nenhum WhatsApp de recuperação cadastrado para a administração Master. Utilize as credenciais do ambiente ou contate a equipe técnica."
        }, 400);
      }

      const challenge = await createRecoveryChallenge("master", "master", masterConfig.phone);
      if (!challenge.success) {
        return privateJson({ error: "challenge_creation_failed", message: "Não foi possível gerar o código de recuperação." }, 500);
      }

      return privateJson({
        ok: true,
        challengeId: challenge.challengeId,
        maskedPhone: challenge.maskedPhone,
        message: `Código de verificação de 6 dígitos enviado para ${challenge.maskedPhone}.`
      });
    }

    // Client Scope
    if (!email || !email.includes("@")) {
      return privateJson({ error: "invalid_email", message: "Informe um e-mail válido para localizar sua conta." }, 400);
    }

    const userInfo = await findUserRecoveryPhoneByEmail(email);
    if (!userInfo || !userInfo.phone || !userInfo.verified) {
      return privateJson({
        error: "phone_not_configured_or_unverified",
        message: "Não encontramos um WhatsApp de recuperação previamente verificado para este e-mail. Utilize a recuperação padrão por e-mail ou solicite auxílio ao administrador da sua loja."
      }, 404);
    }

    const challenge = await createRecoveryChallenge("client", email, userInfo.phone, userInfo.userId);
    if (!challenge.success) {
      return privateJson({ error: "challenge_creation_failed", message: "Não foi possível enviar o código para o seu WhatsApp." }, 500);
    }

    return privateJson({
      ok: true,
      challengeId: challenge.challengeId,
      maskedPhone: challenge.maskedPhone,
      message: `Código de verificação de 6 dígitos enviado para ${challenge.maskedPhone}.`
    });
  } catch (err) {
    console.error("[whatsapp-recover-request-err]", err);
    return privateJson({ error: "internal_error", message: "Falha ao processar solicitação de recuperação." }, 500);
  }
}

