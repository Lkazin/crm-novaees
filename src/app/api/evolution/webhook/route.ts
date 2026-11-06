import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAgentConfig } from "@/lib/agent/config";
import { processWebhook } from "@/lib/agent/processor";
import { parseIncoming } from "@/lib/agent/parse";
import { captureIncoming } from "@/lib/crm/inbox";
import { persistIncomingInSupabase } from "@/lib/crm/supabase-ingest";
import { outboundAllowed } from "@/lib/crm/outbound-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });
function matchesSecret(supplied: string, expected: string): boolean {
  const a = Buffer.from(supplied, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const secret = process.env.CRM_WEBHOOK_SECRET ?? "";
  const header = request.headers.get("x-crm-webhook-secret") ?? "";
  if (secret.length < 32 || !matchesSecret(header, secret)) return json({ error: "unauthorized" }, 401);
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return json({ error: "json_required" }, 415);
  const raw = await request.text();
  if (raw.length > 16_384) return json({ error: "payload_too_large" }, 413);
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return json({ error: "invalid_json" }, 400); }
  try {
    const cfg = getAgentConfig();
    const incoming = parseIncoming(payload);
    if (incoming) {
      // Capture and persist incoming message from any configured store instance
      try { await persistIncomingInSupabase(incoming); } catch {}
      try { await captureIncoming(incoming); } catch {}
    }
    const result = await processWebhook(payload, cfg, { maySend: outboundAllowed });
    return json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.error("[crm-ai-webhook]", message);
    return json({ error: "processing_failed", detail: message }, 500);
  }
}
export async function GET() { return json({ error: "method_not_allowed" }, 405); }
