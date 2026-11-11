import { NextRequest, NextResponse } from "next/server";
import { isAllowedOrigin, privateJson } from "@/lib/crm/supabase-server";
import {
  MASTER_COOKIE_NAME,
  MASTER_SESSION_TTL_SEC,
  MASTER_REMEMBER_TTL_SEC,
  signMasterToken,
  timingSafeMatch,
  verifyMasterRequest,
  revokeMasterToken,
  getDynamicMasterPassword,
  getMasterPassword,
  getStoredMasterSecret,
  verifyMasterPasswordCandidate,
  migrateMasterPasswordToHash,
  getLegacyAdminToken,
  isLoginBlocked,
  recordFailedLoginAttempt,
  resetLoginAttempts
} from "@/lib/crm/master-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { authorized, actor } = await verifyMasterRequest(request);
    return privateJson({ authenticated: authorized, actor: authorized ? actor : undefined });
  } catch {
    return privateJson({ authenticated: false }, 200);
  }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin, request.url)) return privateJson({ error: "origin_forbidden" }, 403);

  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      request.headers.get("x-real-ip") ||
      "local_client";

    const body = await request.json().catch(() => ({}));
    const candidate = (
      typeof body.password === "string" ? body.password :
      typeof body.candidate === "string" ? body.candidate :
      ""
    ).trim();
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const rememberMe = Boolean(body.rememberMe);

    const masterPassword = await getDynamicMasterPassword();
    const legacyPass = getMasterPassword();
    const adminToken = getLegacyAdminToken();

    // Check credentials match with case tolerance and optional dot
    const checkMatch = (pw: string) => Boolean(
      pw && (
        timingSafeMatch(candidate, pw) ||
        (pw.endsWith(".") && timingSafeMatch(candidate, pw.slice(0, -1))) ||
        (!pw.endsWith(".") && timingSafeMatch(candidate, pw + ".")) ||
        timingSafeMatch(candidate.toLowerCase(), pw.toLowerCase()) ||
        (pw.endsWith(".") && timingSafeMatch(candidate.toLowerCase(), pw.slice(0, -1).toLowerCase()))
      )
    );

    // A senha master no Redis agora e hash: verifica sem nunca ler o texto puro.
    const storedSecret = await getStoredMasterSecret();
    const isMasterPasswordMatch =
      (storedSecret ? verifyMasterPasswordCandidate(candidate, storedSecret) : false) ||
      (masterPassword ? checkMatch(masterPassword) : false) ||
      (legacyPass && legacyPass !== masterPassword ? checkMatch(legacyPass) : false);

    // Migracao transparente: se ainda havia texto puro no Redis, vira hash.
    if (isMasterPasswordMatch && storedSecret && !storedSecret.startsWith("scrypt:")) {
      await migrateMasterPasswordToHash();
    }
    const isAdminTokenMatch = Boolean(adminToken && timingSafeMatch(candidate, adminToken));

    // If master password is correct, immediately reset attempts and unblock
    if (candidate && (isMasterPasswordMatch || isAdminTokenMatch)) {
      await resetLoginAttempts(ip, true);

      const actor = "master_admin";
      const token = signMasterToken(actor, rememberMe);
      const response = NextResponse.json({ authenticated: true, actor, email: email || undefined });

      const isSecure = request.nextUrl.protocol === "https:" &&
        !request.nextUrl.hostname.includes("localhost") &&
        !request.nextUrl.hostname.includes("127.0.0.1");

      const maxAge = rememberMe ? MASTER_REMEMBER_TTL_SEC : MASTER_SESSION_TTL_SEC;

      response.cookies.set({
        name: MASTER_COOKIE_NAME,
        value: token,
        httpOnly: true,
        secure: isSecure,
        sameSite: "lax",
        path: "/",
        maxAge
      });

      response.cookies.set("nw_crm_session", "", {
        httpOnly: true,
        sameSite: "lax",
        secure: isSecure,
        path: "/",
        maxAge: 0
      });

      return response;
    }

    // Check if currently blocked
    const blockCheck = await isLoginBlocked(ip, true);
    if (blockCheck.blocked) {
      return privateJson({
        error: "too_many_attempts",
        blocked: true,
        canRecoverViaWhatsapp: true,
        message: "Acesso Master bloqueado temporariamente por 15 minutos após 5 tentativas incorretas. Enviamos um código de segurança de 6 dígitos para seu WhatsApp oficial."
      }, 429);
    }

    // Record failed attempt
    const failResult = await recordFailedLoginAttempt(ip, true);
    if (failResult.blocked) {
      return privateJson({
        error: "too_many_attempts",
        blocked: true,
        canRecoverViaWhatsapp: true,
        message: "Acesso Master bloqueado temporariamente por 15 minutos após 5 tentativas incorretas. Enviamos um código de segurança de 6 dígitos para seu WhatsApp oficial."
      }, 429);
    }

    const remaining = Math.max(0, 5 - failResult.attempts);
    return privateJson({
      error: "invalid_credentials",
      message: `Credenciais de administrador inválidas. Acesso restrito ao Painel Master da NovaesWeb.${remaining > 0 ? ` (${remaining} tentativa${remaining === 1 ? "" : "s"} restante${remaining === 1 ? "" : "s"} antes do bloqueio)` : ""}`
    }, 401);
  } catch (e) {
    return privateJson({ error: e instanceof Error ? e.message : "auth_failed" }, 500);
  }
}

export async function DELETE(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin, request.url)) return privateJson({ error: "origin_forbidden" }, 403);

  const sessionCookie = request.cookies.get(MASTER_COOKIE_NAME)?.value;
  if (sessionCookie) {
    await revokeMasterToken(sessionCookie);
  }

  const response = NextResponse.json({ authenticated: false });
  response.cookies.set({
    name: MASTER_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0
  });
  return response;
}
