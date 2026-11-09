import { NextRequest, NextResponse } from "next/server";
import { isAllowedOrigin, privateJson, sessionCookieName, supabaseSettings, verifyOperator, supabaseRows } from "@/lib/crm/supabase-server";
import {
  MASTER_COOKIE_NAME,
  MASTER_SESSION_TTL_SEC,
  MASTER_REMEMBER_TTL_SEC,
  signMasterToken,
  timingSafeMatch,
  verifyMasterRequest,
  getMasterPassword,
  getDynamicMasterPassword,
  getLegacyAdminToken,
  revokeMasterToken,
  dispatchMasterRecoveryOtp
} from "@/lib/crm/master-auth";
import { getRedis } from "@/lib/crm/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Staff = { role: string; enabled: boolean };
type Membership = { tenant_id: string; role: string };
type Tenant = { id: string; name: string; status: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/crm/auth/session
 * Identifies currently logged-in user and returns their verified role and destination.
 */
export async function GET(request: NextRequest) {
  try {
    const scope = request.nextUrl.searchParams.get("scope") || "";

    // If caller explicitly asked for client verification only:
    if (scope === "client") {
      const operator = await verifyOperator();
      if (operator) {
        try {
          const memberships = await supabaseRows<Membership[]>(
            `crm_tenant_memberships?select=tenant_id,role&is_active=eq.true&user_id=eq.${encodeURIComponent(operator.id)}`,
            operator.token
          );
          const tenantIds = memberships.map(m => m.tenant_id).filter(id => UUID.test(id));
          if (tenantIds.length > 0) {
            const tenants = await supabaseRows<Tenant[]>(
              `crm_tenants?select=id,name,status&id=in.(${tenantIds.join(",")})&status=eq.active`,
              operator.token
            );
            if (tenants.length > 0) {
              return privateJson({
                authenticated: true,
                role: "client",
                actor: operator.email || operator.id,
                tenants,
                redirectTo: "/cliente"
              });
            }
          }
        } catch {}
      }
      return privateJson({ authenticated: false });
    }

    // If caller explicitly asked for master verification only:
    if (scope === "master") {
      const masterAuth = await verifyMasterRequest(request);
      if (masterAuth.authorized) {
        return privateJson({
          authenticated: true,
          role: "master",
          actor: masterAuth.actor,
          redirectTo: "/admin"
        });
      }
      return privateJson({ authenticated: false });
    }

    // Default: Check client session first to prioritize store operators
    const operator = await verifyOperator();
    if (operator) {
      try {
        const memberships = await supabaseRows<Membership[]>(
          `crm_tenant_memberships?select=tenant_id,role&is_active=eq.true&user_id=eq.${encodeURIComponent(operator.id)}`,
          operator.token
        );
        const tenantIds = memberships.map(m => m.tenant_id).filter(id => UUID.test(id));
        if (tenantIds.length > 0) {
          const tenants = await supabaseRows<Tenant[]>(
            `crm_tenants?select=id,name,status&id=in.(${tenantIds.join(",")})&status=eq.active`,
            operator.token
          );
          if (tenants.length > 0) {
            return privateJson({
              authenticated: true,
              role: "client",
              actor: operator.email || operator.id,
              tenants,
              redirectTo: "/cliente"
            });
          }
        }
      } catch {}
    }

    const masterAuth = await verifyMasterRequest(request);
    if (masterAuth.authorized) {
      return privateJson({
        authenticated: true,
        role: "master",
        actor: masterAuth.actor,
        redirectTo: "/admin"
      });
    }

    return privateJson({ authenticated: false });
  } catch {
    return privateJson({ authenticated: false });
  }
}

/**
 * POST /api/crm/auth/session
 * Single Central Login: Authenticates Master or Store Client and issues HttpOnly cookies.
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin, request.url)) return privateJson({ error: "origin_forbidden" }, 403);

  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      request.headers.get("x-real-ip") ||
      "local_client";

    const body = await request.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password.trim() : "";
    const rememberMe = Boolean(body.rememberMe);
    const scope = typeof body.scope === "string" ? body.scope.trim().toLowerCase() : "client";
    const isMasterScope = scope === "master";

    const redis = getRedis();
    const rateLimitKey = isMasterScope ? `crm:ratelimit:master_login:${ip}` : `crm:ratelimit:login:${ip}`;
    const maxAttempts = isMasterScope ? 5 : 8;

    let attempts = 0;
    try {
      if (redis.status === "ready") {
        const raw = await redis.get(rateLimitKey);
        attempts = raw ? parseInt(raw, 10) : 0;
      }
    } catch {}

    if (attempts >= maxAttempts) {
      if (isMasterScope) {
        try {
          if (redis.status === "ready") {
            const activeOtp = await redis.get(`crm:master_active_otp:${ip}`);
            if (!activeOtp) {
              await dispatchMasterRecoveryOtp(ip);
            }
          }
        } catch {}
      }

      return privateJson({
        error: "too_many_attempts",
        message: isMasterScope
          ? "Acesso Master bloqueado temporariamente por 15 minutos após 5 tentativas incorretas. Enviamos um código de segurança para seu WhatsApp oficial."
          : "Muitas tentativas incorretas. Acesso bloqueado temporariamente por 15 minutos para proteção.",
        canRecoverViaWhatsapp: isMasterScope
      }, 429);
    }

    if (!password) {
      return privateJson({ error: "missing_credentials", message: "Informe a senha para continuar." }, 400);
    }

    const dynamicMasterPassword = await getDynamicMasterPassword();
    const masterPassword = dynamicMasterPassword || getMasterPassword();
    const adminToken = getLegacyAdminToken();

    // Strict timing-safe matching for Master secret (prevents weakening entropy)
    const isMasterPasswordMatch = Boolean(masterPassword && timingSafeMatch(password, masterPassword));
    const isAdminTokenMatch = Boolean(adminToken && timingSafeMatch(password, adminToken));
    if (scope !== "master" && scope !== "client") return privateJson({ error: "invalid_scope" }, 400);

    // 1. Attempt Supabase Auth if email is provided
    let supaAccessToken: string | null = null;
    let supaUserId: string | null = null;
    let supaUserEmail: string | null = null;
    let supaMaxAge = 3600;

    if (email && email.includes("@")) {
      try {
        const { url, key } = supabaseSettings();
        const authRes = await fetch(url + "/auth/v1/token?grant_type=password", {
          method: "POST",
          headers: { apikey: key, "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
          cache: "no-store",
          signal: AbortSignal.timeout(9000)
        });

        if (authRes.ok) {
          const authData = await authRes.json() as { access_token?: string; expires_in?: number; user?: { id?: string; email?: string } };
          if (authData.access_token && authData.user?.id) {
            supaAccessToken = authData.access_token;
            supaUserId = authData.user.id;
            supaUserEmail = authData.user.email || email;
            supaMaxAge = Math.max(60, Math.min(30 * 24 * 3600, Number(authData.expires_in ?? 3600)));
          }
        }
      } catch {}
    }

    // 2. Evaluate Role & Routing
    const isHttps = request.nextUrl.protocol === "https:" &&
      !request.nextUrl.hostname.includes("localhost") &&
      !request.nextUrl.hostname.includes("127.0.0.1");


    // =========================================================================
    // FLOW 1: EXCLUSIVE MASTER LOGIN (Strictly via /novaescrmadm with scope="master")
    // =========================================================================
    if (scope === "master") {
      let isStaffMaster = false;
      if (supaAccessToken && supaUserId) {
        try {
          const staff = await supabaseRows<Staff[]>(
            `platform_staff?select=role,enabled&user_id=eq.${encodeURIComponent(supaUserId)}&limit=2`,
            supaAccessToken
          );
          if (staff.length === 1 && staff[0].enabled && ["MASTER", "ADMINISTRADOR", "platform_admin"].includes(staff[0].role)) {
            isStaffMaster = true;
          }
        } catch {}
      }

      if (isMasterPasswordMatch || isAdminTokenMatch || isStaffMaster) {
        const actorName = supaUserEmail || (email ? email : "master_admin");
        const masterToken = signMasterToken(isStaffMaster ? `master_${supaUserId}` : "master_admin", rememberMe);
        const maxAge = rememberMe ? MASTER_REMEMBER_TTL_SEC : MASTER_SESSION_TTL_SEC;

        const response = NextResponse.json({
          success: true,
          role: "master",
          redirectTo: "/admin",
          actor: actorName
        });

        response.cookies.set({
          name: MASTER_COOKIE_NAME,
          value: masterToken,
          httpOnly: true,
          secure: isHttps,
          sameSite: "lax",
          path: "/",
          maxAge
        });

        // A Master session must not leave a store session active.
        response.cookies.set(sessionCookieName(), "", { httpOnly: true, sameSite: "lax", secure: isHttps, path: "/", maxAge: 0 });
        try { await redis.del(rateLimitKey); } catch {}


        return response;
      }

      try { await redis.incr(rateLimitKey); await redis.expire(rateLimitKey, 15 * 60); } catch {}
      return privateJson({
        error: "invalid_master_credentials",
        message: "Credenciais de administrador inválidas. Acesso restrito ao Painel Master da NovaesWeb."
      }, 401);
    }

    // =========================================================================
    // FLOW 2: EXCLUSIVE CLIENT LOGIN (Portal da Loja no "/" ou "/cliente")
    // Never allows Master login; always burns any leftover master cookie!
    // =========================================================================
    if (supaAccessToken && supaUserId) {
      try {
        const memberships = await supabaseRows<Membership[]>(
          `crm_tenant_memberships?select=tenant_id,role&is_active=eq.true&user_id=eq.${encodeURIComponent(supaUserId)}`,
          supaAccessToken
        );
        const tenantIds = memberships.map(m => m.tenant_id).filter(id => UUID.test(id));

        if (!tenantIds.length) {
          return privateJson({
            error: "no_membership",
            message: "Sua conta de usuário não possui vínculo com nenhuma loja ativa no CRM. Solicite um convite ao administrador da sua loja."
          }, 403);
        }

        const tenants = await supabaseRows<Tenant[]>(
          `crm_tenants?select=id,name,status&id=in.(${tenantIds.join(",")})`,
          supaAccessToken
        );

        const activeTenants = tenants.filter(t => t.status === "active");
        if (!activeTenants.length) {
          return privateJson({
            error: "store_suspended",
            message: "A loja vinculada à sua conta está temporariamente inativa ou suspensa. Verifique com o suporte."
          }, 403);
        }

        const maxAge = rememberMe ? MASTER_REMEMBER_TTL_SEC : supaMaxAge;
        const response = NextResponse.json({
          success: true,
          role: "client",
          redirectTo: "/cliente",
          tenants: activeTenants,
          actor: supaUserEmail || supaUserId
        });

        try { await redis.del(rateLimitKey); } catch {}

        // Set Client/Operator session cookie
        response.cookies.set(sessionCookieName(), supaAccessToken, {
          httpOnly: true,
          sameSite: "lax",
          secure: isHttps,
          path: "/",
          maxAge
        });

        // CRITICAL: Always completely delete and burn any previous master cookie
        response.cookies.set({
          name: MASTER_COOKIE_NAME,
          value: "",
          httpOnly: true,
          secure: isHttps,
          sameSite: "lax",
          path: "/",
          maxAge: 0
        });

        return response;
      } catch {
        return privateJson({
          error: "membership_verification_failed",
          message: "Não foi possível validar as empresas autorizadas para o seu usuário."
        }, 503);
      }
    }

    // Credential check failed
    try {
      if (redis.status === "ready") {
        const newAttempts = await redis.incr(rateLimitKey);
        await redis.expire(rateLimitKey, 15 * 60);
        if (isMasterScope && newAttempts >= 5) {
          await dispatchMasterRecoveryOtp(ip);
        }
      }
    } catch {}

    return privateJson({
      error: "invalid_credentials",
      message: isMasterScope
        ? "E-mail ou senha Master incorretos. Verifique suas credenciais de administrador."
        : "E-mail ou senha incorretos. Verifique suas credenciais de acesso."
    }, 401);
  } catch (e) {
    return privateJson({ error: e instanceof Error ? e.message : "auth_failed" }, 500);
  }
}

/**
 * DELETE /api/crm/auth/session
 * Complete, atomic Logout: revokes Master token in Redis blacklist and destroys session cookies.
 */
export async function DELETE(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin, request.url)) return privateJson({ error: "origin_forbidden" }, 403);

  // Revoke Master token in Redis and server memory
  const masterCookie = request.cookies.get(MASTER_COOKIE_NAME)?.value;
  if (masterCookie) {
    try {
      await revokeMasterToken(masterCookie);
    } catch {}
  }

  const response = NextResponse.json({ authenticated: false, loggedOut: true });

  const isHttps = request.nextUrl.protocol === "https:" &&
    !request.nextUrl.hostname.includes("localhost") &&
    !request.nextUrl.hostname.includes("127.0.0.1");

  // Destroy Master cookie
  response.cookies.set({
    name: MASTER_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: isHttps,
    sameSite: "lax",
    path: "/",
    maxAge: 0
  });

  // Destroy Client/Operator cookie
  response.cookies.set(sessionCookieName(), "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps,
    path: "/",
    maxAge: 0
  });

  return response;
}

