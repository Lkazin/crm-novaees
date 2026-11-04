import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAiConfig } from "@/lib/agent/config";
import { generateAnswer } from "@/lib/agent/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validSecret(actual: string, expected: string) {
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return b.length >= 32 && a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const secret = process.env.CRM_LAB_ADMIN_TOKEN ?? "";
  if (!validSecret(req.headers.get("x-crm-lab-admin-token") ?? "", secret))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!req.headers.get("content-type")?.includes("application/json"))
    return NextResponse.json({ error: "json_required" }, { status: 415 });
  const body = await req.text();
  if (body.length > 3_000) return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  let question: unknown;
  try { question = (JSON.parse(body) as Record<string, unknown>).question; } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (typeof question !== "string" || !question.trim() || question.length > 1000)
    return NextResponse.json({ error: "invalid_question" }, { status: 400 });
  try {
    const cfg = getAiConfig();
    const answer = await generateAnswer(question, cfg);
    return NextResponse.json({ answer, deliveredToWhatsApp: false });
  } catch {
    // Never include credentials or provider errors in publicly readable responses.
    return NextResponse.json({ error: "ai_not_ready" }, { status: 503 });
  }
}
