import Redis from "ioredis";
import type { AgentConfig } from "./config";
import { parseIncoming } from "./parse";
import type { Incoming } from "./parse";
import { generateAnswer } from "./ai";
import { sendText } from "./evolution";

export type ProcessResult = { status: "ignored" | "duplicate" | "disabled" | "sent"; reason?: string };

export async function processWebhook(
  payload: unknown,
  cfg: AgentConfig,
  deps: { redis?: Redis; generate?: typeof generateAnswer; send?: typeof sendText; maySend?: (incoming: Incoming) => Promise<boolean> } = {},
): Promise<ProcessResult> {
  const incoming = parseIncoming(payload);
  if (!incoming) return { status: "ignored", reason: "unsupported_event" };
  if (incoming.instance !== cfg.instance) return { status: "ignored", reason: "wrong_instance" };
  if (incoming.number !== cfg.allowedNumber) return { status: "ignored", reason: "number_not_allowed" };
  if (!cfg.sendEnabled) return { status: "disabled", reason: "reply_switch_off" };

  const redis = deps.redis ?? new Redis(cfg.redisUrl, { maxRetriesPerRequest: 1, connectTimeout: 3000, lazyConnect: true });
  const ownsClient = !deps.redis;
  const lockKey = `crm:lab:lock:${cfg.instance}:${incoming.id}`;
  const doneKey = `crm:lab:done:${cfg.instance}:${incoming.id}`;
  try {
    if (ownsClient) await redis.connect();
    if (await redis.exists(doneKey)) return { status: "duplicate" };
    const locked = await redis.set(lockKey, "locked", "EX", 90, "NX");
    if (locked !== "OK") return { status: "duplicate" };
    try {
      if (deps.maySend && !(await deps.maySend(incoming))) return { status: "disabled", reason: "tenant_or_conversation_blocked" };
      const text = await (deps.generate ?? generateAnswer)(incoming.text, cfg);
      // Recheck after AI generation. A human could claim the conversation while the model runs.
      if (deps.maySend && !(await deps.maySend(incoming))) return { status: "disabled", reason: "tenant_or_conversation_blocked" };
      await (deps.send ?? sendText)(incoming.number, text, cfg);
      // Mark after a successful send. If Evolution times out after sending,
      // a retry could duplicate. Production needs an outbox with reconciliation.
      await redis.set(doneKey, "sent", "EX", 86_400);
      return { status: "sent" };
    } finally {
      await redis.del(lockKey);
    }
  } finally {
    if (ownsClient) redis.disconnect();
  }
}
