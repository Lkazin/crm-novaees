import { test, expect } from "@playwright/test";

const TENANT="11111111-1111-4111-8111-111111111111";
test("knowledge editor explains character limits and preserves an archived save state",async({page,context,baseURL})=>{
  await context.addCookies([{name:"nw_crm_session",value:"fixture-only",url:baseURL!}]);
  const article={id:"22222222-2222-4222-8222-222222222222",title:"Produtos",body:"Informações da empresa",status:"archived",updated_at:"2026-11-10T12:00:00Z"};
  await page.route("**/api/**",async route=>{
    const request=route.request(),path=new URL(request.url()).pathname;
    if(path==="/api/crm/operator/data")return route.fulfill({json:{tenants:[{id:TENANT,name:"Empresa de teste",status:"active"}]}});
    if(path==="/api/crm/operator/knowledge"){
      if(request.method()==="GET")return route.fulfill({json:{articles:[article],limited:false}});
      expect(request.method()).toBe("PATCH");
      expect(request.postDataJSON().status).toBe("archived");
      return route.fulfill({json:{updated:true}});
    }
    throw Error("Unexpected fixture traffic "+path);
  });
  await page.goto("/cliente/knowledge");
  await page.getByRole("button",{name:/Produtos.*Arquivado/}).click();
  const content=page.getByLabel("O que a IA precisa saber sobre este assunto",{exact:true});
  await expect(content).toHaveAttribute("maxlength","20000");
  await content.fill("Preço sob consulta.");
  await expect(page.getByText("19 / 20.000 caracteres",{exact:true})).toBeVisible();
  await expect(page.getByText("19.981 restantes",{exact:true})).toBeVisible();
  await page.getByText("Como escrever uma boa informação?",{exact:true}).click();
  await expect(page.getByText("Informe preços, condições e exceções que realmente existem.",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Salvar informações",exact:true}).click();
  await expect(page.getByRole("status")).toHaveText("Informações arquivadas. Elas não serão usadas nas respostas da IA.");
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);
});
