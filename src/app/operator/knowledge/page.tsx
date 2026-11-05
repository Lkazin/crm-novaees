"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {ArrowLeft,BookOpen,CheckCircle2,FilePlus2,LockKeyhole,RefreshCw,ShieldCheck} from "lucide-react";
type Tenant={id:string;name:string;status:string};
type Article={id:string;title:string;body:string;status:"draft"|"published"|"archived";updated_at:string};
export default function KnowledgePage(){
 const [tenants,setTenants]=useState<Tenant[]>([]);
 const [tenant,setTenant]=useState("");
 const [articles,setArticles]=useState<Article[]>([]);
 const [selected,setSelected]=useState("");
 const [title,setTitle]=useState("");
 const [body,setBody]=useState("");
 const [status,setStatus]=useState<Article["status"]>("draft");
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [limited,setLimited]=useState(false);
 async function loadTenants(){
  setLoading(true);setError("");
  try{
   const r=await fetch("/api/crm/operator/data",{cache:"no-store"});
   if(!r.ok){setError(r.status===401?"Faça login no Portal Operacional.":"Não foi possível consultar suas empresas.");return;}
   const v=await r.json() as {tenants:Tenant[]};
   setTenants(v.tenants);
  }catch{setError("Conexão indisponível.");}finally{setLoading(false);}
 }
 async function loadArticles(tenantId:string){
  if(!tenantId){setArticles([]);setLimited(false);return;}
  setLoading(true);setError("");
  try{
   const r=await fetch("/api/crm/operator/knowledge?tenant="+encodeURIComponent(tenantId),{cache:"no-store"});
   if(!r.ok){setError("Não foi possível consultar os artigos desta empresa.");setArticles([]);return;}
   const v=await r.json() as {articles:Article[];limited:boolean};
   setArticles(v.articles);setLimited(v.limited);
  }catch{setError("Falha na consulta dos artigos.");setArticles([]);}
  finally{setLoading(false);}
 }
 useEffect(()=>{void loadTenants();},[]);
 function selectArticle(id:string){
  setSelected(id);setNotice("");setError("");
  const a=articles.find(x=>x.id===id);
  setTitle(a?.title??"");setBody(a?.body??"");setStatus(a?.status??"draft");
 }
 async function save(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();setSaving(true);setError("");setNotice("");
  try{
   const isEdit=!!selected;
   const r=await fetch("/api/crm/operator/knowledge",{
    method:isEdit?"PATCH":"POST",credentials:"same-origin",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({tenantId:tenant,...(isEdit?{id:selected,status}:{}),title,body})
   });
   if(!r.ok){
    setError(r.status===403?"Você não possui permissão para esta alteração. Apenas proprietários/administradores podem publicar.":r.status===404?"Artigo não encontrado. Atualize a página.":"Não foi possível gravar. Verifique os campos e sua conexão.");
    return;
   }
   const result=await r.json() as {id?:string};
   await loadArticles(tenant);
   if(!isEdit){selectArticle("");} else {setSelected(selected);}
   setNotice(isEdit?"Alterações gravadas no Supabase.":"Rascunho criado no Supabase. Nenhuma mensagem foi enviada.");
   if(!isEdit&&result.id){setSelected(result.id);setTitle(title);setBody(body);setStatus("draft");}
  }catch{setError("Erro de comunicação. Confira se o artigo foi salvo antes de repetir a operação.");}
  finally{setSaving(false);}
 }
 return <main className="kn-shell">
   <div className="kn-top"><Link href="/operator" className="adm-back"><ArrowLeft size={17}/> Portal Operacional</Link><span><BookOpen size={20}/> NovaesWeb · Conhecimento</span></div>
   <header className="adm-header"><div><h1>Base de Conhecimento</h1><p>Artigos reais por empresa, com rascunhos e publicação controlada. Nenhuma IA é ativada nesta tela.</p></div></header>
   {error&&<div role="alert" className="op-alert">{error}</div>}
   <div className="op-tenant-bar"><ShieldCheck size={18}/><label htmlFor="kn-company">Empresa autorizada</label>
    <select id="kn-company" value={tenant} onChange={e=>{setTenant(e.target.value);setSelected("");setTitle("");setBody("");setStatus("draft");setNotice("");void loadArticles(e.target.value);}}>
      <option value="">Selecione a empresa</option>{tenants.map(t=><option key={t.id} value={t.id}>{t.name}{t.status!=="active"?" (inativa)":""}</option>)}
    </select>
    {loading&&<RefreshCw size={17}/>}
   </div>
   {!tenant?<section className="op-card op-centered"><LockKeyhole size={28}/><h2>Selecione uma empresa</h2><p>{tenants.length?"Os artigos de cada empresa são separados.":"Sem empresas vinculadas a este usuário."}</p></section>
    :<div className="kn-layout">
      <section className="op-card kn-list">
       <div className="kn-list-head"><h2>Artigos</h2><button type="button" onClick={()=>selectArticle("")} className="op-refresh"><FilePlus2 size={17}/> Novo</button></div>
       {limited&&<p className="adm-warning">Mostrando somente os 100 artigos mais recentes.</p>}
       {articles.length?articles.map(a=><button type="button" key={a.id} className={selected===a.id?"kn-article active":"kn-article"} onClick={()=>selectArticle(a.id)}>
          <strong>{a.title}</strong><span>{a.status==="draft"?"Rascunho":a.status==="published"?"Publicado":"Arquivado"} · {new Date(a.updated_at).toLocaleDateString("pt-BR")}</span>
       </button>):<p className="op-empty">Nenhum artigo cadastrado nesta empresa.</p>}
      </section>
      <section className="op-card kn-editor"><h2>{selected?"Editar artigo":"Novo artigo"}</h2>
        <p>Use dados oficiais da empresa. Somente artigos publicados poderão ser considerados para a futura base de respostas da IA.</p>
        <form onSubmit={e=>void save(e)}>
          <label>Título<input value={title} minLength={3} maxLength={200} onChange={e=>setTitle(e.target.value)} required placeholder="Ex.: Horário de atendimento"/></label>
          <label>Conteúdo<textarea value={body} maxLength={20000} rows={10} onChange={e=>setBody(e.target.value)} required placeholder="Informações verificadas e aprovadas da empresa"/></label>
          {selected&&<label>Estado<select value={status} onChange={e=>setStatus(e.target.value as Article["status"])}>
            <option value="draft">Rascunho</option><option value="published">Publicado (somente gestor)</option><option value="archived">Arquivado</option>
          </select></label>}
          <button className="op-primary" disabled={saving||loading||title.trim().length<3||!body.trim()} type="submit">{saving?"Salvando...":"Salvar no Supabase"}</button>
          {notice&&<p className="kn-notice" role="status"><CheckCircle2 size={18}/>{notice}</p>}
        </form>
      </section>
    </div>}
 </main>;
}
