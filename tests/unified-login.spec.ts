import {test,expect} from "@playwright/test";

test("root address shows one email/password login, not legacy admin token",async({page})=>{
  await page.goto("/");
  await expect(page.getByRole("heading",{name:"Entrar no CRM"})).toBeVisible();
  await expect(page.getByRole("textbox",{name:"E-mail"})).toBeVisible();
  await expect(page.getByLabel("Senha")).toBeVisible();
  await expect(page.getByText("CRM_LAB_ADMIN_TOKEN")).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Entrar",exact:true})).toBeVisible();
});
test("operator alias goes to same canonical login",async({page})=>{
  await page.goto("/operator");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading",{name:"Entrar no CRM"})).toBeVisible();
});
test("legacy token lab is separate from the customer login",async({page})=>{
  await page.goto("/lab");
  await expect(page.getByRole("heading",{name:"Acessar atendimentos reais"})).toBeVisible();
  await expect(page.getByRole("textbox",{name:"Token administrativo do CRM"})).toBeVisible();
});
for(const width of [360,390,768,1366]){
 test(`canonical login fits viewport ${width}`,async({page})=>{
  await page.setViewportSize({width,height:840});
  await page.goto("/");
  await expect(page.getByRole("heading",{name:"Entrar no CRM"})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1)).toBe(false);
 });
}
