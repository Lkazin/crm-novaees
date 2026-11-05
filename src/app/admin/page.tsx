"use client";
import { useEffect,useState } from "react";
import Link from "next/link";
import {BarChart3,Building2,ChevronLeft,LockKeyhole,RefreshCw,ShieldCheck,Wifi,AlertCircle} from "lucide-react";

type Usage={requests:number;tokens:number;costUsd:number;errors:number};
type Limit={monthly_model_requests:number|null;monthly_token_limit:number|null;monthly_budget_usd:number|null;hard_stop_on_limit:boolean};
type Company={id:string;name:string;status:string;created_at:string;channels:{instance:string;status:string}[];usage:Usage;limits:Limit|null};
type Overview={role:string;month:string;limited:boolean;companies:Company[];totals:{companies:number;connectedChannels:number;modelEvents:number};note:string};
export default function AdminCRM() {
 const [overview,setOverview]=useState<Overview|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
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
 useEffect(()=>{void refresh();},[]);
 return <main className="adm-shell">
  <div className="adm-top"><Link href="/operator" className="adm-back"><ChevronLeft size={17}/> Portal Operacional</Link><div className="adm-brand"><ShieldCheck size={22}/> NovaesWeb CRM AI · Master</div></div>
  <header className="adm-header"><div><h1>Central Administrativa</h1><p>Empresas, canais e consumo efetivamente registrados no Supabase.</p></div>
   <button className="op-refresh" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={16}/> Atualizar</button></header>
  {loading?<div className="op-card adm-placeholder"><RefreshCw size={28}/><strong>Consultando dados reais…</strong></div>
  :error?<div className="op-card adm-placeholder"><LockKeyhole size={27}/><h2>Acesso administrativo indisponível</h2><p role="alert">{error}</p><Link href="/operator" className="adm-back">Abrir login individual</Link></div>
  :overview&&<>
   <div className="adm-notice"><ShieldCheck size={17}/> Papel autorizado: {overview.role}. Nenhum botão desta página altera empresa, canal ou cobrança.</div>
   <section className="op-stats">
    <div className="op-card"><Building2 size={22}/><span>Empresas cadastradas (até 100)</span><strong>{overview.totals.companies}</strong></div>
    <div className="op-card"><Wifi size={22}/><span>Canais marcados como conectados no banco</span><strong>{overview.totals.connectedChannels}</strong></div>
    <div className="op-card"><BarChart3 size={22}/><span>Eventos de uso registrados no mês (até 1.000)</span><strong>{overview.totals.modelEvents}</strong></div>
   </section>
   {overview.limited&&<p className="adm-warning"><AlertCircle size={16}/> Há mais dados do que o limite desta consulta. Os totais exibidos não representam necessariamente toda a plataforma.</p>}
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
