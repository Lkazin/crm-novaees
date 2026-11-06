import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const url = (process.env.EVOLUTION_API_URL ?? "http://host.docker.internal:8080").replace(/\/$/, "");
    const key = process.env.EVOLUTION_API_KEY ?? "";
    const instanceName = req.nextUrl.searchParams.get("instance") || process.env.EVOLUTION_INSTANCE || "novaesweb-ia-teste";

    const response = await fetch(`${url}/instance/connectionState/${encodeURIComponent(instanceName)}`, {
      headers: { apikey: key },
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json({ instanceName, state: "disconnected", connected: false });
    }

    const data = await response.json();
    const state = data?.instance?.state ?? data?.state ?? "close";

    return NextResponse.json({
      instanceName,
      state,
      connected: state === "open",
    });
  } catch {
    return NextResponse.json({ error: "Falha ao verificar status" }, { status: 500 });
  }
}
