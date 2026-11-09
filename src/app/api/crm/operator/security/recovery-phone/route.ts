import { NextRequest } from "next/server";
import { isAllowedOrigin, privateJson, verifyOperator } from "@/lib/crm/supabase-server";
import {
  getClientRecoveryPhoneConfig,
  createPhoneVerificationChallenge
} from "@/lib/crm/recovery-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isAllowedOrigin(request.headers.get("origin"), request.url)) return privateJson({ error: "forbidden" }, 403);
  const user = await verifyOperator();
  if (!user?.id) return privateJson({ error: "unauthorized" }, 401);

  const config = await getClientRecoveryPhoneConfig(user.id);
  return privateJson({
    phone: config.phone,
    maskedPhone: config.masked,
    verified: config.verified
  });
}

export async function POST(request: NextRequest) {
  if (!isAllowedOrigin(request.headers.get("origin"), request.url)) return privateJson({ error: "forbidden" }, 403);
  const user = await verifyOperator();
  if (!user?.id) return privateJson({ error: "unauthorized" }, 401);

  try {
    const body = await request.json();
    const newPhone = typeof body.newPhone === "string" ? body.newPhone.trim() : "";

    if (!newPhone || newPhone.replace(/\D/g, "").length < 10) {
      return privateJson({ error: "invalid_phone", message: "Informe um número de WhatsApp válido com DDD." }, 400);
    }

    const challenge = await createPhoneVerificationChallenge(user.id, "client", newPhone);
    if (!challenge.success) {
      return privateJson({ error: "challenge_failed", message: challenge.error || "Não foi possível enviar o código." }, 400);
    }

    return privateJson({
      ok: true,
      challengeId: challenge.challengeId,
      maskedPhone: challenge.maskedPhone,
      message: `Código de verificação enviado para ${challenge.maskedPhone}. Digite-o para ativar a recuperação de senha.`
    });
  } catch {
    return privateJson({ error: "internal_error", message: "Erro ao processar solicitação de segurança." }, 500);
  }
}
