import { NextRequest } from "next/server";
import { isAllowedOrigin, privateJson } from "@/lib/crm/supabase-server";
import { verifyMasterRequest } from "@/lib/crm/master-auth";
import {
  verifyPhoneVerificationChallenge,
  saveMasterRecoveryPhoneConfig,
  maskPhone
} from "@/lib/crm/recovery-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isAllowedOrigin(request.headers.get("origin"), request.url)) return privateJson({ error: "forbidden" }, 403);
  const auth = await verifyMasterRequest(request);
  if (!auth.authorized) return privateJson({ error: "unauthorized" }, 401);

  try {
    const body = await request.json();
    const challengeId = typeof body.challengeId === "string" ? body.challengeId : "";
    const code = typeof body.code === "string" ? body.code.trim() : "";

    if (!challengeId || code.length !== 6) {
      return privateJson({ error: "invalid_input", message: "Informe o código de 6 dígitos recebido no WhatsApp." }, 400);
    }

    const verification = await verifyPhoneVerificationChallenge(challengeId, code);
    if (!verification.success || !verification.phone) {
      return privateJson({ error: verification.error || "invalid_code", message: "Código incorreto ou expirado." }, 400);
    }

    await saveMasterRecoveryPhoneConfig(verification.phone, true);

    return privateJson({
      ok: true,
      phone: verification.phone,
      maskedPhone: maskPhone(verification.phone),
      verified: true,
      message: `WhatsApp de recuperação Master verificado e atualizado com sucesso para ${maskPhone(verification.phone)}!`
    });
  } catch {
    return privateJson({ error: "internal_error", message: "Erro ao confirmar código de segurança." }, 500);
  }
}
