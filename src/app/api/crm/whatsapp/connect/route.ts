import { NextRequest, NextResponse } from "next/server";
import { verifyOperator } from "@/lib/crm/supabase-server";
import { verifyMasterRequest } from "@/lib/crm/master-auth";
import { getEffectiveTenantPlan } from "@/lib/crm/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getEvolutionConfig() {
  const url = (process.env.EVOLUTION_API_URL ?? "http://host.docker.internal:8080").replace(/\/$/, "");
  const key = process.env.EVOLUTION_API_KEY ?? "";
  const secret = process.env.CRM_WEBHOOK_SECRET ?? "";
  return { url, key, secret };
}

function sanitizeQr(val: unknown): string | null {
  if (!val || typeof val !== "string") return null;
  const trimmed = val.trim();
  if (trimmed.startsWith("data:image/")) return trimmed;
  // If raw base64 string
  if (trimmed.length > 80 && /^[A-Za-z0-9+/=\r\n]+$/.test(trimmed)) {
    return `data:image/png;base64,${trimmed.replace(/[\r\n]/g, "")}`;
  }
  return null;
}

async function syncChannelStatus(instanceName: string, tenantId: string | undefined, status: "connected" | "connecting" | "disconnected") {
  try {
    const supaUrl = (process.env.CRM_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)?.trim().replace(/\/$/, "");
    const supaKey = (process.env.CRM_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY)?.trim();
    if (!supaUrl || !supaKey) return;

    // DB check constraint on crm_channels.status only allows: 'disconnected' | 'connected' | 'paused'
    const dbStatus = status === "connected" ? "connected" : "disconnected";

    // First try updating existing record by instance_name
    const res = await fetch(`${supaUrl}/rest/v1/crm_channels?instance_name=eq.${encodeURIComponent(instanceName)}`, {
      method: "PATCH",
      headers: {
        apikey: supaKey,
        Authorization: `Bearer ${supaKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify({ status: dbStatus })
    });

    const updated = res.ok ? await res.json() : [];
    if (Array.isArray(updated) && updated.length === 0 && tenantId) {
      // Channel doesn't exist yet for this instance; insert it
      await fetch(`${supaUrl}/rest/v1/crm_channels`, {
        method: "POST",
        headers: {
          apikey: supaKey,
          Authorization: `Bearer ${supaKey}`,
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
  } catch (err) {
    console.warn("[syncChannelStatus] Erro ao sincronizar status do canal:", err);
  }
}

async function configureEvolutionWebhook(url: string, key: string, secret: string, instanceName: string, _reqOrigin?: string, _isVercel?: boolean) {
  try {
    // Evolution API runs in Docker alongside the local CRM processor (port 3040) which has access to Omniroute AI (:20128), Redis, and Supabase.
    const webhookBase = process.env.EVOLUTION_WEBHOOK_TARGET_URL || "http://host.docker.internal:3040/api/evolution/webhook";
    const targetWebhookUrl = secret
      ? `${webhookBase.replace(/\/$/, "")}?secret=${encodeURIComponent(secret)}`
      : webhookBase.replace(/\/$/, "");
    const events = ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"];

    const res = await fetch(`${url}/webhook/set/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key },
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: targetWebhookUrl,
          byEvents: false,
          base64: false,
          events,
          headers: {
            "x-crm-webhook-secret": secret
          }
        }
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(5000)
    });

    if (!res.ok) {
      // Fallback for Evolution API v1 flat webhook schema
      await fetch(`${url}/webhook/set/${encodeURIComponent(instanceName)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: key },
        body: JSON.stringify({
          enabled: true,
          url: targetWebhookUrl,
          webhookByEvents: false,
          webhookBase64: false,
          events,
          headers: {
            "x-crm-webhook-secret": secret
          }
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(4000)
      }).catch(() => {});
    }
  } catch (err) {
    console.warn("[WhatsApp Connect] Falha não bloqueante ao configurar webhook:", err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const [masterAuth, operator] = await Promise.all([
      verifyMasterRequest(req),
      verifyOperator()
    ]);
    if (!masterAuth.authorized && !operator) {
      return NextResponse.json({
        error: "unauthorized",
        message: "Sessão não autorizada. Faça login novamente no painel."
      }, { status: 401 });
    }

    let body: Record<string, any> = {};
    try {
      body = await req.json();
    } catch {}

    const rawName = (
      body.instance ||
      body.instanceName ||
      body.instance_name ||
      body.tenantName ||
      body.tenant_name ||
      req.nextUrl.searchParams.get("instance") ||
      req.nextUrl.searchParams.get("instanceName") ||
      "novaesweb-ia-teste"
    );
    const instanceName = String(rawName).trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 32) || "novaesweb_crm";

    // Detect tenantId from body or operator
    let tenantId = (
      (typeof body.tenantId === "string" && body.tenantId) ? body.tenantId :
      (typeof body.tenant_id === "string" && body.tenant_id) ? body.tenant_id :
      req.nextUrl.searchParams.get("tenantId") ||
      req.nextUrl.searchParams.get("tenant") ||
      undefined
    );

    if (!tenantId && operator?.id) {
      const supaUrl = (process.env.CRM_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)?.trim().replace(/\/$/, "");
      const supaKey = (process.env.CRM_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY)?.trim();
      if (supaUrl && supaKey) {
        try {
          const rMem = await fetch(`${supaUrl}/rest/v1/crm_tenant_memberships?user_id=eq.${encodeURIComponent(operator.id)}&select=tenant_id&limit=1`, {
            headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` },
            cache: "no-store",
            signal: AbortSignal.timeout(3000)
          });
          if (rMem.ok) {
            const mems = await rMem.json();
            if (Array.isArray(mems) && mems[0]?.tenant_id) {
              tenantId = mems[0].tenant_id;
            }
          }
        } catch {}
      }
    }

    // Validar limite de conexões WhatsApp conforme plano contratado
    if (tenantId) {
      try {
        const effectivePlan = await getEffectiveTenantPlan(tenantId);
        const supaUrl = (process.env.CRM_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)?.trim().replace(/\/$/, "");
        const supaKey = (process.env.CRM_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY)?.trim();
        if (supaUrl && supaKey) {
          const rCh = await fetch(`${supaUrl}/rest/v1/crm_channels?tenant_id=eq.${encodeURIComponent(tenantId)}&select=instance_name,status`, {
            headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` },
            cache: "no-store",
            signal: AbortSignal.timeout(4000)
          });
          if (rCh.ok) {
            const channels = (await rCh.json()) as Array<{ instance_name: string; status: string }>;
            const activeConnections = channels.filter(c => c.status === "connected" || c.status === "open");
            const isExistingInstance = channels.some(c => c.instance_name === instanceName);
            if (!isExistingInstance && activeConnections.length >= effectivePlan.maxWhatsappConnections) {
              return NextResponse.json({
                error: "whatsapp_limit_reached",
                message: `Seu plano ${effectivePlan.planName} permite até ${effectivePlan.maxWhatsappConnections} conexão(ões) WhatsApp simultânea(s). Faça upgrade para conectar mais números.`
              }, { status: 403 });
            }
          }
        }
      } catch (planErr) {
        console.warn("[WhatsApp Connect] Erro não impeditivo ao validar franquia de conexões:", planErr);
      }
    }

    const { url, key, secret } = getEvolutionConfig();

    // Check if running on Vercel with local-only host
    const isVercel = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
    const isLocalUrl = url.includes("host.docker.internal") || url.includes("localhost") || url.includes("127.0.0.1");
    if (isVercel && isLocalUrl) {
      return NextResponse.json({
        error: "evolution_cloud_unreachable",
        message: `A Evolution API está configurada com URL local (${url}). Na Vercel (nuvem), configure a variável de ambiente EVOLUTION_API_URL com a URL pública da sua Evolution API (ex: via Cloudflare Tunnel, Ngrok ou VPS).`
      }, { status: 503 });
    }

    if (!key) {
      return NextResponse.json({
        error: "evolution_key_missing",
        message: "Chave da Evolution API (EVOLUTION_API_KEY) não configurada nas variáveis de ambiente."
      }, { status: 500 });
    }

    // 1. Verificar se a instância já existe e está conectada
    let state = "close";
    let qrcodeBase64: string | null = null;
    let evolutionOnline = true;

    try {
      const stateRes = await fetch(`${url}/instance/connectionState/${encodeURIComponent(instanceName)}`, {
        headers: { apikey: key },
        cache: "no-store",
        signal: AbortSignal.timeout(6000)
      });
      if (stateRes.ok) {
        const stateData = await stateRes.json();
        state = stateData?.instance?.state ?? stateData?.state ?? "close";
      }
    } catch (err: any) {
      if (err?.name === "TimeoutError" || err?.code === "ECONNREFUSED" || err?.code === "ENOTFOUND" || err?.message?.includes("fetch failed")) {
        evolutionOnline = false;
      }
    }

    if (!evolutionOnline) {
      return NextResponse.json({
        error: "evolution_unavailable",
        message: `Servidor de WhatsApp indisponível no momento (${url}). Verifique se o container da Evolution API está ativo e acessível.`
      }, { status: 503 });
    }

    if (state === "open") {
      await configureEvolutionWebhook(url, key, secret, instanceName, req.nextUrl.origin, isVercel);
      await syncChannelStatus(instanceName, tenantId, "connected");
      return NextResponse.json({
        instanceName,
        state: "open",
        connected: true,
        message: "WhatsApp já está conectado e pronto para atendimento!"
      });
    }

    // 2. Se a instância existe mas está desconectada, pedir novo QR Code
    try {
      const connectRes = await fetch(`${url}/instance/connect/${encodeURIComponent(instanceName)}`, {
        headers: { apikey: key },
        cache: "no-store",
        signal: AbortSignal.timeout(7000)
      });
      if (connectRes.ok) {
        const connectData = await connectRes.json();
        qrcodeBase64 = (
          sanitizeQr(connectData?.base64) ||
          sanitizeQr(connectData?.qrcode?.base64) ||
          sanitizeQr(connectData?.code) ||
          null
        );
      }
    } catch {}

    // 3. Se ainda não tem QR Code, criar nova instância
    if (!qrcodeBase64) {
      try {
        const createRes = await fetch(`${url}/instance/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: key },
          body: JSON.stringify({
            instanceName,
            qrcode: true,
            integration: "WHATSAPP-BAILEYS"
          }),
          cache: "no-store",
          signal: AbortSignal.timeout(8000)
        });

        if (createRes.ok) {
          const createData = await createRes.json();
          qrcodeBase64 = (
            sanitizeQr(createData?.qrcode?.base64) ||
            sanitizeQr(createData?.base64) ||
            sanitizeQr(createData?.code) ||
            null
          );
        } else {
          // If instance already existed on Evolution, retry connect one more time
          const connectRetry = await fetch(`${url}/instance/connect/${encodeURIComponent(instanceName)}`, {
            headers: { apikey: key },
            cache: "no-store",
            signal: AbortSignal.timeout(6000)
          });
          if (connectRetry.ok) {
            const retryData = await connectRetry.json();
            qrcodeBase64 = (
              sanitizeQr(retryData?.base64) ||
              sanitizeQr(retryData?.qrcode?.base64) ||
              sanitizeQr(retryData?.code) ||
              null
            );
          }
        }
      } catch (err: any) {
        console.warn("[WhatsApp Connect] Erro ao criar instância:", err?.message);
      }
    }

    // 4. Configurar Webhook automaticamente para esta instância
    await configureEvolutionWebhook(url, key, secret, instanceName, req.nextUrl.origin, isVercel);

    // 5. Sincronizar canal no Supabase vinculando à empresa (status 'disconnected' até confirmar leitura do QR)
    await syncChannelStatus(instanceName, tenantId, "disconnected");

    return NextResponse.json({
      instanceName,
      state: "connecting",
      connected: false,
      qrcode: qrcodeBase64,
      message: qrcodeBase64 ? "QR Code gerado com sucesso! Aponte a câmera do WhatsApp em Aparelhos Conectados." : "Instância iniciada. Aguarde alguns segundos para carregar o QR Code."
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro desconhecido ao conectar WhatsApp.";
    return NextResponse.json({ error: msg, message: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const [masterAuth, operator] = await Promise.all([
      verifyMasterRequest(req),
      verifyOperator()
    ]);
    if (!masterAuth.authorized && !operator) {
      return NextResponse.json({
        error: "unauthorized",
        message: "Sessão não autorizada."
      }, { status: 401 });
    }

    const { url, key } = getEvolutionConfig();
    if (!key) {
      return NextResponse.json({
        error: "evolution_key_missing",
        message: "Evolution API Key não configurada."
      }, { status: 500 });
    }

    let instance = req.nextUrl.searchParams.get("instance") ?? "";
    if (!instance) {
      try {
        const body = await req.json();
        instance = body.instance || body.instanceName || "";
      } catch {}
    }

    if (!instance) {
      return NextResponse.json({
        error: "missing_instance",
        message: "Nome da instância é obrigatório para desconectar."
      }, { status: 400 });
    }

    const instanceName = instance.toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 32);

    // 1. Logout da sessão no Evolution API
    try {
      await fetch(`${url}/instance/logout/${encodeURIComponent(instanceName)}`, {
        method: "DELETE",
        headers: { apikey: key },
        cache: "no-store",
        signal: AbortSignal.timeout(6000)
      });
    } catch {}

    // 2. Apagar a instância no Evolution API
    let deleted = false;
    try {
      const delRes = await fetch(`${url}/instance/delete/${encodeURIComponent(instanceName)}`, {
        method: "DELETE",
        headers: { apikey: key },
        cache: "no-store",
        signal: AbortSignal.timeout(6000)
      });
      deleted = delRes.ok;
    } catch {}

    // 3. Atualizar canal no Supabase
    const tenantId = req.nextUrl.searchParams.get("tenantId") || req.nextUrl.searchParams.get("tenant") || undefined;
    await syncChannelStatus(instanceName, tenantId, "disconnected");

    return NextResponse.json({
      success: true,
      instanceName,
      deleted,
      message: "Instância desconectada e apagada com sucesso! O WhatsApp foi desvinculado."
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro desconhecido ao desconectar.";
    return NextResponse.json({ error: msg, message: msg }, { status: 500 });
  }
}
