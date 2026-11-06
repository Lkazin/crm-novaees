import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getEvolutionConfig() {
  const url = (process.env.EVOLUTION_API_URL ?? "http://host.docker.internal:8080").replace(/\/$/, "");
  const key = process.env.EVOLUTION_API_KEY ?? "";
  const secret = process.env.CRM_WEBHOOK_SECRET ?? "";
  return { url, key, secret };
}

export async function POST(req: NextRequest) {
  try {
    const { url, key, secret } = getEvolutionConfig();
    if (!key) {
      return NextResponse.json({ error: "Evolution API Key nao configurada" }, { status: 500 });
    }

    let body: { instanceName?: string; tenantName?: string } = {};
    try {
      body = await req.json();
    } catch {}

    const rawName = body.instanceName || body.tenantName || "novaesweb-ia-teste";
    const instanceName = rawName.toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 30);

    // 1. Verificar se a instancia ja existe
    let state = "close";
    let qrcodeBase64: string | null = null;

    try {
      const stateRes = await fetch(`${url}/instance/connectionState/${encodeURIComponent(instanceName)}`, {
        headers: { apikey: key },
        cache: "no-store",
      });
      if (stateRes.ok) {
        const stateData = await stateRes.json();
        state = stateData?.instance?.state ?? stateData?.state ?? "close";
      }
    } catch {}

    if (state === "open") {
      return NextResponse.json({
        instanceName,
        state: "open",
        connected: true,
        message: "WhatsApp ja esta conectado!",
      });
    }

    // 2. Se a instancia existe mas esta desconectada, pedir novo QR Code
    try {
      const connectRes = await fetch(`${url}/instance/connect/${encodeURIComponent(instanceName)}`, {
        headers: { apikey: key },
        cache: "no-store",
      });
      if (connectRes.ok) {
        const connectData = await connectRes.json();
        qrcodeBase64 = connectData?.base64 ?? connectData?.qrcode?.base64 ?? null;
      }
    } catch {}

    // 3. Se ainda nao tem QR Code, criar nova instancia
    if (!qrcodeBase64) {
      const createRes = await fetch(`${url}/instance/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: key },
        body: JSON.stringify({
          instanceName,
          qrcode: true,
          integration: "WHATSAPP-BAILEYS",
        }),
        cache: "no-store",
      });

      if (createRes.ok) {
        const createData = await createRes.json();
        qrcodeBase64 = createData?.qrcode?.base64 ?? createData?.base64 ?? null;
      }
    }

    // 4. Configurar Webhook automaticamente para esta instancia
    if (secret) {
      try {
        await fetch(`${url}/webhook/set/${encodeURIComponent(instanceName)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: key },
          body: JSON.stringify({
            webhook: {
              enabled: true,
              url: "http://host.docker.internal:3040/api/evolution/webhook",
              byEvents: false,
              base64: false,
              events: ["MESSAGES_UPSERT"],
              headers: {
                "x-crm-webhook-secret": secret,
              },
            },
          }),
          cache: "no-store",
        });
      } catch (err) {
        console.error("Falha ao configurar webhook da instancia:", err);
      }
    }

    return NextResponse.json({
      instanceName,
      state: "connecting",
      connected: false,
      qrcode: qrcodeBase64,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { url, key } = getEvolutionConfig();
    if (!key) {
      return NextResponse.json({ error: "Evolution API Key nao configurada" }, { status: 500 });
    }

    let instance = req.nextUrl.searchParams.get("instance") ?? "";
    if (!instance) {
      try {
        const body = await req.json();
        instance = body.instanceName || "";
      } catch {}
    }

    if (!instance) {
      return NextResponse.json({ error: "Nome da instancia obrigatorio" }, { status: 400 });
    }

    const instanceName = instance.toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 30);

    // 1. Logout da sessao no Evolution API
    try {
      await fetch(`${url}/instance/logout/${encodeURIComponent(instanceName)}`, {
        method: "DELETE",
        headers: { apikey: key },
        cache: "no-store",
      });
    } catch {}

    // 2. Apagar a instancia no Evolution API
    let deleted = false;
    try {
      const delRes = await fetch(`${url}/instance/delete/${encodeURIComponent(instanceName)}`, {
        method: "DELETE",
        headers: { apikey: key },
        cache: "no-store",
      });
      deleted = delRes.ok;
    } catch {}

    // 3. Atualizar canal no Supabase
    try {
      const supaUrl = process.env.CRM_SUPABASE_URL?.trim().replace(/\/$/, "");
      const supaKey = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY?.trim();
      if (supaUrl && supaKey) {
        await fetch(`${supaUrl}/rest/v1/crm_channels?instance_name=eq.${encodeURIComponent(instanceName)}`, {
          method: "PATCH",
          headers: { apikey: supaKey, Authorization: "Bearer " + supaKey, "Content-Type": "application/json" },
          body: JSON.stringify({ status: "disconnected" }),
        });
      }
    } catch {}

    return NextResponse.json({
      success: true,
      instanceName,
      deleted,
      message: "Instância desconectada e apagada com sucesso!",
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
