import { test, expect } from "@playwright/test";

test("AI lab test endpoint fails closed without admin token", async ({ request }) => {
  const result = await request.post("/api/ai/test", { data: { question: "Oi" } });
  expect(result.status()).toBe(401);
});
test("Evolution webhook fails closed without shared secret", async ({ request }) => {
  const result = await request.post("/api/evolution/webhook", { data: { event: "messages.upsert" } });
  expect(result.status()).toBe(401);
});
test("health endpoint never claims verified live connection", async ({ request }) => {
  const response = await request.get("/api/ai/health");
  expect(response.ok()).toBe(true);
  const json = await response.json();
  expect(json.liveConnectionVerified).toBe(false);
});
