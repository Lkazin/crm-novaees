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

/**
 * Tempo de "digitando" proporcional ao tamanho da resposta, para o cliente ver
 * alguem escrevendo de verdade. Limitado para nao travar a fila:
 *   25ms por caractere, entre 1.5s e 6s.
 * Uma resposta de 120 caracteres fica ~3s, parecido com uma pessoa digitando.
 */
export function typingDurationFor(text: string): number {
  const chars = (text || "").trim().length;
  // Piso de 800ms (era 1500ms): um "oi" nao pode custar 1,5s de espera antes
  // da bolha aparecer. O teto de 6s continua para respostas longas.
  const ms = Math.round(chars * 25);
  return Math.max(800, Math.min(6000, ms));
}

/**
 * Mantem o "digitando..." visivel durante a espera. O WhatsApp mostra a presenca
 * por ~20s; renovamos a cada 8s enquanto a IA pensa, para o cliente nunca ver o
 * indicador desaparecer no meio da resposta.
 */
export async function holdTypingPresence(
  number: string,
  cfg: Pick<AgentConfig, "evolutionUrl" | "evolutionKey" | "instance">,
  targetInstance?: string,
  intervalMs = 8000
): Promise<() => void> {
  // O campo `delay` da Evolution e por quanto tempo o "digitando" fica ligado
  // no aparelho do cliente. Antes eram 20000ms renovados a cada 8s, e o
  // stopTyping() apenas parava o intervalo: nao mandava `paused`. Resultado:
  // o cliente continuava vendo "digitando..." por ate 20s DEPOIS da resposta
  // chegar, e para sempre quando a IA nao enviava nada.
  // Agora o delay casa com o intervalo (nunca sobra tempo pendurado) e o
  // retorno envia `paused`, que e o unico jeito de desligar de verdade.
  const holdMs = Math.max(2000, Math.min(intervalMs, 8000));
  let stopped = false;
  void sendPresence(number, "composing", cfg, targetInstance, holdMs).catch(() => {});
  const timer = setInterval(() => {
    if (stopped) return;
    void sendPresence(number, "composing", cfg, targetInstance, holdMs).catch(() => {});
  }, intervalMs);
  return () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    void sendPresence(number, "paused", cfg, targetInstance, 0).catch(() => {});
  };
}
