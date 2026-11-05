export type Incoming = { id: string; remoteJid: string; number: string; text: string; instance: string };
type RecordLike = Record<string, unknown>;
const record = (value: unknown): RecordLike | null =>
  !!value && typeof value === "object" && !Array.isArray(value) ? value as RecordLike : null;

export function parseIncoming(payload: unknown): Incoming | null {
  const body = record(payload);
  if (!body || !["messages.upsert", "MESSAGES_UPSERT"].includes(String(body.event ?? ""))) return null;
  const data = record(body.data);
  const key = record(data?.key);
  const message = record(data?.message);
  if (!data || !key || !message || key.fromMe === true) return null;

  const id = key.id;
  const remoteJid = key.remoteJid;
  const instance = body.instance ?? body.instanceName;
  if (typeof id !== "string" || !id || typeof remoteJid !== "string" || typeof instance !== "string") return null;
  // No group messages, status broadcasts, newsletter or @lid mapping for this limited single-number lab.
  if (!/^\d{10,15}@s\.whatsapp\.net$/.test(remoteJid)) return null;
  const number = remoteJid.split("@")[0];
  const extended = record(message.extendedTextMessage);
  const ephemeral = record(message.ephemeralMessage);
  const innerEphemeral = record(ephemeral?.message);
  const text = message.conversation ?? extended?.text ?? innerEphemeral?.conversation;
  if (typeof text !== "string" || !text.trim() || text.length > 1600) return null;
  return { id, remoteJid, number, text: text.trim(), instance };
}
