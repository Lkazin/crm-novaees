import { NextRequest } from "next/server";
import crypto from "crypto";
import { isAllowedOrigin, privateJson } from "@/lib/crm/supabase-server";
import { extractClientIp } from "@/lib/crm/master-auth";
import { getRedis } from "@/lib/crm/plans";
import {
  getMasterRecoveryPhoneConfig,
  findUserRecoveryPhoneByEmail,
  createRecoveryChallenge
} from "@/lib/crm/recovery-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const recoveryReqLimiter = new Map<string, { count: number; resetAt: number }>();

async function isRecoveryRequestRateLimited(ip: string): Promise<boolean> {
  const now = Date.now();
  const entry = recoveryReqLimiter.get(ip);
  if (entry && entry.resetAt > now) {
    if (entry.count >= 5) return true;
    entry.count += 1;
  } else {
    recoveryReqLimiter.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
  }
  try {
    const redis = getRedis();
    if (process.env.CRM_REDIS_URL && redis.status !== "ready" && redis.status !== "connecting" && redis.status !== "end") {
      await redis.connect().catch(() => {});
    }
    if (redis.status === "ready") {
      const key = `crm:ratelimit:wa_recover_req:${ip}`;
      const n = await redis.incr(key);
      if (n === 1) await redis.expire(key, 15 * 60);
      if (n > 5) return true;
    }
  } catch {}
  return false;
}

export async function POST(request: NextRequest) {
  if (!isAllowedOrigin(request.headers.get("origin"), request.url)) {
    return privateJson({ error: "forbidden" }, 403);
  }
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return privateJson({ error: "json_required" }, 415);
  }

  try {
    const ip = extractClientIp(request);
    if (await isRecoveryRequestRateLimited(ip)) {
      return privateJson({
        error: "too_many_requests",
        message: "Muitas solicitações de código em sequência. Aguarde alguns minutos."
      }, 429);
    }

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

    // Client Scope (generic response prevents email/phone enumeration)
    if (!email || !email.includes("@")) {
      return privateJson({ error: "invalid_email", message: "Informe um e-mail válido para localizar sua conta." }, 400);
    }

    const userInfo = await findUserRecoveryPhoneByEmail(email);
    if (!userInfo || !userInfo.phone || !userInfo.verified) {
      return privateJson({
        ok: true,
        challengeId: crypto.randomUUID(),
        maskedPhone: "seu WhatsApp cadastrado",
        message: "Se este e-mail possuir um WhatsApp de recuperação verificado, enviaremos um código de 6 dígitos."
      });
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
  } catch {
    return privateJson({ error: "internal_error", message: "Falha ao processar solicitação de recuperação." }, 500);
  }
}

