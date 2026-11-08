import { NextRequest } from "next/server";
import { isAllowedOrigin, privateJson } from "@/lib/crm/supabase-server";
import { verifyMasterRequest } from "@/lib/crm/master-auth";
import { getRedis } from "@/lib/crm/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface GlobalBroadcast {
  active: boolean;
  title: string;
  message: string;
  type: "info" | "warning" | "success" | "alert";
  updatedAt: string;
}

const REDIS_KEY = "crm:master:global_broadcast";

// In-memory cache for fast, zero-delay responses
let inMemoryBroadcast: GlobalBroadcast = {
  active: false,
  title: "",
  message: "",
  type: "info",
  updatedAt: new Date().toISOString()
};

async function loadBroadcastFromStorage(): Promise<GlobalBroadcast> {
  try {
    const redis = getRedis();
    if (redis.status !== "ready" && redis.status !== "connecting") {
      await redis.connect();
    }
    const raw = await redis.get(REDIS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed.active === "boolean") {
        inMemoryBroadcast = parsed;
      }
    }
  } catch {
    // If Redis is unreachable, fallback cleanly to in-memory state
  }
  return inMemoryBroadcast;
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin, request.url)) return privateJson({ error: "origin_forbidden" }, 403);

  const broadcast = await loadBroadcastFromStorage();
  return privateJson({ ok: true, broadcast });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin, request.url)) return privateJson({ error: "origin_forbidden" }, 403);

  // Require Master authorization
  const auth = await verifyMasterRequest(request);
  if (!auth.authorized) {
    return privateJson({ error: "unauthorized" }, 401);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const active = Boolean(body.active);
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 150) : "";
    const message = typeof body.message === "string" ? body.message.trim().slice(0, 500) : "";
    const type = ["info", "warning", "success", "alert"].includes(body.type) ? body.type : "info";

    inMemoryBroadcast = {
      active,
      title,
      message,
      type,
      updatedAt: new Date().toISOString()
    };

    try {
      const redis = getRedis();
      if (redis.status !== "ready" && redis.status !== "connecting") {
        await redis.connect();
      }
      await redis.set(REDIS_KEY, JSON.stringify(inMemoryBroadcast));
    } catch (err) {
      console.warn("[broadcast] Redis write skipped:", err);
    }

    return privateJson({ ok: true, broadcast: inMemoryBroadcast });
  } catch (e) {
    return privateJson({ error: e instanceof Error ? e.message : "broadcast_save_error" }, 500);
  }
}
