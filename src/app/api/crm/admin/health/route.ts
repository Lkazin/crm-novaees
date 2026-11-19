import { NextRequest } from "next/server";
import { privateJson } from "@/lib/crm/supabase-server";
import { verifyMasterRequest } from "@/lib/crm/master-auth";
import { getRedis } from "@/lib/crm/plans";
import { normalizeLocalServiceUrl } from "@/lib/runtime-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ServiceState = "ok" | "warn" | "down";

export type SystemHealthPayload = {
  checkedAt: string;
  overall: ServiceState;
  services: {
    database: { status: ServiceState; latencyMs: number | null; detail: string };
    redis: { status: ServiceState; latencyMs: number | null; detail: string };
    whatsapp: {
      status: ServiceState;
      latencyMs: number | null;
      detail: string;
      connectedInstances: number;
      totalInstances: number;
    };
    ai: {
      status: ServiceState;
      latencyMs: number | null;
      detail: string;
      primaryModel: string;
      modelsAvailable: number;
    };
  };
};

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 3000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

async function checkDatabase(): Promise<SystemHealthPayload["services"]["database"]> {
  const url = (process.env.CRM_SUPABASE_URL ?? "").trim().replace(/\/$/, "");
  const key = (process.env.CRM_SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || key.length < 20) {
    return { status: "down", latencyMs: null, detail: "Credenciais do Supabase não configuradas" };
  }
  const start = Date.now();
  try {
    const res = await fetchWithTimeout(`${url}/rest/v1/crm_tenants?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }
    }, 3000);
    const latencyMs = Date.now() - start;
    if (res.ok) {
      return {
        status: latencyMs > 1800 ? "warn" : "ok",
        latencyMs,
        detail: latencyMs > 1800 ? `Conectado com lentidão (${latencyMs}ms)` : `PostgreSQL online (${latencyMs}ms)`
      };
    }
    return { status: "down", latencyMs, detail: `Erro HTTP ${res.status} no Supabase` };
  } catch {
    return { status: "down", latencyMs: Date.now() - start, detail: "Sem resposta do banco de dados" };
  }
}

async function checkRedis(): Promise<SystemHealthPayload["services"]["redis"]> {
  const start = Date.now();
  try {
    const redis = getRedis();
    if (redis.status !== "ready" && redis.status !== "connecting") {
      return { status: "warn", latencyMs: null, detail: `Redis em estado: ${redis.status}` };
    }
    const pong = await Promise.race([
      redis.ping(),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error("timeout")), 2000))
    ]);
    const latencyMs = Date.now() - start;
    if (pong === "PONG") {
      return { status: "ok", latencyMs, detail: `Cache & filas ativos (${latencyMs}ms)` };
    }
    return { status: "warn", latencyMs, detail: `Resposta inesperada: ${pong}` };
  } catch {
    return { status: "warn", latencyMs: Date.now() - start, detail: "Redis indisponível (fallback local ativo)" };
  }
}

async function checkWhatsApp(): Promise<SystemHealthPayload["services"]["whatsapp"]> {
  const rawEvoUrl = process.env.EVOLUTION_API_URL || process.env.CRM_EVOLUTION_API_URL || "http://127.0.0.1:8080";
  const evoUrl = normalizeLocalServiceUrl(rawEvoUrl, "http://127.0.0.1:8080");
  const evoKey = (process.env.EVOLUTION_API_KEY || process.env.CRM_EVOLUTION_API_KEY || "").trim();
  if (!evoKey) {
    return {
      status: "warn",
      latencyMs: null,
      detail: "Chave da Evolution API ausente",
      connectedInstances: 0,
      totalInstances: 0
    };
  }
  const start = Date.now();
  try {
    const res = await fetchWithTimeout(`${evoUrl}/instance/fetchInstances`, {
      headers: { apikey: evoKey }
    }, 3500);
    const latencyMs = Date.now() - start;
    if (!res.ok) {
      return {
        status: "down",
        latencyMs,
        detail: `Evolution retornou HTTP ${res.status}`,
        connectedInstances: 0,
        totalInstances: 0
      };
    }
    const data = await res.json();
    const list = Array.isArray(data) ? data : [];
    const connected = list.filter((item: Record<string, unknown>) => {
      const state = String(
        item?.connectionStatus ||
        (item?.instance as Record<string, unknown> | undefined)?.status ||
        item?.state ||
        ""
      ).toLowerCase();
      return state === "open" || state === "connected";
    }).length;
    return {
      status: connected > 0 ? "ok" : "warn",
      latencyMs,
      detail: connected > 0
        ? `${connected}/${list.length} instância(s) conectada(s)`
        : list.length > 0
          ? `API online, 0/${list.length} conectada(s)`
          : "Evolution API online (sem instâncias)",
      connectedInstances: connected,
      totalInstances: list.length
    };
  } catch {
    return {
      status: "down",
      latencyMs: Date.now() - start,
      detail: "Evolution API inacessível",
      connectedInstances: 0,
      totalInstances: 0
    };
  }
}

async function checkAiGateway(): Promise<SystemHealthPayload["services"]["ai"]> {
  const rawAiUrl = process.env.AI_OPENAI_BASE_URL || "http://127.0.0.1:20128/v1";
  const aiUrl = normalizeLocalServiceUrl(rawAiUrl, "http://127.0.0.1:20128/v1");
  const aiKey = (process.env.AI_API_KEY || "").trim();
  const primaryModel = (process.env.AI_MODEL || "auto/best-chat").trim();

  if (!aiKey) {
    return {
      status: "down",
      latencyMs: null,
      detail: "Chave AI_API_KEY não configurada",
      primaryModel,
      modelsAvailable: 0
    };
  }

  const start = Date.now();
  try {
    const res = await fetchWithTimeout(`${aiUrl}/models`, {
      headers: { Authorization: `Bearer ${aiKey}` }
    }, 3000);
    const latencyMs = Date.now() - start;
    if (res.ok) {
      const payload = await res.json().catch(() => ({}));
      const modelsCount = Array.isArray(payload?.data) ? payload.data.length : 0;
      return {
        status: "ok",
        latencyMs,
        detail: modelsCount > 0
          ? `IA operacional (${modelsCount} rotas, ${latencyMs}ms)`
          : `Gateway IA online (${latencyMs}ms)`,
        primaryModel,
        modelsAvailable: modelsCount
      };
    }
    return {
      status: res.status === 401 || res.status === 403 ? "down" : "warn",
      latencyMs,
      detail: `Gateway IA retornou HTTP ${res.status}`,
      primaryModel,
      modelsAvailable: 0
    };
  } catch {
    return {
      status: "down",
      latencyMs: Date.now() - start,
      detail: "Gateway de IA sem resposta",
      primaryModel,
      modelsAvailable: 0
    };
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyMasterRequest(request);
    if (!auth.authorized) {
      return privateJson({ error: "unauthorized" }, 401);
    }

    const [database, redis, whatsapp, ai] = await Promise.all([
      checkDatabase(),
      checkRedis(),
      checkWhatsApp(),
      checkAiGateway()
    ]);

    const states: ServiceState[] = [database.status, redis.status, whatsapp.status, ai.status];
    const overall: ServiceState = states.includes("down")
      ? "down"
      : states.includes("warn")
        ? "warn"
        : "ok";

    const result: SystemHealthPayload = {
      checkedAt: new Date().toISOString(),
      overall,
      services: { database, redis, whatsapp, ai }
    };

    return privateJson(result);
  } catch {
    return privateJson({ error: "health_check_failed" }, 500);
  }
}
