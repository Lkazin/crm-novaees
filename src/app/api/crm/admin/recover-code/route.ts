import { NextRequest, NextResponse } from "next/server";
import { isAllowedOrigin, privateJson } from "@/lib/crm/supabase-server";
import {
  MASTER_COOKIE_NAME,
  MASTER_SESSION_TTL_SEC,
  signMasterToken,
  saveMasterPassword
} from "@/lib/crm/master-auth";
import { getRedis } from "@/lib/crm/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin, request.url)) return privateJson({ error: "origin_forbidden" }, 403);

  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      request.headers.get("x-real-ip") ||
      "local_client";

    const body = await request.json().catch(() => ({}));
    const code = typeof body.code === "string" ? body.code.trim() : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword.trim() : "";
    const confirmPassword = typeof body.confirmPassword === "string" ? body.confirmPassword.trim() : "";

    if (!code || !/^\d{6}$/.test(code)) {
      return privateJson({
        error: "invalid_code_format",
        message: "O código de segurança deve conter exatamente 6 dígitos numéricos."
      }, 400);
    }

    if (!newPassword || newPassword.length < 8) {
      return privateJson({
        error: "password_too_short",
        message: "A nova senha deve ter pelo menos 8 caracteres."
      }, 400);
    }

    if (newPassword !== confirmPassword) {
      return privateJson({
        error: "password_mismatch",
        message: "A confirmação da nova senha não confere."
      }, 400);
    }

    const redis = getRedis();
    let otpPayloadRaw: string | null = null;
    try {
      if (redis.status === "ready") {
        otpPayloadRaw = await redis.get(`crm:master_otp:${code}`);
      }
    } catch {}

    if (!otpPayloadRaw) {
      return privateJson({
        error: "invalid_or_expired_code",
        message: "Código de segurança incorreto ou expirado. Verifique a mensagem no seu WhatsApp."
      }, 400);
    }

    // Save new master password in Redis cache
    await saveMasterPassword(newPassword);

    // Clean rate limit and invalidate used OTP
    try {
      if (redis.status === "ready") {
        await redis.del(`crm:master_otp:${code}`);
        await redis.del(`crm:master_active_otp:${ip}`);
        await redis.del(`crm:ratelimit:master_login:${ip}`);
      }
    } catch {}

    // Dispatch WhatsApp confirmation
    const masterPhone = process.env.MASTER_RECOVERY_PHONE || process.env.MASTER_NOTIFICATION_PHONE || "5551991189293";
    const evolutionUrl = (process.env.EVOLUTION_API_URL ?? "").replace(/\/+$/, "");
    const evolutionKey = process.env.EVOLUTION_API_KEY ?? "";
    const instance = process.env.EVOLUTION_INSTANCE || "novaesweb";

    if (evolutionUrl && evolutionKey) {
      const confirmMsg = `✅ *NovaesWeb CRM - Senha Master Atualizada*\n\nA senha de administrador Master foi redefinida com sucesso a partir do IP: ${ip}.\nSeu acesso administrativo foi desbloqueado com segurança.`;
      import("@/lib/agent/evolution").then(({ sendText }) => {
        sendText(masterPhone, confirmMsg, { evolutionUrl, evolutionKey, instance, sendFormat: "v2" }, instance).catch(() => {});
      }).catch(() => {});
    }

    // Issue Master session token
    const token = signMasterToken("master_admin", false);
    const response = NextResponse.json({
      success: true,
      role: "master",
      redirectTo: "/admin",
      message: "Acesso desbloqueado e senha atualizada com sucesso!"
    });

    const isSecure = request.nextUrl.protocol === "https:" &&
      !request.nextUrl.hostname.includes("localhost") &&
      !request.nextUrl.hostname.includes("127.0.0.1");

    response.cookies.set({
      name: MASTER_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: isSecure,
      sameSite: "lax",
      path: "/",
      maxAge: MASTER_SESSION_TTL_SEC
    });

    return response;
  } catch (err) {
    return privateJson({ error: err instanceof Error ? err.message : "recovery_failed" }, 500);
  }
}

