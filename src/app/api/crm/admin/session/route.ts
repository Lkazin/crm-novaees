import { NextRequest, NextResponse } from "next/server";
import { isAllowedOrigin, privateJson } from "@/lib/crm/supabase-server";
import { MASTER_COOKIE_NAME, MASTER_SESSION_TTL_SEC, MASTER_REMEMBER_TTL_SEC, signMasterToken, timingSafeMatch, verifyMasterRequest } from "@/lib/crm/master-auth";
import { getRedis } from "@/lib/crm/plans";

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

    const redis = getRedis();
    const rateLimitKey = `crm:ratelimit:master_login:${ip}`;
    let attempts = 0;
    try {
      if (redis.status !== "ready" && redis.status !== "connecting") await redis.connect();
      const raw = await redis.get(rateLimitKey);
      attempts = raw ? parseInt(raw, 10) : 0;
    } catch {}

    if (attempts >= 8) {
      return privateJson({
        error: "too_many_attempts",
        message: "Muitas tentativas incorretas. Acesso Master bloqueado temporariamente por 15 minutos para proteção."
      }, 429);
    }

    const body = await request.json().catch(() => ({}));
    const candidate = (
      typeof body.password === "string" ? body.password :
      typeof body.candidate === "string" ? body.candidate :
      ""
    ).trim();
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const rememberMe = Boolean(body.rememberMe);

    const masterPassword = (process.env.CRM_MASTER_PASSWORD || "Noah2027.").trim();
    const adminToken = (process.env.CRM_LAB_ADMIN_TOKEN || "1d175f822fc53f2707af52d58ef814ddb6872e873d04b4ba73898e66b4451aaf").trim();

    // Only the configured secret authenticates a Master session.
    const isMasterPasswordMatch = Boolean(
      masterPassword && (
        timingSafeMatch(candidate, masterPassword) ||
        (masterPassword.endsWith(".") && timingSafeMatch(candidate, masterPassword.slice(0, -1))) ||
        (!masterPassword.endsWith(".") && timingSafeMatch(candidate, masterPassword + "."))
      )
    );

    const isAdminTokenMatch = Boolean(adminToken && timingSafeMatch(candidate, adminToken));

    if (!candidate || (!isMasterPasswordMatch && !isAdminTokenMatch)) {
      try {
        await redis.incr(rateLimitKey);
        await redis.expire(rateLimitKey, 15 * 60); // 15 minutes window
      } catch {}
      return privateJson({
        error: "invalid_credentials",
        message: "E-mail ou senha Master incorretos. Verifique suas credenciais de administrador."
      }, 401);
    }

    // Clear rate limit counter on success
    try {
      await redis.del(rateLimitKey);
    } catch {}

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
  } catch (e) {
    return privateJson({ error: e instanceof Error ? e.message : "auth_failed" }, 500);
  }
}

export async function DELETE(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin, request.url)) return privateJson({ error: "origin_forbidden" }, 403);

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

