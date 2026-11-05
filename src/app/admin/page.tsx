"use client";
import { useEffect,useState } from "react";
import Link from "next/link";
import {BarChart3,Building2,ChevronLeft,LockKeyhole,RefreshCw,ShieldCheck,Wifi,AlertCircle,PlusCircle,CheckCircle2} from "lucide-react";

type Usage={requests:number;tokens:number;costUsd:number;errors:number};
type Limit={monthly_model_requests:number|null;monthly_token_limit:number|null;monthly_budget_usd:number|null;hard_stop_on_limit:boolean};
type Company={id:string;name:string;status:string;created_at:string;channels:{instance:string;status:string}[];usage:Usage;limits:Limit|null};
type Overview={role:string;month:string;limited:boolean;companies:Company[];totals:{companies:number;connectedChannels:number;modelEvents:number};note:string};
export default function AdminCRM() {
 const [overview,setOverview]=useState<Overview|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [name,setName]=useState("");
 const [creating,setCreating]=useState(false);
 const [notice,setNotice]=useState("");
 async function refresh(){
  setLoading(true);setError("");
  try {
   const res=await fetch("/api/crm/admin/overview",{credentials:"same-origin",cache:"no-store"});
   if(!res.ok){
    const e=await res.json() as {error?:string};
    setOverview(null);
    setError(res.status===401?"Faça login pelo Portal Operacional.":res.status===403?"Esta conta não está cadastrada como funcionário autorizado da plataforma.":e.error==="admin_backend_unavailable"?"O backend administrativo ainda não está configurado no servidor.":"Não foi possível consultar a Central.");
    return;
   }
   setOverview(await res.json() as Overview);
  }catch{setOverview(null);setError("Falha ao consultar o servidor.");}
  finally{setLoading(false);}
 }
 async function createCompany(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();
  setCreating(true);setError("");setNotice("");
  try {
   const response=await fetch("/api/crm/admin/companies",{
    method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({name})
   });
   if(!response.ok){
    const errors:Record<number,string>={400:"Nome inválido. Confira o cadastro.",401:"Faça login novamente.",403:"Sua conta não pode cadastrar empresas.",503:"Não foi possível registrar a empresa. Consulte o diagnóstico do servidor."};
    setError(errors[response.status]??"Não foi possível cadastrar a empresa.");
    return;
   }
   setNotice("Empresa registrada como inativa, com auditoria. Nenhum WhatsApp ou IA foi ativado.");
   setName("");
   await refresh();
  }catch {setError("Falha de conexão. Confira o registro antes de tentar novamente.");}
  finally{setCreating(false);}
 }
 useEffect(()=>{void refresh();},[]);
 return <main className="adm-shell">
  <div className="adm-top"><Link href="/operator" className="adm-back"><ChevronLeft size={17}/> Portal Operacional</Link><div className="adm-brand"><ShieldCheck size={22}/> NovaesWeb CRM AI · Master</div></div>
  <header className="adm-header"><div><h1>Central Administrativa</h1><p>Empresas, canais e consumo efetivamente registrados no Supabase.</p></div>
   <button className="op-refresh" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={16}/> Atualizar</button></header>
  {loading?<div className="op-card adm-placeholder"><RefreshCw size={28}/><strong>Consultando dados reais…</strong></div>
  :error?<div className="op-card adm-placeholder"><LockKeyhole size={27}/><h2>Acesso administrativo indisponível</h2><p role="alert">{error}</p><Link href="/operator" className="adm-back">Abrir login individual</Link></div>
  :overview&&<>
   <div className="adm-notice"><ShieldCheck size={17}/> Papel autorizado: {overview.role}. Empresas novas são sempre inativas; canais e cobranças não são alterados.</div>
   <section className="op-stats">
    <div className="op-card"><Building2 size={22}/><span>Empresas cadastradas (até 100)</span><strong>{overview.totals.companies}</strong></div>
    <div className="op-card"><Wifi size={22}/><span>Canais marcados como conectados no banco</span><strong>{overview.totals.connectedChannels}</strong></div>
    <div className="op-card"><BarChart3 size={22}/><span>Eventos de uso registrados no mês (até 1.000)</span><strong>{overview.totals.modelEvents}</strong></div>
   </section>
   {overview.limited&&<p className="adm-warning"><AlertCircle size={16}/> Há mais dados do que o limite desta consulta. Os totais exibidos não representam necessariamente toda a plataforma.</p>}
   {(overview.role==="MASTER"||overview.role==="ADMINISTRADOR")&&<section className="op-card adm-create-company">
    <div className="adm-section-header"><h2>Nova empresa</h2><span>Cadastro real · inicia inativa</span></div>
    <p>Registra a empresa no Supabase com configurações seguras e auditoria. Não cria usuários, conecta WhatsApp ou ativa IA.</p>
    <form onSubmit={e=>void createCompany(e)} className="adm-create-form">
      <label htmlFor="adm-name">Nome da empresa</label>
      <input id="adm-name" value={name} onChange={e=>setName(e.target.value)} minLength={2} maxLength={160} required placeholder="Nome comercial real"/>
      <button type="submit" className="op-primary" disabled={creating||name.trim().length<2}><PlusCircle size={18}/>{creating?"Registrando...":"Cadastrar inativa"}</button>
    </form>
    {notice&&<p role="status" className="adm-create-success"><CheckCircle2 size={17}/>{notice}</p>}
   </section>}
   <section className="op-card adm-companies"><div className="adm-section-header"><h2>Empresas</h2><span>Visualização somente leitura</span></div>
    {overview.companies.length?overview.companies.map(c=><article key={c.id} className="adm-company">
      <div className="adm-company-head"><div><strong>{c.name}</strong><span>{c.status==="active"?"Ativa":c.status==="suspended"?"Suspensa":"Inativa"}</span></div><small>Cadastro: {new Date(c.created_at).toLocaleDateString("pt-BR")}</small></div>
      <div className="adm-metrics"><span>Requisições contabilizadas: <b>{c.usage.requests}</b></span><span>Tokens contabilizados: <b>{c.usage.tokens}</b></span><span>Erros registrados: <b>{c.usage.errors}</b></span><span>Custo estimado registrado: <b>US$ {c.usage.costUsd.toFixed(4)}</b></span></div>
      <p className="adm-secondary">WhatsApps: {c.channels.length?c.channels.map(v=>v.instance+" ("+v.status+")").join(", "):"nenhum canal cadastrado"}.</p>
      <p className="adm-secondary">Limites: {c.limits?"Configuração cadastrada, ainda não aplicada pelo motor de IA.":"Ainda não configurados."}</p>
    </article>):<div className="op-empty">Nenhuma empresa cadastrada no CRM. Não foram criadas empresas fictícias.</div>}
   </section>
   <p className="adm-footer">{overview.note} Esta Central não verifica tráfego em tempo real do provedor ou cobrança real dos modelos.</p>
  </>}
 </main>;
}
