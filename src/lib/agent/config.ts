import "server-only";

export type AiConfig = { aiUrl: string; aiKey: string; aiModel: string; systemPrompt: string };\n\nexport type AgentConfig = AiConfig & {
  evolutionUrl: string;
  evolutionKey: string;
  instance: string;
  webhookSecret: string;
  redisUrl: string;
  aiUrl: string;
  aiKey: string;
  aiModel: string;
  systemPrompt: string;
  allowedNumber: string;
  sendEnabled: boolean;
  sendFormat: "v2" | "legacy";
};

function validUrl(name: string, value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(`Configuração inválida: ${name}`); }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error(`Protocolo inválido: ${name}`);
  if (url.username || url.password || url.search || url.hash) throw new Error(`URL não permitida: ${name}`);
  return url.toString().replace(/\/$/, "");
}

export function getAiConfig(): AiConfig {\n  const read = (key: string) => {\n    const value = process.env[key]?.trim();\n    if (!value) throw new Error(`Variável não configurada: ${key}`);\n    return value;\n  };\n  return {\n    aiUrl: validUrl("AI_OPENAI_BASE_URL", read("AI_OPENAI_BASE_URL")),\n    aiKey: read("AI_API_KEY"),\n    aiModel: read("AI_MODEL"),\n    systemPrompt: read("AI_BUSINESS_CONTEXT"),\n  };\n}\n\nexport function getAgentConfig(): AgentConfig {
  const read = (key: string) => {
    const value = process.env[key]?.trim();
    if (!value) throw new Error(`Variável não configurada: ${key}`);
    return value;
  };
  const allowed = read("AI_TEST_ALLOWED_NUMBER").replace(/\D/g, "");
  if (!/^\d{10,15}$/.test(allowed)) throw new Error("AI_TEST_ALLOWED_NUMBER inválido");
  const webhookSecret = read("CRM_WEBHOOK_SECRET");
  if (webhookSecret.length < 32) throw new Error("CRM_WEBHOOK_SECRET precisa ter pelo menos 32 caracteres");
  const redisUrl = read("CRM_REDIS_URL");
  if (!/^redis(s)?:\/\//.test(redisUrl)) throw new Error("CRM_REDIS_URL deve ser redis:// ou rediss://");
  const format = process.env.EVOLUTION_SEND_FORMAT || "v2";
  if (format !== "v2" && format !== "legacy") throw new Error("EVOLUTION_SEND_FORMAT inválido");
  return {
    evolutionUrl: validUrl("EVOLUTION_API_URL", read("EVOLUTION_API_URL")),
    evolutionKey: read("EVOLUTION_API_KEY"),
    instance: read("EVOLUTION_INSTANCE"),
    webhookSecret,
    redisUrl,
    aiUrl: validUrl("AI_OPENAI_BASE_URL", read("AI_OPENAI_BASE_URL")),
    aiKey: read("AI_API_KEY"),
    aiModel: read("AI_MODEL"),
    systemPrompt: read("AI_BUSINESS_CONTEXT"),
    allowedNumber: allowed,
    sendEnabled: process.env.AI_REPLY_ENABLED === "true",
    sendFormat: format,
  };
}
