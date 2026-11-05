"use client";
import {useCallback,useEffect,useState} from "react";
import Link from "next/link";
import {ArrowLeft,BrainCircuit,CheckCircle2,LockKeyhole,Play,RefreshCw,ShieldCheck,AlertCircle,Smartphone,Image as ImageIcon,Video} from "lucide-react";

type Status={approvedModels:string[];enabled:boolean;gatewayConfigured:boolean;evolutionInstance:string|null;whatsappSending:boolean;note:string};
type TestResult={answer:string;requestedModel:string;reportedModel:string|null;tokens:{input:number|null;output:number|null}|null;whatsappSent:boolean;costVerified:boolean};
const providers=[
 {name:"Groq",ability:"Texto e imagens (conforme modelo)",cost:"Plano gratuito sujeito a limites",link:"https://console.groq.com/docs/rate-limits",tag:"Primeira opção"},
 {name:"Google Gemini API",ability:"Texto, fotos, áudio e vídeo",cost:"Cota gratuita por modelo/projeto",link:"https://ai.google.dev/gemini-api/docs/rate-limits",tag:"Multimodal"},
 {name:"OpenRouter",ability:"25+ modelos grátis; alguns multimodais",cost:"50 chamadas/dia em variantes :free sem créditos",link:"https://openrouter.ai/collections/free-models",tag:"Modelos variados"},
 {name:"Cloudflare Workers AI",ability:"Texto e visão em modelos selecionados",cost:"10.000 Neurons gratuitos por dia",link:"https://developers.cloudflare.com/workers-ai/platform/pricing/",tag:"Reserva"},
 {name:"Mistral API",ability:"Modelos conforme conta gratuita",cost:"Plano gratuito com limites",link:"https://docs.mistral.ai/getting-started/quickstarts/studio/activate-and-generate-api-key",tag:"Reserva"},
 {name:"Ollama local",ability:"Texto e imagens no Qwen3-VL",cost:"Sem cobrança por requisição; exige hardware",link:"https://ollama.com/library/qwen3-vl",tag:"Infraestrutura própria"}
];
export default function ProvidersLab(){
 const [state,setState]=useState<Status|null>(null);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [model,setModel]=useState("");
 const [question,setQuestion]=useState("");
 const [output,setOutput]=useState<TestResult|null>(null);
 const refresh=useCallback(async()=>{
  setLoading(true);setError("");
  try{
   const res=await fetch("/api/crm/admin/ai-lab",{cache:"no-store"});
   if(!res.ok){setState(null);setError(res.status===401?"Entre no Portal Operacional antes de abrir o laboratório.":res.status===403?"Sua conta não tem autorização Master/Administrador para o laboratório.":"Status indisponível. Confira as configurações.");return;}
   const json=await res.json() as Status;
   setState(json);setModel(prev=>json.approvedModels.includes(prev)?prev:(json.approvedModels[0]??""));
  }catch{setError("Falha na conexão com a API de diagnóstico.");}finally{setLoading(false);}
 },[]);
 useEffect(()=>{void refresh();},[refresh]);
 async function test(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();setBusy(true);setError("");setOutput(null);
  try{
   const res=await fetch("/api/crm/admin/ai-lab/test",{
    method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({model,question})
   });
   const data=await res.json() as TestResult&{error?:string};
   if(!res.ok){setError(data.error==="test_quota_exceeded"?"Limite de testes deste operador atingido.":data.error==="provider_rate_limited"?"O provedor retornou limite de uso (429).":"Teste não concluído. Confira modelo, rota e gateway.");return;}
   setOutput(data);
  }catch{setError("Gateway indisponível. Nenhuma mensagem de WhatsApp foi enviada por este teste.");}
  finally{setBusy(false);}
 }
 return <main className="adm-shell">
  <div className="adm-top"><Link href="/admin" className="adm-back"><ArrowLeft size={17}/> Central Master</Link><div className="adm-brand"><BrainCircuit size={22}/> NovaesWeb · Laboratório de IAs</div></div>
  <header className="adm-header"><div><h1>Central de Provedores de IA</h1><p>Pesquisar, comparar e testar modelos antes de autorizar seu uso no CRM dos clientes.</p></div>
   <button className="op-refresh" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={17}/> Atualizar</button></header>
  <div className="adm-notice"><ShieldCheck size={17}/> Provedores abaixo são opções pesquisadas, não conexões confirmadas. Nenhuma chave ou conta de terceiros aparece nesta tela.</div>
  <section className="lab-grid">
   {providers.map(p=><article className="op-card lab-provider" key={p.name}>
    <span className="lab-provider-tag">{p.tag}</span><h2>{p.name}</h2>
    <p>{p.ability}</p><small>{p.cost}</small>
    <a href={p.link} target="_blank" rel="noopener noreferrer">Documentação oficial</a>
   </article>)}
  </section>
  {loading?<section className="op-card adm-placeholder"><RefreshCw size={26}/><strong>Consultando configuração real…</strong></section>
   :error&&!state?<section className="op-card adm-placeholder"><LockKeyhole size={27}/><h2>Laboratório protegido</h2><p role="alert">{error}</p><Link className="adm-back" href="/operator">Abrir login</Link></section>
   :state&&<section className="op-card lab-console">
    <h2><Play size={21}/> Teste controlado de texto</h2>
    <p>O laboratório usa somente os IDs de modelos que você aprovou no servidor. O envio de WhatsApp está desativado aqui, independentemente da configuração da Evolution.</p>
    <div className="lab-configuration">
      <span><CheckCircle2 size={15}/> Gateway: {state.gatewayConfigured?"Credenciais presentes (conexão não verificada)":"Não configurado"}</span>
      <span><ShieldCheck size={15}/> Teste: {state.enabled?"Autorizado no servidor":"Desligado por segurança"}</span>
      <span><Smartphone size={15}/> Instância reservada: {state.evolutionInstance??"Não informada"}</span>
      <span><LockKeyhole size={15}/> Envio para WhatsApp: bloqueado neste laboratório</span>
    </div>
    <form className="lab-test-form" onSubmit={e=>void test(e)}>
     <label>Rota aprovada
      <select aria-label="Rota de IA autorizada" value={model} onChange={e=>setModel(e.target.value)} disabled={!state.enabled||!state.approvedModels.length}>
       {!state.approvedModels.length&&<option value="">Nenhuma rota cadastrada</option>}
       {state.approvedModels.map(x=><option key={x} value={x}>{x}</option>)}
      </select>
     </label>
     <label>Mensagem de teste (sem dados pessoais)
      <textarea rows={3} minLength={3} maxLength={500} value={question} onChange={e=>setQuestion(e.target.value)}
       placeholder="Ex.: Como você responderia a um cliente perguntando o horário, se a empresa ainda não forneceu essa informação?"/>
     </label>
     <button type="submit" className="op-primary" disabled={busy||!state.enabled||!model||question.trim().length<3}>
      <Play size={16}/>{busy?"Consultando a IA...":"Testar resposta sem WhatsApp"}
     </button>
    </form>
    {error&&<p className="op-alert" role="alert"><AlertCircle size={17}/>{error}</p>}
    {output&&<div className="lab-output" role="status">
      <strong>Resposta retornada pelo gateway</strong><p>{output.answer}</p>
      <small>Solicitado: {output.requestedModel} · Reportado: {output.reportedModel??"não informado"} · WhatsApp não enviado · Custo não verificado</small>
    </div>}
    <div className="lab-media-readiness">
      <span><ImageIcon size={17}/> Foto: adaptador de mídia do WhatsApp pendente</span>
      <span><Video size={17}/> Vídeo: download seguro e análise multimodal pendentes</span>
    </div>
   </section>}
  <p className="adm-footer">Os planos gratuitos podem mudar ou proibir determinados usos comerciais. Antes de ativar qualquer provedor para clientes, confirme preços, privacidade, termos e cotas reais da conta.</p>
 </main>;
}
