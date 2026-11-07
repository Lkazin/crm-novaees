import { NextRequest, NextResponse } from "next/server";
import Redis from "ioredis";
import { verifyOperator } from "@/lib/crm/supabase-server";
import { verifyMasterRequest } from "@/lib/crm/master-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function extractPhoneFromJid(jid: unknown): string | null {
  if (typeof jid !== "string" || !jid) return null;
  const clean = jid.split("@")[0].split(":")[0].replace(/\D/g, "");
  return clean.length >= 10 ? clean : null;
}

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
    const tenantId = req.nextUrl.searchParams.get("tenantId") || req.nextUrl.searchParams.get("tenant") || undefined;

    if (!key) {
      return NextResponse.json({
        instanceName,
        state: "disconnected",
        connected: false,
        qrScanned: false,
        phoneNumber: null,
        message: "Evolution API Key não configurada"
      }, { status: 200 });
    }

    // Check Redis for real-time webhook events (CONNECTION_UPDATE / QRCODE_UPDATED)
    let qrScannedFromWebhook = false;
    let qrcodeFromWebhook: string | null = null;
    const redisUrl = process.env.CRM_REDIS_URL;
    if (redisUrl) {
      try {
        const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 1200 });
        await redis.connect();
        const raw = await redis.get(`crm:wa:state:${instanceName}`);
        redis.disconnect();
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.qrScanned) qrScannedFromWebhook = true;
          if (typeof parsed.qrcode === "string" && parsed.qrcode.startsWith("data:image/")) {
            qrcodeFromWebhook = parsed.qrcode;
          }
        }
      } catch {}
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
          connected: false,
          qrScanned: false,
          phoneNumber: null
        }, { status: 200 });
      }

      const data = await response.json();
      const state = data?.instance?.state ?? data?.state ?? "close";
      const isConnected = state === "open";

      // Fetch instance details (connected phone number & profile name) if connected or connecting
      let phoneNumber: string | null = extractPhoneFromJid(data?.instance?.owner ?? data?.instance?.wuid ?? data?.ownerJid);
      let profileName: string | null = data?.instance?.profileName ?? null;

      if (isConnected || state === "connecting") {
        try {
          const infoRes = await fetch(`${url}/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`, {
            headers: { apikey: key },
            cache: "no-store",
            signal: AbortSignal.timeout(3500)
          });
          if (infoRes.ok) {
            const infoData = await infoRes.json();
            const instObj = Array.isArray(infoData)
              ? infoData.find((i: any) => (i?.name || i?.instance?.instanceName || i?.instanceName) === instanceName) || infoData[0]
              : infoData?.instance || infoData;
            if (instObj) {
              phoneNumber = phoneNumber || extractPhoneFromJid(instObj.ownerJid || instObj.owner || instObj.number || instObj?.instance?.owner);
              profileName = profileName || instObj.profileName || instObj?.instance?.profileName || null;
              if (phoneNumber && state === "connecting") {
                qrScannedFromWebhook = true;
              }
            }
          }
        } catch {}
      }

      // Sync channel status in Supabase
      const supaUrl = (process.env.CRM_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)?.trim().replace(/\/$/, "");
      const supaKey = (process.env.CRM_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY)?.trim();
      if (supaUrl && supaKey && (isConnected || state === "close")) {
        const dbStatus = isConnected ? "connected" : "disconnected";
        try {
          const patchRes = await fetch(`${supaUrl}/rest/v1/crm_channels?instance_name=eq.${encodeURIComponent(instanceName)}`, {
            method: "PATCH",
            headers: {
              apikey: supaKey,
              Authorization: "Bearer " + supaKey,
              "Content-Type": "application/json",
              Prefer: "return=representation"
            },
            body: JSON.stringify({ status: dbStatus })
          });
          const updated = patchRes.ok ? await patchRes.json() : [];
          if (Array.isArray(updated) && updated.length === 0 && tenantId) {
            await fetch(`${supaUrl}/rest/v1/crm_channels`, {
              method: "POST",
              headers: {
                apikey: supaKey,
                Authorization: "Bearer " + supaKey,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                tenant_id: tenantId,
                provider: "evolution",
                instance_name: instanceName,
                status: dbStatus
              })
            });
          }
        } catch {}
      }

      // Auto-heal webhook on Evolution API if connected and webhook is missing
      if (isConnected) {
        try {
          const whCheck = await fetch(`${url}/webhook/find/${encodeURIComponent(instanceName)}`, {
            headers: { apikey: key },
            cache: "no-store",
            signal: AbortSignal.timeout(2500)
          });
          const whData = whCheck.ok ? await whCheck.json() : null;
          if (!whData || !whData.enabled || !whData.url) {
            const secret = process.env.EVOLUTION_WEBHOOK_SECRET || process.env.CRM_WEBHOOK_SECRET || "";
            const webhookBase = process.env.EVOLUTION_WEBHOOK_TARGET_URL || "http://host.docker.internal:3040/api/evolution/webhook";
            const targetWebhookUrl = secret
              ? `${webhookBase.replace(/\/$/, "")}?secret=${encodeURIComponent(secret)}`
              : webhookBase.replace(/\/$/, "");
            await fetch(`${url}/webhook/set/${encodeURIComponent(instanceName)}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: key },
              body: JSON.stringify({
                webhook: {
                  enabled: true,
                  url: targetWebhookUrl,
                  byEvents: false,
                  base64: false,
                  events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"],
                  headers: secret ? { "x-crm-webhook-secret": secret } : {}
                }
              }),
              cache: "no-store",
              signal: AbortSignal.timeout(3000)
            }).catch(() => {});
          }
        } catch {}
      }

      return NextResponse.json({
        instanceName,
        state,
        connected: isConnected,
        qrScanned: isConnected || qrScannedFromWebhook,
        phoneNumber,
        profileName,
        qrcode: isConnected ? null : qrcodeFromWebhook
      });
    } catch {
      return NextResponse.json({
        instanceName,
        state: "disconnected",
        connected: false,
        qrScanned: false,
        phoneNumber: null,
        message: "Evolution API inacessível no momento"
      }, { status: 200 });
    }
  } catch {
    return NextResponse.json({ error: "Falha ao verificar status" }, { status: 500 });
  }
}
