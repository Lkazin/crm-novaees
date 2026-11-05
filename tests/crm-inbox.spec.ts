import { test, expect } from "@playwright/test";
test("private CRM inbox rejects requests without the admin token", async ({ request }) => {
 const response = await request.get("/api/crm/inbox");
 expect(response.status()).toBe(401);
 expect(response.headers()["cache-control"]).toContain("no-store");
});

test("private CRM status rejects requests without token", async ({ request }) => {
 const response = await request.get("/api/crm/status");
 expect(response.status()).toBe(401);
 expect(response.headers()["cache-control"]).toContain("no-store");
});
