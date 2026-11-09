import type { AgentConfig } from "./config";

export type EvolutionSendConfig = Pick<AgentConfig, "evolutionUrl" | "evolutionKey" | "instance" | "sendFormat">;

export class EvolutionSendError extends Error {
  constructor(message: string, public readonly outcome: "rejected" | "uncertain") {
    super(message);
    this.name = "EvolutionSendError";
  }
}

export type SendResult = { messageId?: string };

export async function sendText(number: string, text: string, cfg: EvolutionSendConfig, targetInstance?: string): Promise<SendResult> {
  const instance = encodeURIComponent(targetInstance || cfg.instance);
  const endpoint = `${cfg.evolutionUrl}/message/sendText/${instance}`;
  // Evolution v2 commonly accepts flat `text`; legacy installations can use textMessage.
  const body = cfg.sendFormat === "legacy"
    ? { number, textMessage: { text } }
    : { number, text };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: cfg.evolutionKey },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      console.error(`[evolution-send-error] HTTP ${response.status}`);
      let detail = "";
      try {
        const errJson = await response.json();
        detail = Array.isArray(errJson?.response?.message)
          ? errJson.response.message.join("; ")
          : (errJson?.message || errJson?.error || "");
      } catch {
        try {
          detail = await response.text();
        } catch {}
      }
      const fullMsg = `Evolution retornou HTTP ${response.status}${detail ? `: ${detail}` : ""}`;
      // A timeout or server error may happen after provider acceptance: do not retry/refund automatically.
      throw new EvolutionSendError(fullMsg, response.status >= 400 && response.status < 500 && response.status !== 408 ? "rejected" : "uncertain");
    }
    try {
      const data = await response.json();
      const messageId = data?.key?.id || data?.messageId || data?.id || undefined;
      return { messageId };
    } catch {
      return {};
    }
  } finally {
    clearTimeout(timeout);
  }
}

export type PresenceType = "composing" | "recording" | "paused" | "available" | "unavailable";

export async function sendPresence(
  number: string,
  presence: PresenceType = "composing",
  cfg: Pick<AgentConfig, "evolutionUrl" | "evolutionKey" | "instance">,
  targetInstance?: string,
  delayMs = 1200
): Promise<boolean> {
  const instance = encodeURIComponent(targetInstance || cfg.instance);
  const endpoint = `${cfg.evolutionUrl}/chat/sendPresence/${instance}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6_000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: cfg.evolutionKey },
      body: JSON.stringify({ number, presence, delay: delayMs }),
      signal: controller.signal,
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
