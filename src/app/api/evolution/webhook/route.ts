import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAgentConfig } from "@/lib/agent/config";
import { processWebhook } from "@/lib/agent/processor";
import { parseIncoming } from "@/lib/agent/parse";
import { captureIncoming } from "@/lib/crm/inbox";
import { persistIncomingInSupabase } from "@/lib/crm/supabase-ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });
function matchesSecret(supplied: string, expected: string): boolean {
  const a = Buffer.from(supplied, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  // Fail closed. Never accept unsigned webhooks, even in lab mode.
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
    if (incoming && incoming.instance === cfg.instance) {
      // Durable persistence is opt-in and fails closed (503) if a configured channel cannot be saved.
      await persistIncomingInSupabase(incoming);
      await captureIncoming(incoming);
    }
    const result = await processWebhook(payload, cfg);
    return json(result);
  } catch (err) {
    // No payload, API keys or personal data in application logs.
    const message = err instanceof Error ? err.message : "unknown";
    console.error("[crm-ai-webhook]", message.startsWith("Variável") ? "configuration_missing" : "processing_failed");
    return json({ error: "processing_failed" }, 503);
  }
}
export async function GET() { return json({ error: "method_not_allowed" }, 405); }
