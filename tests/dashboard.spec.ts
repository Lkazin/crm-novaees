import {test,expect} from "@playwright/test";

test("home has a single Supabase login, no legacy token",async({page})=>{
 await page.goto("/");
 await expect(page.getByRole("heading",{name:"Entrar no CRM"})).toBeVisible();
 await expect(page.getByRole("textbox",{name:"E-mail"})).toBeVisible();
 await expect(page.getByLabel("Senha")).toBeVisible();
 await expect(page.getByText("CRM_LAB_ADMIN_TOKEN")).toHaveCount(0);
 await expect(page.getByText("Ana Souza")).toHaveCount(0);
});
for(const width of [1920,1366,768,390,360]){
 test(`viewport ${width}: single login responsive`,async({page})=>{
  await page.setViewportSize({width,height:width<800?844:900});
  await page.goto("/");
  await expect(page.getByRole("heading",{name:"Entrar no CRM"})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);
 });
}
test("legacy Redis browser lab redirects to canonical login",async({page})=>{
 await page.goto("/lab");
 await expect(page).toHaveURL(/\/$/);
 await expect(page.getByRole("heading",{name:"Entrar no CRM"})).toBeVisible();
});
