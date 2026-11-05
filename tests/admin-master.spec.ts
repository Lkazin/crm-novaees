import {test,expect} from "@playwright/test";

test("Master page is available but never reveals companies without operator login",async({page})=>{
 await page.goto("/admin");
 await expect(page.getByRole("heading",{name:"Central Administrativa"})).toBeVisible();
 await expect(page.getByText("Acesso administrativo indisponível")).toBeVisible();
 await expect(page.getByText("Nenhuma empresa cadastrada no CRM.")).toHaveCount(0);
});
test("Master overview rejects unauthenticated requests",async({request})=>{
 const res=await request.get("/api/crm/admin/overview");
 expect(res.status()).toBe(401);
 expect(res.headers()["cache-control"]).toContain("no-store");
 const payload=await res.json();
 expect(payload.error).toBe("unauthorized");
});
for(const width of [360,390,768,1366]){
 test(`Master viewport ${width}: no horizontal overflow`,async({page})=>{
  await page.setViewportSize({width,height:880});
  await page.goto("/admin");
  await expect(page.getByRole("heading",{name:"Central Administrativa"})).toBeVisible();
  const over=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
  expect(over).toBe(false);
 });
}
