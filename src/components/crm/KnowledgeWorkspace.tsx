"use client";
import {useCallback, useEffect,useState} from "react";
import Link from "next/link";
import {ArrowLeft,CheckCircle2,FilePlus2,LockKeyhole,RefreshCw,ShieldCheck,Sparkles} from "lucide-react";
import { KNOWLEDGE_BODY_MAX_LENGTH, KNOWLEDGE_TITLE_MAX_LENGTH } from "@/lib/crm/knowledge-limits";
import styles from "./KnowledgeWorkspace.module.css";
type Tenant={id:string;name:string;status:string};
type Article={id:string;title:string;body:string;status:"draft"|"published"|"archived";updated_at:string};
type KnowledgeWorkspaceProps = { embedded?: boolean; tenantId?: string };
export default function KnowledgeWorkspace({ embedded = false, tenantId = "" }: KnowledgeWorkspaceProps){
 const [tenants,setTenants]=useState<Tenant[]>([]);
 const [tenant,setTenant]=useState(tenantId);
 const [articles,setArticles]=useState<Article[]>([]);
 const [selected,setSelected]=useState("");
 const [title,setTitle]=useState("");
 const [body,setBody]=useState("");
 const [status,setStatus]=useState<Article["status"]>("published");
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [limited,setLimited]=useState(false);

 const loadArticles = useCallback(async (tenantId:string)=>{
  if(!tenantId){setArticles([]);setLimited(false);return;}
  setLoading(true);setError("");
  try{
   const r=await fetch("/api/crm/operator/knowledge?tenant="+encodeURIComponent(tenantId),{cache:"no-store"});
   if(!r.ok){setError("Não foi possível consultar os artigos desta empresa.");setArticles([]);return;}
   const v=await r.json() as {articles:Article[];limited:boolean};
   setArticles(v.articles);setLimited(v.limited);
  }catch{setError("Falha na consulta dos artigos.");setArticles([]);}
  finally{setLoading(false);}
 },[]);

 const loadTenants = useCallback(async ()=>{
  setLoading(true);setError("");
  try{
   const r=await fetch("/api/crm/operator/data",{cache:"no-store"});
   if(!r.ok){setError(r.status===401?"Faça login no Portal Operacional.":"Não foi possível consultar suas empresas.");return;}
   const v=await r.json() as {tenants:Tenant[]};
   setTenants(v.tenants);
   if(v.tenants.length && !tenant){
     const firstId = v.tenants[0].id;
     setTenant(firstId);
     void loadArticles(firstId);
   }
  }catch{setError("Conexão indisponível.");}finally{setLoading(false);}
 },[tenant, loadArticles]);

 useEffect(()=>{
  if(embedded){
   setTenant(tenantId);setSelected("");setTitle("");setBody("");setStatus("published");setNotice("");
   if(tenantId) void loadArticles(tenantId); else setLoading(false);
   return;
  }
  void loadTenants();
 },[embedded,tenantId,loadArticles,loadTenants]);

 function selectArticle(id:string){
  setSelected(id);setNotice("");setError("");
  const a=articles.find(x=>x.id===id);
  setTitle(a?.title??"");setBody(a?.body??"");setStatus(a?.status??"published");
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
    setError(r.status===403?"Você não possui permissão para esta alteração.":r.status===404?"Artigo não encontrado. Atualize a página.":"Não foi possível gravar. Verifique os campos e sua conexão.");
    return;
   }
   const result=await r.json() as {id?:string};
   await loadArticles(tenant);
   if(!isEdit){selectArticle("");} else {setSelected(selected);}
   setNotice(status === "published" ? "Informações salvas como publicadas. Você pode conferir as respostas no simulador." : status === "draft" ? "Rascunho salvo. Ele ainda não será usado nas respostas da IA." : "Informações arquivadas. Elas não serão usadas nas respostas da IA.");
   if(!isEdit&&result.id){setSelected(result.id);setTitle(title);setBody(body);setStatus("published");}
  }catch{setError("Erro de comunicação ao salvar o artigo.");}
  finally{setSaving(false);}
 }
 const Container = embedded ? "section" : "main";
 const Heading = embedded ? "h3" : "h1";
 return <Container className={`${embedded ? "" : "kn-shell"} ${styles.workspace}`} aria-label="Base de conhecimento">
   {!embedded && <div className="kn-top">
    <Link href="/cliente" className="adm-back"><ArrowLeft size={17}/> Voltar ao Painel da Loja</Link>
    <span><Sparkles size={20}/> Treinamento da IA · Base de Conhecimento</span>
   </div>}
   <header className="adm-header">
    <div>
      <Heading>O que a IA sabe sobre a sua empresa</Heading>
      <p>Organize uma informação por assunto. A IA usa os conteúdos publicados para responder às perguntas dos clientes.</p>
    </div>
   </header>
   {error&&<div role="alert" className="op-alert">{error}</div>}
   {!embedded && <div className="op-tenant-bar"><ShieldCheck size={18}/><label htmlFor="kn-company">Loja vinculada:</label>
    <select id="kn-company" value={tenant} onChange={e=>{setTenant(e.target.value);setSelected("");setTitle("");setBody("");setStatus("published");setNotice("");void loadArticles(e.target.value);}}>
      {tenants.map(t=><option key={t.id} value={t.id}>{t.name}{t.status!=="active"?" (inativa)":""}</option>)}
    </select>
    {loading&&<RefreshCw size={17}/>}
   </div>}
   {embedded && loading && <p role="status">Carregando artigos...</p>}
   {!tenant?<section className="op-card op-centered"><LockKeyhole size={28}/><h2>Selecione uma empresa</h2><p>{tenants.length?"Os artigos de cada empresa são separados.":"Sem empresas vinculadas a este usuário."}</p></section>
    :<div className="kn-layout" style={embedded ? {gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 330px), 1fr))"} : undefined}>
      <section className="op-card kn-list">
       <div className="kn-list-head"><h2>Assuntos da empresa</h2><button type="button" onClick={()=>selectArticle("")} className="op-refresh"><FilePlus2 size={17}/> Novo assunto</button></div>
       <p className={styles.hint}>Separe produtos e preços, entrega, pagamentos e dúvidas frequentes. Fica mais fácil encontrar e atualizar cada informação.</p>
       {limited&&<p className="adm-warning">Mostrando até 100 artigos.</p>}
       {articles.length?articles.map(a=><button type="button" key={a.id} className={selected===a.id?"kn-article active":"kn-article"} onClick={()=>selectArticle(a.id)}>
          <strong>{a.title}</strong><span>{a.status==="published"?"Publicado":a.status==="draft"?"Rascunho":"Arquivado"} · {new Date(a.updated_at).toLocaleDateString("pt-BR")}</span>
       </button>):<p className="op-empty">Comece pelos produtos ou serviços que você oferece. Clique em &quot;Novo assunto&quot; para cadastrar a primeira informação.</p>}
      </section>
      <section className="op-card kn-editor"><h2>{selected?"Editar assunto":"Ensine uma informação à IA"}</h2>
        <p>Use dados reais e atualizados. O comportamento da assistente fica em &quot;Minha IA&quot;; o expediente oficial fica em &quot;Horários&quot;.</p>
        <form onSubmit={e=>void save(e)}>
          <label>Título do assunto<input value={title} minLength={3} maxLength={KNOWLEDGE_TITLE_MAX_LENGTH} onChange={e=>setTitle(e.target.value)} required placeholder="Ex.: Produtos e preços ou Formas de pagamento"/></label>
          <label htmlFor="knowledge-content">O que a IA precisa saber sobre este assunto</label>
          <textarea id="knowledge-content" value={body} maxLength={KNOWLEDGE_BODY_MAX_LENGTH} rows={10} onChange={e=>setBody(e.target.value)} required aria-describedby="knowledge-content-help knowledge-content-count" placeholder="Informe o que você oferece, valores reais, condições e exceções. Evite repetir dados de outros assuntos."/>
          <div className={styles.counter} id="knowledge-content-count"><span>{body.length.toLocaleString("pt-BR")} / {KNOWLEDGE_BODY_MAX_LENGTH.toLocaleString("pt-BR")} caracteres</span><span>{Math.max(0,KNOWLEDGE_BODY_MAX_LENGTH-body.length).toLocaleString("pt-BR")} restantes</span></div>
          <p className={styles.hint} id="knowledge-content-help">O limite é de caracteres, incluindo espaços e quebras de linha. Não é uma quantidade de linhas.</p>
          <details className={styles.help}><summary>Como escrever uma boa informação?</summary><ul><li>Separe produtos ou serviços em itens claros.</li><li>Informe preços, condições e exceções que realmente existem.</li><li>Quando não houver preço fixo, explique como solicitar um orçamento.</li><li>Revise informações antigas e teste uma pergunta no simulador.</li></ul></details>
          {selected&&<label>Status na IA<select value={status} onChange={e=>setStatus(e.target.value as Article["status"])}>
            <option value="published">Publicado (Usar no atendimento da IA)</option>
            <option value="draft">Rascunho (Não responder ainda)</option>
            <option value="archived">Arquivado</option>
          </select></label>}
          {body.length>KNOWLEDGE_BODY_MAX_LENGTH&&<p role="alert">Este conteúdo já cadastrado ultrapassa o limite atual. Ele foi preservado; revise o texto antes de salvar.</p>}
          <p className={styles.hint}>{selected&&status!=="published"?"Rascunhos e assuntos arquivados não entram nas respostas da IA.":"Ao salvar, este assunto fica publicado. Confira as respostas no simulador após a alteração."}</p>
          <button className="op-primary" disabled={saving||loading||title.trim().length<3||!body.trim()||body.length>KNOWLEDGE_BODY_MAX_LENGTH} type="submit">{saving?"Salvando...":"Salvar informações"}</button>
          {notice&&<p className="kn-notice" role="status"><CheckCircle2 size={18}/>{notice}</p>}
        </form>
      </section>
    </div>}
 </Container>;
}
