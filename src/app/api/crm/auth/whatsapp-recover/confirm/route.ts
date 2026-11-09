import { NextRequest, NextResponse } from "next/server";
import { isAllowedOrigin, privateJson } from "@/lib/crm/supabase-server";
import { applyDefinitivePasswordReset } from "@/lib/crm/recovery-store";
import { MASTER_COOKIE_NAME, MASTER_SESSION_TTL_SEC, signMasterToken } from "@/lib/crm/master-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "127.0.0.1";
}

export async function POST(request: NextRequest) {
  if (!isAllowedOrigin(request.headers.get("origin"), request.url)) {
    return privateJson({ error: "forbidden" }, 403);
  }
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return privateJson({ error: "json_required" }, 415);
  }

  try {
    const body = await request.json();
    const ticket = typeof body.ticket === "string" ? body.ticket : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

    if (!ticket) {
      return privateJson({ error: "missing_ticket", message: "Credencial de recuperação inválida ou ausente." }, 400);
    }

    if (!newPassword || newPassword.length < 8) {
      return privateJson({ error: "weak_password", message: "A nova senha deve possuir pelo menos 8 caracteres." }, 400);
    }
    if (newPassword.length > 256) {
      return privateJson({ error: "password_too_long", message: "A nova senha não pode exceder 256 caracteres." }, 400);
    }

    const ip = getClientIp(request);
    const resetResult = await applyDefinitivePasswordReset(ticket, newPassword, ip);

    if (!resetResult.success) {
      if (resetResult.error === "ticket_expired") {
        return privateJson({ error: "ticket_expired", message: "Sua sessão de recuperação expirou. Solicite um novo código no WhatsApp." }, 400);
      }
      return privateJson({ error: "reset_failed", message: "Não foi possível redefinir a senha. Tente novamente." }, 400);
    }

    // If master, automatically sign session so they can enter /admin
    if (resetResult.scope === "master") {
      const masterToken = signMasterToken("master_admin");
      const isHttps = request.nextUrl.protocol === "https:" &&
        !request.nextUrl.hostname.includes("localhost") &&
        !request.nextUrl.hostname.includes("127.0.0.1");

      const response = NextResponse.json({
        success: true,
        scope: "master",
        redirectTo: "/admin",
        message: "Senha de Administrador Master redefinida com sucesso! Esta nova senha é definitiva."
      });

      response.cookies.set({
        name: MASTER_COOKIE_NAME,
        value: masterToken,
        httpOnly: true,
        secure: isHttps,
        sameSite: "lax",
        path: "/",
        maxAge: MASTER_SESSION_TTL_SEC
      });

      return response;
    }

    return privateJson({
      success: true,
      scope: "client",
      redirectTo: "/",
      message: "Senha da sua loja redefinida com sucesso! Esta nova senha é definitiva e nunca expirará automaticamente. Você já pode fazer login."
    });
  } catch (err) {
    console.error("[whatsapp-recover-confirm-err]", err);
    return privateJson({ error: "internal_error", message: "Falha ao aplicar nova senha definitiva." }, 500);
  }
}

