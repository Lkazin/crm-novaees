"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, Building2, CheckCheck, Crown, Eye, EyeOff, LockKeyhole, MessageCircle, ShieldCheck } from "lucide-react";
import styles from "./PortalLogin.module.css";

export default function PortalLogin({ scope }: { scope: "master" | "client" }) {
  const master = scope === "master";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [recover, setRecover] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const emailId = useId();
  const passwordId = useId();

  useEffect(() => {
    let active = true;
    if (new URLSearchParams(window.location.search).has("error")) { setChecking(false); return; }
    void fetch(`/api/crm/auth/session?scope=${scope}`, { credentials: "same-origin", cache: "no-store" })
      .then(async response => response.ok ? response.json() : null)
      .then(session => { if (active && session?.authenticated && session.role === scope) window.location.assign(master ? "/admin" : "/cliente"); })
      .catch(() => {})
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [scope, master]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setLoading(true); setError(""); setNotice("");
    try {
      const response = await fetch(recover ? "/api/crm/auth/recover" : "/api/crm/auth/session", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(recover ? { email: email.trim() } : { email: email.trim(), password, rememberMe, scope })
      });
      const result = await response.json();
      if (recover) {
        if (!response.ok) throw new Error("Não foi possível solicitar a redefinição de senha.");
        setNotice("Se este e-mail estiver cadastrado, você receberá as instruções para redefinir sua senha.");
        return;
      }
      if (!response.ok) {
        setError(response.status === 429 ? "Muitas tentativas. Aguarde e tente novamente." : result.error === "invalid_credentials" ? "E-mail ou senha incorretos." : result.message || "Não foi possível acessar este painel com essas credenciais.");
        return;
      }
      if (!result.success || result.role !== scope) {
        setError(master ? "Este acesso é exclusivo da administração NovaesWeb." : "Use o acesso de cliente da sua empresa.");
        return;
      }
      window.location.assign(master ? "/admin" : "/cliente");
    } catch (cause) {
      setError(recover && cause instanceof Error ? cause.message : "Falha de comunicação. Tente novamente.");
    } finally { setLoading(false); }
  }

  return <main className={`${styles.scene} ${master ? styles.master : styles.client}`} data-login-scope={scope}>
    <section className={styles.story} aria-label={master ? "Administração da plataforma" : "Atendimento da sua empresa"}>
      {master && <svg className={styles.networkArt} viewBox="0 0 700 900" fill="none" aria-hidden="true"><circle cx="350" cy="470" r="260" stroke="currentColor"/><circle cx="350" cy="470" r="190" stroke="currentColor"/><path d="M0 470H700M350 120V900M90 210L610 730M90 730L610 210" stroke="currentColor"/><circle cx="350" cy="210" r="9" fill="currentColor"/><circle cx="610" cy="470" r="9" fill="currentColor"/><circle cx="90" cy="470" r="9" fill="currentColor"/></svg>}
      <div className={styles.storyContent}>
        <Link href={master ? "/novaescrmadm" : "/"} className={styles.brand} aria-label="NovaesWeb CRM IA"><span className={styles.brandMark}>N</span><span>NovaesWeb <small>CRM IA</small></span></Link>
        <span className={styles.scopeBadge}>{master ? <Crown size={16} /> : <Building2 size={16} />}{master ? "PAINEL MASTER" : "PORTAL DO CLIENTE"}</span>
        <h1>{master ? <>Toda a operação.<br />Uma central de gestão.</> : <>Boas conversas.<br />Seu negócio mais perto.</>}</h1>
        <p>{master ? "Clientes, planos, franquias e provedores de IA sob o controle da NovaesWeb." : "Converse com seus clientes, acompanhe sua equipe e organize o atendimento da sua empresa."}</p>
        {master && <div className={styles.controlArt} role="img" aria-label="Ilustração da central Master com empresas, planos e IA"><span><Building2 size={19}/>Empresas</span><span><Crown size={19}/>Planos e franquias</span><span><MessageCircle size={19}/>Provedores de IA</span><strong><ShieldCheck size={20}/>Central Master</strong></div>}
        {!master && <div className={styles.chatArt} role="img" aria-label="Ilustração de uma conversa entre cliente e equipe">
          <div className={styles.chatHeader}><span className={styles.avatar}><MessageCircle size={22} /></span><span>Atendimento da empresa<small>IA e equipe, juntas no painel</small></span></div>
          <div className={styles.bubble}>Olá! Gostaria de conhecer os serviços.</div>
          <div className={`${styles.bubble} ${styles.reply}`}>Claro! Como podemos ajudar você hoje?<CheckCheck size={16} /></div>
          <div className={styles.teamNote}><ShieldCheck size={16} /> Conversas organizadas para sua equipe</div>
        </div>}
        <div className={styles.storyFooter}><ShieldCheck size={18} />{master ? "Ambiente administrativo exclusivo NovaesWeb" : "Acesso individual à sua empresa"}</div>
      </div>
    </section>
    <section className={styles.access} aria-labelledby="portal-login-title">
      <div className={styles.formWrap}>
        <div className={styles.formIcon}>{master ? <Crown size={26} /> : <LockKeyhole size={26} />}</div>
        <p className={styles.eyebrow}>{master ? "ADMINISTRAÇÃO NOVAESWEB" : "SEU ESPAÇO DE ATENDIMENTO"}</p>
        <h2 id="portal-login-title">{recover ? "Recuperar acesso" : master ? "Acesso ao Painel Master" : "Acesso da Empresa"}</h2>
        <p className={styles.intro}>{recover ? "Informe o e-mail cadastrado para receber as instruções." : master ? "Entre com as credenciais da administração da plataforma." : "Entre com o e-mail e a senha fornecidos para sua empresa."}</p>
        {checking ? <p role="status">Verificando seu acesso...</p> : <form onSubmit={event => void submit(event)} className={styles.form}>
          <label htmlFor={emailId}>E-mail{master ? " do administrador" : " da sua conta"}</label>
          <input id={emailId} name="email" type="email" autoComplete="username" required maxLength={254} placeholder={master ? "E-mail do administrador" : "seu@email.com"} value={email} onChange={event => setEmail(event.target.value)} />
          {!recover && <>
            <label htmlFor={passwordId}>Senha</label>
            <div className={styles.password}><input id={passwordId} name="password" type={visible ? "text" : "password"} autoComplete="current-password" required maxLength={256} placeholder="Senha" value={password} onChange={event => setPassword(event.target.value)} /><button type="button" onClick={() => setVisible(value => !value)} aria-label={visible ? "Ocultar senha" : "Exibir senha"} aria-pressed={visible}>{visible ? <EyeOff size={20} /> : <Eye size={20} />}</button></div>
            <div className={styles.options}><label><input type="checkbox" checked={rememberMe} onChange={event => setRememberMe(event.target.checked)} />Manter-me conectado</label><button type="button" onClick={() => { setRecover(true); setError(""); setNotice(""); }}>Esqueceu a senha?</button></div>
          </>}
          {error && <p role="alert" className={styles.error}>{error}</p>}
          {notice && <p role="status" className={styles.success}>{notice}</p>}
          <button className={styles.submit} type="submit" disabled={loading}>{loading ? "Aguarde..." : recover ? "Enviar instruções" : master ? "Entrar no Painel Master" : "Entrar na minha empresa"}<ArrowRight size={19} /></button>
          {recover && <button type="button" className={styles.back} onClick={() => { setRecover(false); setError(""); setNotice(""); }}>Voltar para entrar</button>}
        </form>}
        <p className={styles.security}><ShieldCheck size={18} />{master ? "Este painel administra a plataforma. O acesso dos clientes acontece em um portal separado." : "Seu plano define os recursos disponíveis. Sua equipe acessa somente as empresas autorizadas."}</p>
      </div>
    </section>
  </main>;
}
