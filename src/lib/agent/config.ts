import "server-only";
import { existsSync } from "node:fs";

export type AiConfig = {
  aiUrl: string;
  aiKey: string;
  aiModel: string;
  systemPrompt: string;
};

export type AgentConfig = AiConfig & {
  evolutionUrl: string;
  evolutionKey: string;
  instance: string;
  webhookSecret: string;
  redisUrl: string;
  allowedNumber: string;
  sendEnabled: boolean;
  sendFormat: "v2" | "legacy";
};

function read(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável não configurada: ${name}`);
  return value;
}

function validUrl(name: string, value: string): string {
  let url: URL;
  try { url = new URL(value); }
  catch { throw new Error(`Configuração inválida: ${name}`); }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error(`Protocolo inválido: ${name}`);
  if (url.username || url.password || url.search || url.hash) throw new Error(`URL não permitida: ${name}`);
  return url.toString().replace(/\/$/, "");
}

/** Detecta execucao dentro de container sem depender de variavel manual. */
function isInsideContainer(): boolean {
  if ((process.env.DOCKER_CONTAINER ?? "").trim() === "true") return true;
  try {
    // /.dockerenv existe em containers Docker; /run/.containerenv em Podman.
    return existsSync("/.dockerenv") || existsSync("/run/.containerenv");
  } catch {
    return false;
  }
}

export function getAiConfig(): AiConfig {
  let rawAi = read("AI_OPENAI_BASE_URL");
  // Dentro de um container, 127.0.0.1 e o proprio container: host.docker.internal
  // precisa ficar como esta. So reescrevemos quando rodamos direto no Windows,
  // fora do Docker. A checagem antiga usava `!process.env.DOCKER_CONTAINER`, que
  // e verdadeira tambem dentro do container (a variavel nunca e definida), e por
  // isso o CRM tentava 127.0.0.1:20128 e caia em ECONNREFUSED.
  if (rawAi.includes("host.docker.internal") && process.platform === "win32" && !isInsideContainer()) {
    rawAi = rawAi.replace("host.docker.internal", "127.0.0.1");
  }
  const aiUrl = validUrl("AI_OPENAI_BASE_URL", rawAi);
  const aiModel = read("AI_MODEL");
  // A free lab must never silently fall back to a billed model.
  if (aiUrl === "https://openrouter.ai/api/v1" && aiModel !== "openrouter/free" && !aiModel.endsWith(":free")) {
    throw new Error("No OpenRouter, este laboratório aceita apenas openrouter/free ou modelos :free");
  }
  return {
    aiUrl,
    aiKey: read("AI_API_KEY"),
    aiModel,
    systemPrompt: read("AI_BUSINESS_CONTEXT"),
  };
}

export function getAgentConfig(): AgentConfig {
  const rawAllowed = (process.env.AI_TEST_ALLOWED_NUMBER ?? "").trim();
  const allowed = (rawAllowed === "*" || rawAllowed === "all" || rawAllowed === "" || rawAllowed === "none")
    ? "*"
    : rawAllowed.replace(/\D/g, "");
  if (allowed !== "*" && !/^\d{10,15}$/.test(allowed)) throw new Error("AI_TEST_ALLOWED_NUMBER inválido");
  const webhookSecret = read("CRM_WEBHOOK_SECRET");
  if (webhookSecret.length < 32) throw new Error("CRM_WEBHOOK_SECRET precisa ter pelo menos 32 caracteres");
  const redisUrl = (process.env.CRM_REDIS_URL || "redis://127.0.0.1:6379").trim();
  if (!/^redis(s)?:\/\//.test(redisUrl)) throw new Error("CRM_REDIS_URL deve ser redis:// ou rediss://");
  const format = process.env.EVOLUTION_SEND_FORMAT || "v2";
  if (format !== "v2" && format !== "legacy") throw new Error("EVOLUTION_SEND_FORMAT inválido");
  return {
    ...getAiConfig(),
    evolutionUrl: (() => {
      let rawEvo = read("EVOLUTION_API_URL");
      // Mesma regra da IA: dentro do container host.docker.internal fica como esta.
      if (rawEvo.includes("host.docker.internal") && process.platform === "win32" && !isInsideContainer()) {
        rawEvo = rawEvo.replace("host.docker.internal", "127.0.0.1");
      }
      return validUrl("EVOLUTION_API_URL", rawEvo);
    })(),
    evolutionKey: read("EVOLUTION_API_KEY"),
    instance: read("EVOLUTION_INSTANCE"),
    webhookSecret,
    redisUrl,
    allowedNumber: allowed,
    sendEnabled: process.env.AI_REPLY_ENABLED === "true",
    sendFormat: format,
  };
}
