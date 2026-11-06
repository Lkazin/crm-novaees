import { NextRequest, NextResponse } from "next/server";
import { verifyOperator } from "@/lib/crm/supabase-server";
import { verifyMasterRequest } from "@/lib/crm/master-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const [masterAuth, operator] = await Promise.all([
      verifyMasterRequest(req),
      verifyOperator()
    ]);
    if (!masterAuth.authorized && !operator) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const url = (process.env.EVOLUTION_API_URL ?? "http://host.docker.internal:8080").replace(/\/$/, "");
    const key = process.env.EVOLUTION_API_KEY ?? "";
    const rawInstance = req.nextUrl.searchParams.get("instance") || req.nextUrl.searchParams.get("instanceName") || process.env.EVOLUTION_INSTANCE || "novaesweb-ia-teste";
    const instanceName = rawInstance.toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 32);

    if (!key) {
      return NextResponse.json({
        instanceName,
        state: "disconnected",
        connected: false,
        message: "Evolution API Key não configurada"
      }, { status: 200 });
    }

    try {
      const response = await fetch(`${url}/instance/connectionState/${encodeURIComponent(instanceName)}`, {
        headers: { apikey: key },
        cache: "no-store",
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) {
        return NextResponse.json({
          instanceName,
          state: "disconnected",
          connected: false
        }, { status: 200 });
      }

      const data = await response.json();
      const state = data?.instance?.state ?? data?.state ?? "close";
      const isConnected = state === "open";

      // If connected, sync to crm_channels in Supabase
      if (isConnected) {
        const supaUrl = (process.env.CRM_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)?.trim().replace(/\/$/, "");
        const supaKey = (process.env.CRM_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY)?.trim();
        if (supaUrl && supaKey) {
          fetch(`${supaUrl}/rest/v1/crm_channels?instance_name=eq.${encodeURIComponent(instanceName)}`, {
            method: "PATCH",
            headers: { apikey: supaKey, Authorization: "Bearer " + supaKey, "Content-Type": "application/json" },
            body: JSON.stringify({ status: "connected" })
          }).catch(() => {});
        }
      }

      return NextResponse.json({
        instanceName,
        state,
        connected: isConnected
      });
    } catch {
      return NextResponse.json({
        instanceName,
        state: "disconnected",
        connected: false,
        message: "Evolution API inacessível no momento"
      }, { status: 200 });
    }
  } catch {
    return NextResponse.json({ error: "Falha ao verificar status" }, { status: 500 });
  }
}
