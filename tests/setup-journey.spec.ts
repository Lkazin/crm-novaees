import {test,expect,type Page} from "@playwright/test";

const TENANT="11111111-1111-4111-8111-111111111111";
const FEATURES=["ai_chat","human_handoff","business_hours_basic","simulator","quick_replies","basic_indicators"];
async function fixture(page:Page,{saved=true,connected=true,embedded=false,simulatorLocked=false}:{saved?:boolean;connected?:boolean;embedded?:boolean;simulatorLocked?:boolean}={}) {
  await page.context().addCookies([{name:embedded?"nw_master_session":"nw_crm_session",value:"fixture-only",domain:"127.0.0.1",path:"/",httpOnly:true,sameSite:"Lax"}]);
  const featureStates=Object.fromEntries(FEATURES.map(id=>[id,{id,name:id==="simulator"?"Simulador da IA":"Recurso de configuração",description:"Configuração da empresa",state:id==="simulator"&&simulatorLocked?"locked_by_plan":"allowed",minPlanId:"crm-business",minPlanName:"CRM Business"}]));
  const plan={planId:"crm-start",name:"CRM Start",price:"59,90",maxWhatsappConnections:1,maxOperators:1,quotaLimit:200,quotaUsed:0,status:"paid",dueDate:"2099-12-01",autoBlock:false};
  const slots=[1,2,3,4,5].map(slot=>({slot,label:`WhatsApp #${slot}`,instanceName:slot===1?"loja_teste":`loja_teste_${slot}`,unlocked:slot===1,status:slot===1?(connected?"connected":"disconnected"):"locked",minPlanId:slot<=3?"crm-business":"crm-premium",minPlanName:slot<=3?"CRM Business":"CRM Premium",channelId:null,pausedByDowngrade:false}));
  const schedule=Object.fromEntries(["seg","ter","qua","qui","sex","sab","dom"].map(day=>[day,{enabled:["seg","qua","sex"].includes(day),openTime:"08:00",closeTime:"18:00",hasBreak:false,breakStart:"12:00",breakEnd:"13:00",intervals:[]}]));
  const settings={agentLabel:"Assistente da Empresa de Teste",enabled:false,instructions:saved?"Responda com clareza e encaminhe dúvidas à equipe.":"",storeInfo:saved?"Empresa de teste para validação de interface. Serviços sob consulta.":"",operatingHours:{enabled:true,timezone:"America/Sao_Paulo",openTime:"08:00",closeTime:"18:00",days:["seg","qua","sex"],sendClosedMessage:true,closedMessage:"A equipe responderá no expediente.",schedule},setupEvidence:{agentSaved:saved,knowledgeSaved:saved,hoursSaved:saved}};
  const mutations:Array<{path:string;body:Record<string,unknown>}>=[];
  let simulatorSucceeds=false;
  await page.route("**/api/**",async route=>{
    const request=route.request(),path=new URL(request.url()).pathname;
    if(request.method()!=="GET") {
      const body=request.postDataJSON();mutations.push({path,body});
      if(path==="/api/crm/operator/ai-settings") {
        Object.assign(settings,body);
        settings.setupEvidence={agentSaved:Boolean(settings.instructions.trim()),knowledgeSaved:Boolean(settings.storeInfo.trim()),hoursSaved:true};
        return route.fulfill({json:{saved:true}});
      }
      if(path==="/api/crm/operator/simulator") return route.fulfill(simulatorSucceeds?{json:{answer:"Resposta recebida do simulador de teste."}}:{status:503,json:{error:"Teste indisponível"}});
      throw new Error(`Unexpected mutation ${path}`);
    }
    let json:unknown={};
    if(path==="/api/crm/auth/session")json={authenticated:true,role:embedded?"master":"client"};
    if(path==="/api/crm/operator/data")json={tenants:[{id:TENANT,name:embedded?"NovaesWeb":"Empresa de Teste",status:"active"}],selectedTenant:TENANT,contacts:[],conversations:[],messages:[],tags:[],contactTags:[],plan,allowedFeatures:FEATURES,featureStates};
    if(path==="/api/crm/operator/ai-settings")json={...settings,plan,allowedFeatures:FEATURES,featureStates,whatsappSlots:slots,quickReplies:[],teamOperators:[]};
    if(path==="/api/crm/operator/features")json={featureStates,quickReplies:[],teamOperators:[],reports:{}};
    if(path==="/api/crm/whatsapp/status")json={connected,state:connected?"open":"close",whatsappSlots:slots};
    if(path==="/api/crm/admin/clients")json={clients:[],upgradeRequests:[]};
    if(path==="/api/crm/admin/plans")json={plans:[],clientCounts:{},enrolledStores:{}};
    await route.fulfill({json});
  });
  return {settings,mutations,succeedSimulator:()=>{simulatorSucceeds=true;}};
}
async function openStep(page:Page,id:string,action:string) {
  await page.getByTestId(`setup-step-${id}`).click();
  await page.getByTestId("setup-step-detail").getByRole("button",{name:action,exact:true}).click();
}

test("all plans receive six steps without inventing completion from defaults or drafts",async({page})=>{
  await fixture(page,{saved:false,connected:false});await page.goto("/cliente");
  await expect(page.getByTestId("setup-journey").getByRole("listitem")).toHaveCount(6);
  await expect(page.getByTestId("setup-step-business")).toHaveAttribute("data-confirmed","false");
  await openStep(page,"business","Organizar informações");
  const knowledge=page.getByRole("textbox",{name:"Informações da empresa e base de conhecimento",exact:true});
  await expect(knowledge).toBeFocused();
  await expect(knowledge).toHaveAttribute("maxlength","20000");
  await knowledge.fill("Informação digitada ainda não salva.");
  await expect(page.getByTestId("setup-step-business")).toHaveAttribute("data-confirmed","false");
  await expect(page.getByTestId("setup-journey").getByText(/Há alterações ainda não salvas/)).toBeVisible();
  await expect(page.getByRole("button",{name:"Conferi as configurações",exact:true})).toBeDisabled();
});

test("saved settings and simulator failure cannot pretend successful testing; review requires explicit confirmation",async({page})=>{
  const state=await fixture(page);await page.goto("/cliente");
  await expect(page.getByTestId("setup-step-hours")).toHaveAttribute("data-confirmed","true");
  await expect(page.getByTestId("setup-journey").getByText(/Há alterações ainda não salvas/)).toHaveCount(0);
  await openStep(page,"test","Abrir simulador");
  const input=page.getByPlaceholder("Digite uma mensagem como se você fosse seu cliente no WhatsApp...");
  await input.fill("Como funciona?");await input.press("Enter");
  await expect(page.getByText("Teste indisponível",{exact:true})).toBeVisible();
  await expect(page.getByTestId("setup-step-test")).toHaveAttribute("data-confirmed","false");
  state.succeedSimulator();await input.fill("Quais serviços vocês oferecem?");await input.press("Enter");
  await expect(page.getByText("Resposta recebida do simulador de teste.",{exact:true})).toBeVisible();
  await expect(page.getByTestId("setup-step-test")).toHaveAttribute("data-confirmed","true");
  await openStep(page,"review","Revisar configuração");
  const confirm=page.getByRole("button",{name:"Conferi as configurações",exact:true});await expect(confirm).toBeEnabled();await confirm.click();
  await expect(page.getByTestId("setup-step-review")).toHaveAttribute("data-confirmed","true");
  await expect(page.getByRole("button",{name:/6 de 6 etapas confirmadas/})).toBeVisible();
  expect(state.mutations.every(m=>m.path==="/api/crm/operator/simulator")).toBe(true);
  expect(state.settings.enabled).toBe(false);
  await page.getByRole("textbox",{name:"Instruções de comportamento da IA",exact:true}).fill("Novas instruções, ainda não salvas.");
  await expect(page.getByTestId("setup-step-review")).toHaveAttribute("data-confirmed","false");
});

test("saving confirms persisted content, counters preserve instruction text and new settings invalidate simulator",async({page})=>{
  const state=await fixture(page,{saved:false});await page.goto("/cliente");await openStep(page,"instructions","Editar instruções");
  const instructions=page.getByRole("textbox",{name:"Instruções de comportamento da IA",exact:true});
  await expect(instructions).not.toHaveAttribute("maxlength",/.+/);
  await instructions.fill("Regra real de comportamento. ".repeat(100));
  const knowledge=page.getByRole("textbox",{name:"Informações da empresa e base de conhecimento",exact:true});await knowledge.fill("Dados reais da empresa para teste de gravação.");
  await page.getByRole("button",{name:"Salvar Configurações da Minha IA",exact:true}).click();
  await expect(page.getByText(/Configurações gravadas\. Teste as respostas/)).toBeVisible();
  await expect(page.getByTestId("setup-step-instructions")).toHaveAttribute("data-confirmed","true");
  await expect(page.getByTestId("setup-step-business")).toHaveAttribute("data-confirmed","true");
  await expect(page.getByTestId("setup-step-test")).toHaveAttribute("data-confirmed","false");
  expect(state.settings.instructions.length).toBeGreaterThan(2000);
});

for(const embedded of [false,true])for(const width of [390,1440])test(`setup guide ${embedded?"Master":"client"} at ${width} keeps real status and fits viewport`,async({page})=>{
  await page.setViewportSize({width,height:1000});await fixture(page,{embedded});await page.goto(embedded?"/admin?section=crm":"/cliente");
  await expect(page.getByTestId("setup-journey")).toBeVisible();
  await expect(page.getByTestId("setup-step-test")).toHaveAttribute("data-confirmed","false");
  await openStep(page,"business","Organizar informações");
  await expect(page.getByRole("textbox",{name:"Informações da empresa e base de conhecimento",exact:true})).toBeFocused();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.evaluate(()=>window.scrollTo({top:0,left:0,behavior:"instant"}));
  await page.screenshot({path:`screenshots/setup-${embedded?"master":"client"}-${width}.png`,fullPage:true});
  await page.screenshot({path:`screenshots/setup-viewport-${embedded?"master":"client"}-${width}.png`,fullPage:false});
});

test("plan locks offer upgrade while guide navigation stays available outside the disabled feature",async({page})=>{
  await fixture(page,{simulatorLocked:true});await page.goto("/cliente");
  await page.getByTestId("setup-step-test").click();
  await expect(page.getByTestId("setup-step-detail").getByRole("button",{name:"Solicitar CRM Business",exact:true})).toBeVisible();
  await openStep(page,"business","Organizar informações");
  await expect(page.getByRole("textbox",{name:"Informações da empresa e base de conhecimento",exact:true})).toBeEnabled();
});

for(const embedded of [false,true])test(`section search ${embedded?"Master":"client"} respects accents, drafts and keyboard navigation`,async({page})=>{
  await fixture(page,{embedded});await page.goto(embedded?"/admin?section=crm":"/cliente");
  await openStep(page,"instructions","Editar instruções");
  const instructions=page.getByRole("textbox",{name:"Instruções de comportamento da IA",exact:true});
  await instructions.fill("Rascunho da empresa ainda não salvo.");
  const nav=page.getByRole("navigation",{name:embedded?"Seções do CRM NovaesWeb":"Seções do painel do cliente",exact:true});
  const search=nav.getByRole("searchbox",{name:"Buscar seção do painel",exact:true});
  await search.fill("horarios");
  await expect(nav.getByRole("button",{name:embedded?"Horários":"Horários de Atendimento",exact:true})).toBeVisible();
  await expect(instructions).toHaveValue("Rascunho da empresa ainda não salvo.");
  await search.fill("seção inexistente");await expect(nav.getByRole("status")).toHaveText("Nenhuma seção encontrada. Tente outro nome.");
  await expect(instructions).toHaveValue("Rascunho da empresa ainda não salvo.");
  await nav.getByRole("button",{name:"Limpar busca de seções",exact:true}).click();await expect(search).toHaveValue("");await expect(search).toBeFocused();
  await expect(nav.getByRole("button",{name:embedded?"IA e conhecimento":"Minha IA (Cérebro da Loja)",exact:true})).toHaveAttribute("aria-current","page");
  await search.fill("horarios");await search.press("Escape");await expect(search).toHaveValue("");
  await search.fill("horarios");await search.press("Enter");await expect(search).toHaveValue("");
  await expect(nav.getByRole("button",{name:embedded?"Horários":"Horários de Atendimento",exact:true})).toHaveAttribute("aria-current","page");
  await nav.getByRole("button",{name:embedded?"IA e conhecimento":"Minha IA (Cérebro da Loja)",exact:true}).click();
  await expect(instructions).toHaveValue("Rascunho da empresa ainda não salvo.");
});
