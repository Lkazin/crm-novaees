import { test, expect } from "@playwright/test";

test("knowledge editor requires an authenticated operator",async({page})=>{
 await page.goto("/operator/knowledge");
 await expect(page.getByRole("heading",{name:"Base de Conhecimento"})).toBeVisible();
 await expect(page.getByText("Sem empresas vinculadas a este usuário.")).toBeVisible();
 await expect(page.getByRole("button",{name:"Salvar no Supabase"})).toHaveCount(0);
});
test("knowledge read endpoint rejects unauthenticated session",async({request})=>{
 const r=await request.get("/api/crm/operator/knowledge?tenant=123e4567-e89b-12d3-a456-426614174000");
 expect(r.status()).toBe(401);
});
test("knowledge editing is inaccessible without a valid session",async({request})=>{
 const r=await request.post("/api/crm/operator/knowledge",{headers:{"Origin":"http://localhost:3040"},data:{
  tenantId:"123e4567-e89b-12d3-a456-426614174000",title:"Atendimento comercial",body:"Dados verificados"
 }});
 expect([401,403]).toContain(r.status());
});
for(const width of [360,390,768,1366]){
 test(`knowledge editor fits screen ${width}`,async({page})=>{
  await page.setViewportSize({width,height:820});await page.goto("/operator/knowledge");
  await expect(page.getByRole("heading",{name:"Base de Conhecimento"})).toBeVisible();
  const over=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
  expect(over).toBe(false);
 });
}
