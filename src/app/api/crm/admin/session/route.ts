import { NextRequest, NextResponse } from "next/server";
import { isAllowedOrigin, privateJson } from "@/lib/crm/supabase-server";
import { MASTER_COOKIE_NAME, MASTER_SESSION_TTL_SEC, signMasterToken, timingSafeMatch, verifyMasterRequest } from "@/lib/crm/master-auth";

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
    const body = await request.json().catch(() => ({}));
    const candidate = typeof body.password === "string" ? body.password.trim() : "";
    const masterPassword = process.env.CRM_MASTER_PASSWORD?.trim() || "";
    const adminToken = process.env.CRM_LAB_ADMIN_TOKEN?.trim() || "";

    // Allow exact match OR match without trailing punctuation (e.g. "Noah2027." vs "Noah2027")
    const isMasterPasswordMatch = Boolean(
      (masterPassword && timingSafeMatch(candidate, masterPassword)) ||
      (masterPassword.endsWith(".") && timingSafeMatch(candidate, masterPassword.slice(0, -1))) ||
      (!masterPassword.endsWith(".") && timingSafeMatch(candidate, masterPassword + "."))
    );

    const isAdminTokenMatch = Boolean(adminToken && timingSafeMatch(candidate, adminToken));

    if (!candidate || (!isMasterPasswordMatch && !isAdminTokenMatch)) {
      return privateJson({ error: "invalid_credentials" }, 401);
    }

    const token = signMasterToken("master_admin");
    const response = NextResponse.json({ authenticated: true, actor: "master_admin" });

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
      maxAge: MASTER_SESSION_TTL_SEC // 12 hours (43200 seconds)
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

