import { NextRequest } from "next/server";
import { isAllowedOrigin, privateJson } from "@/lib/crm/supabase-server";
import { verifyMasterRequest } from "@/lib/crm/master-auth";
import {
  getMasterRecoveryPhoneConfig,
  createPhoneVerificationChallenge
} from "@/lib/crm/recovery-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isAllowedOrigin(request.headers.get("origin"), request.url)) return privateJson({ error: "forbidden" }, 403);
  const auth = await verifyMasterRequest(request);
  if (!auth.authorized) return privateJson({ error: "unauthorized" }, 401);

  const config = await getMasterRecoveryPhoneConfig();
  return privateJson({
    phone: config.phone,
    maskedPhone: config.masked,
    verified: config.verified
  });
}

export async function POST(request: NextRequest) {
  if (!isAllowedOrigin(request.headers.get("origin"), request.url)) return privateJson({ error: "forbidden" }, 403);
  const auth = await verifyMasterRequest(request);
  if (!auth.authorized) return privateJson({ error: "unauthorized" }, 401);

  try {
    const body = await request.json();
    const newPhone = typeof body.newPhone === "string" ? body.newPhone.trim() : "";

    if (!newPhone || newPhone.replace(/\D/g, "").length < 10) {
      return privateJson({ error: "invalid_phone", message: "Informe um número de WhatsApp válido com DDD." }, 400);
    }

    const challenge = await createPhoneVerificationChallenge("master", "master", newPhone);
    if (!challenge.success) {
      return privateJson({ error: "challenge_failed", message: challenge.error || "Não foi possível enviar o código." }, 400);
    }

    return privateJson({
      ok: true,
      challengeId: challenge.challengeId,
      maskedPhone: challenge.maskedPhone,
      message: `Código de verificação enviado para ${challenge.maskedPhone}. Digite-o para confirmar o novo número.`
    });
  } catch {
    return privateJson({ error: "internal_error", message: "Erro ao processar alteração de telefone." }, 500);
  }
}
