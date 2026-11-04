import Redis from "ioredis";
import { createHash } from "node:crypto";
import type { Incoming } from "@/lib/agent/parse";

const ttl = 60 * 60 * 24 * 7;
const prefix = "crm:inbox:v1:";
const numberKey = (n: string) => createHash("sha256").update(n).digest("hex");
const safeInstance = (n: string) => n.replace(/[^a-zA-Z0-9_-]/g, "_");
export type InboxMessage = {
  id: string; from: "contact"; text: string; at: string;
};
export type InboxConversation = {
  id: string; number: string; name: string; preview: string;
  updatedAt: string; messages: InboxMessage[];
};
// Capture is independent of replying. Off by default until operator explicitly opts in.
export async function captureIncoming(incoming: Incoming): Promise<void> {
  if (process.env.CRM_INBOX_CAPTURE_ENABLED !== "true") return;
  if (incoming.instance !== process.env.EVOLUTION_INSTANCE) return;
  const redisUrl = process.env.CRM_REDIS_URL;
  if (!redisUrl) return;
  const r = new Redis(redisUrl, { maxRetriesPerRequest: 1, connectTimeout: 3000, lazyConnect: true });
  const namespace = prefix + safeInstance(incoming.instance) + ":";
  const hash = numberKey(incoming.number);
  const key = namespace + "contact:" + hash;
  const dedup = namespace + "message:" + createHash("sha256").update(incoming.id + ":" + hash).digest("hex");
  try {
    await r.connect();
    const now = new Date().toISOString();
    const msg: InboxMessage = { id: incoming.id, from: "contact", text: incoming.text, at: now };
    // Single atomic operation: never mark an ID as processed before storing the message.
    const lua = [
      'if redis.call("EXISTS", KEYS[1]) == 1 then return 0 end',
      'redis.call("SET", KEYS[1], "1", "EX", ARGV[1])',
      'redis.call("HSET", KEYS[2], "number", ARGV[2], "updatedAt", ARGV[3], "preview", ARGV[4])',
      'redis.call("LPUSH", KEYS[3], ARGV[5])',
      'redis.call("LTRIM", KEYS[3], 0, 99)',
      'redis.call("EXPIRE", KEYS[2], ARGV[1])',
      'redis.call("EXPIRE", KEYS[3], ARGV[1])',
      'redis.call("ZADD", KEYS[4], ARGV[6], ARGV[7])',
      'redis.call("EXPIRE", KEYS[4], ARGV[1])',
      'return 1',
    ].join("\\n");
    await r.eval(lua, 4, dedup, key, key + ":messages", namespace + "recent",
      String(ttl), incoming.number, now, incoming.text.slice(0, 200),
      JSON.stringify(msg), String(Date.now()), hash);

  } catch {
    // Capture failure must never cause the WhatsApp provider to retry an otherwise valid event.
    console.error("[crm-inbox] capture_unavailable");
  } finally { r.disconnect(); }
}
export async function listInbox(): Promise<InboxConversation[]> {
  const redisUrl = process.env.CRM_REDIS_URL;
  const instance = process.env.EVOLUTION_INSTANCE;
  if (!redisUrl || !instance) throw new Error("inbox_not_configured");
  const r = new Redis(redisUrl, { maxRetriesPerRequest: 1, connectTimeout: 3000, lazyConnect: true });
  const namespace = prefix + safeInstance(instance) + ":";
  try {
    await r.connect();
    const hashes = await r.zrevrange(namespace + "recent", 0, 49);
    const result: InboxConversation[] = [];
    for (const hash of hashes) {
      const key = namespace + "contact:" + hash;
      const [info, values] = await Promise.all([r.hgetall(key), r.lrange(key + ":messages", 0, 99)]);
      if (!info.number || !/^\d{10,15}$/.test(info.number)) continue;
      const messages: InboxMessage[] = [];
      for (const entry of values.reverse()) {
        try {
          const m = JSON.parse(entry) as InboxMessage;
          if (typeof m.text === "string" && typeof m.id === "string") messages.push(m);
        } catch {}
      }
      result.push({ id: hash, number: info.number, name: info.number, preview: info.preview ?? "",
        updatedAt: info.updatedAt ?? "", messages });
    }
    return result;
  } finally { r.disconnect(); }
}
