import { NextRequest, NextResponse } from "next/server";
import { isAllowedOrigin, privateJson, sessionCookieName, supabaseSettings, verifyOperator } from "@/lib/crm/supabase-server";
import { extractClientIp, isLoginBlocked, recordFailedLoginAttempt, resetLoginAttempts } from "@/lib/crm/master-auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin, request.url)) return privateJson({error:"forbidden"},403);
  if (!request.headers.get("content-type")?.includes("application/json")) return privateJson({error:"json_required"},415);
  if (Number(request.headers.get("content-length") ?? "0") > 4096) return privateJson({error:"request_too_large"},413);

  const ip = extractClientIp(request);
  const blockCheck = await isLoginBlocked(ip, false);
  if (blockCheck.blocked) {
    return privateJson({ error: "too_many_attempts", message: "Muitas tentativas incorretas. Aguarde antes de tentar novamente." }, 429);
  }

  let body: unknown;
  try { body = await request.json(); } catch { return privateJson({error:"invalid_json"},400); }
  const value = body && typeof body === "object" ? body as Record<string,unknown> : {};
  const email = typeof value.email === "string" ? value.email.trim() : "";
  const password = typeof value.password === "string" ? value.password : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8 || password.length > 256)
    return privateJson({error:"invalid_credentials"},400);
  try {
    const {url,key} = supabaseSettings();
    const auth = await fetch(url+"/auth/v1/token?grant_type=password",{
      method:"POST",headers:{apikey:key,"Content-Type":"application/json"},
      body:JSON.stringify({email,password}), cache:"no-store", signal:AbortSignal.timeout(9000)
    });
    if (!auth.ok) {
      const fail = await recordFailedLoginAttempt(ip, false);
      if (fail.blocked) {
        return privateJson({ error: "too_many_attempts", message: "Muitas tentativas incorretas. Acesso temporariamente bloqueado." }, 429);
      }
      return privateJson({error:"invalid_credentials"},401);
    }
    const data = await auth.json() as {access_token?: string; expires_in?: number; user?:{id?:string}};
    if (!data.access_token || !data.user?.id || data.access_token.length>4096)
      return privateJson({error:"login_failed"},503);
    await resetLoginAttempts(ip, false);
    const maxAge = Math.max(60,Math.min(3300,Number(data.expires_in ?? 3600)-60));
    const response=NextResponse.json({authenticated:true},{headers:{"Cache-Control":"no-store"}});
    const isSecure = process.env.NODE_ENV === "production" && !request.nextUrl.hostname.includes("localhost") && !request.nextUrl.hostname.includes("127.0.0.1");
    response.cookies.set(sessionCookieName(),data.access_token,{
      httpOnly:true,sameSite:"lax",secure:isSecure,
      path:"/",maxAge
    });
    return response;
  } catch { return privateJson({error:"login_unavailable"},503); }
}
export async function GET() {
  try {
    const user=await verifyOperator();
    return privateJson({authenticated:!!user, email:user?.email ?? null});
  } catch { return privateJson({authenticated:false}); }
}
export async function DELETE(request: NextRequest) {
  const origin=request.headers.get("origin");
  if (!isAllowedOrigin(origin, request.url)) return privateJson({error:"forbidden"},403);
  const res=NextResponse.json({authenticated:false},{headers:{"Cache-Control":"no-store"}});
  res.cookies.set(sessionCookieName(),"",{httpOnly:true,sameSite:"lax",secure:false,path:"/",maxAge:0});
  return res;
}
