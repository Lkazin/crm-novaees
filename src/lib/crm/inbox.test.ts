import { test } from "node:test";
import assert from "node:assert/strict";
import { captureIncoming } from "./inbox";

test("capture is disabled by default and safe without Redis", async () => {
 const original = process.env.CRM_INBOX_CAPTURE_ENABLED;
 delete process.env.CRM_INBOX_CAPTURE_ENABLED;
 try {
  await assert.doesNotReject(captureIncoming({ id: "a", instance: "x", number: "5511999999999", remoteJid: "5511999999999@s.whatsapp.net", text: "Oi" }));
 } finally {
  if (original === undefined) delete process.env.CRM_INBOX_CAPTURE_ENABLED;
  else process.env.CRM_INBOX_CAPTURE_ENABLED = original;
 }
});
