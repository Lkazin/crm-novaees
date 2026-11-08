import {test,expect} from "@playwright/test";

for (const scope of ["master","client"] as const) {
  const url=scope==="master"?"/novaescrmadm":"/";
  const title=scope==="master"?"Acesso ao Painel Master":"Acesso da Empresa";
  test(`${scope}: scoped session, own credentials and fixed workspace`,async({page})=>{
    await page.route("**/api/crm/auth/session*",async route=>{
      if(route.request().method()==="GET") {
        expect(new URL(route.request().url()).searchParams.get("scope")).toBe(scope);
        return route.fulfill({json:{authenticated:false}});
      }
      expect(route.request().postDataJSON()).toMatchObject({scope,email:"portal@example.com",password:"fixture-password"});
      return route.fulfill({json:{success:true,role:scope,redirectTo:"https://external.invalid"}});
    });
    const destination=scope==="master"?"/admin":"/cliente";
    await page.route(`**${destination}`,route=>route.fulfill({contentType:"text/html",body:"<h1>Workspace autorizado</h1>"}));
    await page.goto(url);
    await expect(page.getByRole("heading",{name:title,exact:true})).toBeVisible();
    await page.getByLabel(scope==="master"?"E-mail do administrador":"E-mail da sua conta",{exact:true}).fill("portal@example.com");
    await page.getByLabel("Senha",{exact:true}).fill("fixture-password");
    await page.getByRole("button",{name:scope==="master"?"Entrar no Painel Master":"Entrar na minha empresa",exact:true}).click();
    await expect(page).toHaveURL(new RegExp(`${destination}$`));
  });
  test(`${scope}: refuses successful response for another role`,async({page})=>{
    await page.route("**/api/crm/auth/session*",route=>route.fulfill({json:route.request().method()==="GET"?{authenticated:false}:{success:true,role:scope==="master"?"client":"master",redirectTo:"/admin"}}));
    await page.goto(url);
    await page.getByLabel(scope==="master"?"E-mail do administrador":"E-mail da sua conta",{exact:true}).fill("portal@example.com");
    await page.getByLabel("Senha",{exact:true}).fill("fixture-password");
    await page.getByRole("button",{name:scope==="master"?"Entrar no Painel Master":"Entrar na minha empresa",exact:true}).click();
    await expect(page.getByRole("alert").filter({hasText:scope==="master"?"Este acesso é exclusivo":"Use o acesso de cliente"})).toBeVisible();
    await expect(page.locator("main")).toHaveAttribute("data-login-scope",scope);
  });
  for(const width of [360,768,1366]) test(`${scope}: distinct identity fits viewport ${width}`,async({page})=>{
    await page.setViewportSize({width,height:900});
    await page.route("**/api/crm/auth/session*",route=>route.fulfill({json:{authenticated:false}}));
    await page.goto(url);
    await expect(page.getByRole("heading",{name:title,exact:true})).toBeVisible();
    await expect(page.locator("main")).toHaveAttribute("data-login-scope",scope);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.screenshot({path:`test-results/login-${scope}-${width}.png`,fullPage:true});
  });
}
