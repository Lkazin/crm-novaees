import type { Incoming } from "./parse";

export type MediaConfig = {
  evolutionUrl: string;
  evolutionKey: string;
  aiUrl: string;
  aiKey: string;
};

export type MediaInspection = {
  isMedia: boolean;
  mediaType: "audio" | "image" | "none";
  caption?: string;
  seconds?: number;
  data: Record<string, unknown>;
  key: Record<string, unknown>;
  instance: string;
  remoteJid: string;
  id: string;
  pushName?: string;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/**
 * Inspects a webhook payload to determine if it is an audio or image message.
 */
export function inspectIncomingMedia(payload: unknown): MediaInspection | null {
  const body = record(payload);
  if (!body || !["messages.upsert", "MESSAGES_UPSERT"].includes(String(body.event ?? ""))) return null;
  const data = record(body.data);
  const key = record(data?.key);
  const message = record(data?.message);
  if (!data || !key || !message || key.fromMe === true) return null;

  const id = typeof key.id === "string" ? key.id : "";
  const rawRemoteJid = typeof key.remoteJid === "string" ? key.remoteJid : "";
  const altJid = typeof key.remoteJidAlt === "string" ? key.remoteJidAlt : (typeof key.senderPn === "string" ? key.senderPn : (typeof data.senderPn === "string" ? data.senderPn : ""));
  const remoteJid = /^\d{10,15}@s\.whatsapp\.net$/.test(rawRemoteJid)
    ? rawRemoteJid
    : /^\d{10,15}@s\.whatsapp\.net$/.test(altJid)
    ? altJid
    : rawRemoteJid;

  const instance = String(body.instance ?? body.instanceName ?? "");
  if (!id || !remoteJid || !instance || !/^\d{10,15}@s\.whatsapp\.net$/.test(remoteJid)) return null;

  const pushName = typeof data.pushName === "string" ? data.pushName.trim() : undefined;

  // Unnest ephemeral or view-once wrappers
  const ephemeral = record(message.ephemeralMessage);
  const viewOnce = record(message.viewOnceMessageV2 ?? message.viewOnceMessage);
  const innerMsg = record(ephemeral?.message) ?? record(viewOnce?.message) ?? message;

  const audioMessage = record(innerMsg.audioMessage);
  const imageMessage = record(innerMsg.imageMessage);

  if (audioMessage) {
    const seconds = typeof audioMessage.seconds === "number" ? audioMessage.seconds : undefined;
    return {
      isMedia: true,
      mediaType: "audio",
      seconds,
      data,
      key,
      instance,
      remoteJid,
      id,
      pushName
    };
  }

  if (imageMessage) {
    const caption = typeof imageMessage.caption === "string" ? imageMessage.caption.trim() : undefined;
    return {
      isMedia: true,
      mediaType: "image",
      caption,
      data,
      key,
      instance,
      remoteJid,
      id,
      pushName
    };
  }

  return null;
}

/**
 * Downloads base64 media content from Evolution API.
 */
export async function fetchBase64FromEvolution(
  instance: string,
  data: Record<string, unknown>,
  evolutionUrl: string,
  evolutionKey: string
): Promise<{ base64: string; mimetype: string } | null> {
  const url = `${evolutionUrl}/chat/getBase64FromMediaMessage/${encodeURIComponent(instance)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18_000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: evolutionKey
      },
      body: JSON.stringify({
        message: {
          key: data.key,
          message: data.message
        },
        convertToMp4: false
      }),
      signal: controller.signal,
      cache: "no-store"
    });

    if (!res.ok) {
      console.warn(`[evolution-media-fetch] HTTP ${res.status} from ${instance}`);
      return null;
    }

    const json = (await res.json()) as { base64?: string; mimetype?: string };
    if (!json?.base64) return null;

    return {
      base64: json.base64.replace(/^data:[^;]+;base64,/, ""),
      mimetype: json.mimetype || "application/octet-stream"
    };
  } catch (err) {
    console.warn(`[evolution-media-error]`, err instanceof Error ? err.message : String(err));
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Transcribes an audio file via Whisper in OmniRoute.
 */
export async function transcribeAudioWithWhisper(
  base64Audio: string,
  mimetype: string,
  openaiBaseUrl: string,
  openaiKey: string
): Promise<string | null> {
  const buffer = Buffer.from(base64Audio, "base64");
  if (buffer.length === 0) return null;

  const endpoint = `${openaiBaseUrl.replace(/\/+$/, "")}/audio/transcriptions`;
  const ext = mimetype.includes("mp4") || mimetype.includes("m4a") ? "m4a" : mimetype.includes("mp3") ? "mp3" : "ogg";
  const blob = new Blob([buffer], { type: mimetype || "audio/ogg" });

  const modelsToTry = ["groq/whisper-large-v3-turbo", "groq/whisper-large-v3", "whisper-1"];

  for (const model of modelsToTry) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const formData = new FormData();
      formData.append("file", blob, `voice_note.${ext}`);
      formData.append("model", model);
      formData.append("language", "pt");

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiKey}`
        },
        body: formData,
        signal: controller.signal
      });

      if (res.ok) {
        const data = (await res.json()) as { text?: string };
        const text = data?.text?.trim();
        if (text) return text;
      }
    } catch {
      // Try next whisper model
    } finally {
      clearTimeout(timeout);
    }
  }

  return null;
}

/**
 * Analyzes an image using Qwen Vision via OmniRoute.
 */
export async function analyzeImageWithVision(
  base64Image: string,
  mimetype: string,
  caption: string | undefined,
  openaiBaseUrl: string,
  openaiKey: string
): Promise<string | null> {
  const endpoint = `${openaiBaseUrl.replace(/\/+$/, "")}/chat/completions`;
  const cleanMime = mimetype && mimetype.startsWith("image/") ? mimetype : "image/jpeg";
  const dataUrl = `data:${cleanMime};base64,${base64Image}`;

  const prompt = caption
    ? `O cliente enviou esta imagem no WhatsApp acompanhada da legenda: "${caption}". Analise a imagem com precisão em português brasileiro. Se for um comprovante de pagamento/PIX, leia o valor transferido, o nome do favorecido, a data e a instituição bancária. Se for um produto, documento ou fotografia, descreva o conteúdo de forma objetiva em 2 a 3 frases para que o atendente entenda.`
    : `O cliente enviou esta imagem no WhatsApp. Analise a imagem com precisão em português brasileiro. Se for um comprovante de pagamento/PIX, leia o valor transferido, o nome do favorecido, a data e o banco. Se for um produto, documento ou fotografia, descreva o conteúdo com clareza em 2 a 3 frases objetivas.`;

  const modelsToTry = ["groq/qwen/qwen3.8-27b", "auto/best-vision", "auto/vision"];

  for (const model of modelsToTry) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 22_000);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "image_url", image_url: { url: dataUrl } }
              ]
            }
          ],
          max_tokens: 250
        }),
        signal: controller.signal
      });

      if (res.ok) {
        const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const desc = data?.choices?.[0]?.message?.content?.trim();
        if (desc) return desc;
      }
    } catch {
      // Try next vision candidate
    } finally {
      clearTimeout(timeout);
    }
  }

  return null;
}

/**
 * Resolves an incoming audio or image message into an Incoming text representation.
 */
export async function resolveIncomingMediaMessage(
  payload: unknown,
  cfg: MediaConfig
): Promise<Incoming | null> {
  const inspection = inspectIncomingMedia(payload);
  if (!inspection || !inspection.isMedia) return null;

  const number = inspection.remoteJid.split("@")[0];

  // 1. Fetch media base64 from Evolution API
  const media = await fetchBase64FromEvolution(
    inspection.instance,
    inspection.data,
    cfg.evolutionUrl,
    cfg.evolutionKey
  );

  if (inspection.mediaType === "audio") {
    let transcription = "";
    if (media?.base64) {
      const result = await transcribeAudioWithWhisper(
        media.base64,
        media.mimetype,
        cfg.aiUrl,
        cfg.aiKey
      );
      if (result) transcription = result;
    }

    const text = transcription
      ? `[Mensagem de voz transcrita]: "${transcription}"`
      : `[Mensagem de voz de ${inspection.seconds ? `${inspection.seconds}s` : "áudio"} recebida no WhatsApp]`;

    return {
      id: inspection.id,
      remoteJid: inspection.remoteJid,
      number,
      text,
      instance: inspection.instance,
      pushName: inspection.pushName
    };
  }

  if (inspection.mediaType === "image") {
    let visualDescription = "";
    if (media?.base64) {
      const desc = await analyzeImageWithVision(
        media.base64,
        media.mimetype,
        inspection.caption,
        cfg.aiUrl,
        cfg.aiKey
      );
      if (desc) visualDescription = desc;
    }

    let text = "";
    if (inspection.caption && visualDescription) {
      text = `[Imagem enviada com legenda: "${inspection.caption}"]. Conteúdo visual identificado pela IA: ${visualDescription}`;
    } else if (visualDescription) {
      text = `[Imagem enviada pelo cliente]. Conteúdo visual identificado pela IA: ${visualDescription}`;
    } else if (inspection.caption) {
      text = `[Imagem enviada pelo cliente com legenda: "${inspection.caption}"]`;
    } else {
      text = `[Imagem fotográfica enviada pelo cliente no WhatsApp]`;
    }

    return {
      id: inspection.id,
      remoteJid: inspection.remoteJid,
      number,
      text,
      instance: inspection.instance,
      pushName: inspection.pushName
    };
  }

  return null;
}
