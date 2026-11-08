import { test } from "node:test";
import assert from "node:assert/strict";
import {
  inspectIncomingMedia,
  resolveIncomingMediaMessage
} from "./media";

const sampleAudioPayload = {
  event: "messages.upsert",
  instance: "crmtest",
  data: {
    key: { id: "AUDIO1", remoteJid: "5511999998888@s.whatsapp.net", fromMe: false },
    pushName: "Carlos",
    messageType: "audioMessage",
    message: {
      audioMessage: {
        url: "https://mmg.whatsapp.net/v/t62.7114-24/...",
        mimetype: "audio/ogg; codecs=opus",
        seconds: 6,
        ptt: true
      }
    }
  }
};

const sampleImagePayload = {
  event: "messages.upsert",
  instance: "crmtest",
  data: {
    key: { id: "IMG1", remoteJid: "5511999997777@s.whatsapp.net", fromMe: false },
    pushName: "Mariana",
    messageType: "imageMessage",
    message: {
      imageMessage: {
        url: "https://mmg.whatsapp.net/v/t62.7114-24/...",
        mimetype: "image/jpeg",
        caption: "Comprovante PIX pago"
      }
    }
  }
};

const sampleTextPayload = {
  event: "messages.upsert",
  instance: "crmtest",
  data: {
    key: { id: "TXT1", remoteJid: "5511999996666@s.whatsapp.net", fromMe: false },
    message: { conversation: "Olá!" }
  }
};

test("inspectIncomingMedia: correctly identifies audio message", () => {
  const result = inspectIncomingMedia(sampleAudioPayload);
  assert.ok(result);
  assert.equal(result.isMedia, true);
  assert.equal(result.mediaType, "audio");
  assert.equal(result.id, "AUDIO1");
  assert.equal(result.instance, "crmtest");
  assert.equal(result.seconds, 6);
  assert.equal(result.pushName, "Carlos");
});

test("inspectIncomingMedia: correctly identifies image message with caption", () => {
  const result = inspectIncomingMedia(sampleImagePayload);
  assert.ok(result);
  assert.equal(result.isMedia, true);
  assert.equal(result.mediaType, "image");
  assert.equal(result.id, "IMG1");
  assert.equal(result.instance, "crmtest");
  assert.equal(result.caption, "Comprovante PIX pago");
  assert.equal(result.pushName, "Mariana");
});

test("inspectIncomingMedia: ignores plain text messages", () => {
  const result = inspectIncomingMedia(sampleTextPayload);
  assert.equal(result, null);
});

test("inspectIncomingMedia: handles ephemeral wrapped audio", () => {
  const ephemeralPayload = {
    event: "messages.upsert",
    instance: "crmtest",
    data: {
      key: { id: "AUDIO2", remoteJid: "5511999998888@s.whatsapp.net", fromMe: false },
      message: {
        ephemeralMessage: {
          message: {
            audioMessage: { mimetype: "audio/ogg", seconds: 12 }
          }
        }
      }
    }
  };
  const result = inspectIncomingMedia(ephemeralPayload);
  assert.ok(result);
  assert.equal(result.mediaType, "audio");
  assert.equal(result.seconds, 12);
});

test("inspectIncomingMedia: ignores fromMe=true messages", () => {
  const selfAudio = {
    ...sampleAudioPayload,
    data: {
      ...sampleAudioPayload.data,
      key: { ...sampleAudioPayload.data.key, fromMe: true }
    }
  };
  assert.equal(inspectIncomingMedia(selfAudio), null);
});

test("resolveIncomingMediaMessage: returns fallback text when download fails", async () => {
  // Use dummy invalid url to trigger fetch failure
  const resolved = await resolveIncomingMediaMessage(sampleAudioPayload, {
    evolutionUrl: "http://127.0.0.1:9999",
    evolutionKey: "test",
    aiUrl: "http://127.0.0.1:9999",
    aiKey: "test"
  });

  assert.ok(resolved);
  assert.equal(resolved.id, "AUDIO1");
  assert.equal(resolved.instance, "crmtest");
  assert.equal(resolved.number, "5511999998888");
  assert.match(resolved.text, /\[Mensagem de voz/);
});

test("resolveIncomingMediaMessage: returns caption for image when vision service unavailable", async () => {
  const resolved = await resolveIncomingMediaMessage(sampleImagePayload, {
    evolutionUrl: "http://127.0.0.1:9999",
    evolutionKey: "test",
    aiUrl: "http://127.0.0.1:9999",
    aiKey: "test"
  });

  assert.ok(resolved);
  assert.equal(resolved.id, "IMG1");
  assert.equal(resolved.instance, "crmtest");
  assert.equal(resolved.number, "5511999997777");
  assert.match(resolved.text, /Comprovante PIX pago/);
});
