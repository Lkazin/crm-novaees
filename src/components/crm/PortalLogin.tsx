"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Building2,
  CheckCheck,
  Crown,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Users,
  Zap
} from "lucide-react";
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
    if (new URLSearchParams(window.location.search).has("error")) {
      setChecking(false);
      return;
    }
    void fetch(`/api/crm/auth/session?scope=${scope}`, { credentials: "same-origin", cache: "no-store" })
      .then(async response => (response.ok ? response.json() : null))
      .then(session => {
        if (active && session?.authenticated && session.role === scope) {
          window.location.assign(master ? "/admin" : "/cliente");
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [scope, master]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(recover ? "/api/crm/auth/recover" : "/api/crm/auth/session", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          recover
            ? { email: email.trim() }
            : { email: email.trim(), password, rememberMe, scope }
        )
      });
      const result = await response.json();
      if (recover) {
        if (!response.ok) throw new Error("Não foi possível solicitar a redefinição de senha.");
        setNotice("Se este e-mail estiver cadastrado, você receberá as instruções para redefinir sua senha.");
        return;
      }
      if (!response.ok) {
        setError(
          response.status === 429
            ? "Muitas tentativas. Aguarde e tente novamente."
            : result.error === "invalid_credentials"
              ? "E-mail ou senha incorretos."
              : result.message || "Não foi possível acessar este painel com essas credenciais."
        );
        return;
      }
      if (!result.success || result.role !== scope) {
        setError(master ? "Este acesso é exclusivo da administração NovaesWeb." : "Use o acesso de cliente da sua empresa.");
        return;
      }
      window.location.assign(master ? "/admin" : "/cliente");
    } catch (cause) {
      setError(recover && cause instanceof Error ? cause.message : "Falha de comunicação. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={`${styles.scene} ${master ? styles.master : styles.client}`} data-login-scope={scope}>
      {/* Luzes de fundo atmosféricas para o cliente */}
      {!master && (
        <>
          <div className={styles.ambientGlowPrimary} aria-hidden="true" />
          <div className={styles.ambientGlowSecondary} aria-hidden="true" />
        </>
      )}

      {/* PAINEL LATERAL ESQUERDO: APRESENTAÇÃO E LOGO */}
      <section className={styles.story} aria-label={master ? "Administração da plataforma" : "Atendimento da sua empresa"}>
        {master && (
          <svg className={styles.networkArt} viewBox="0 0 700 900" fill="none" aria-hidden="true">
            <circle cx="350" cy="470" r="260" stroke="currentColor" />
            <circle cx="350" cy="470" r="190" stroke="currentColor" />
            <path d="M0 470H700M350 120V900M90 210L610 730M90 730L610 210" stroke="currentColor" />
            <circle cx="350" cy="210" r="9" fill="currentColor" />
            <circle cx="610" cy="470" r="9" fill="currentColor" />
            <circle cx="90" cy="470" r="9" fill="currentColor" />
          </svg>
        )}

        <div className={styles.storyContent}>
          {/* Logo da Novaes CRM IA no topo */}
          {!master ? (
            <Link href="/" className={styles.brandLogoContainer} aria-label="Novaes CRM IA">
              <img
                src="/novaes-crm-ia-logo.jpg"
                alt="Novaes CRM IA - CRM Inteligente da NovaesWeb"
                className={styles.brandHeroLogo}
              />
            </Link>
          ) : (
            <Link href="/novaescrmadm" className={styles.brand} aria-label="NovaesWeb CRM IA">
              <span className={styles.brandMark}>N</span>
              <span>
                NovaesWeb <small>CRM IA</small>
              </span>
            </Link>
          )}

          <div className={styles.storyHeaderCompact}>
            <span className={styles.scopeBadge}>
              {master ? <Crown size={14} /> : <Sparkles size={13} className={styles.badgeSparkle} />}
              {master ? "PAINEL MASTER" : "PORTAL DO CLIENTE"}
            </span>

            <h1>
              {master ? (
                <>
                  Toda a operação.
                  <br />
                  Uma central de gestão.
                </>
              ) : (
                <>
                  Boas conversas.
                  <br />
                  <span className={styles.gradientText}>Seu negócio mais perto.</span>
                </>
              )}
            </h1>

            <p>
              {master
                ? "Clientes, planos, franquias e provedores de IA sob o controle da NovaesWeb."
                : "Atendimento inteligente no WhatsApp com IA personalizada, transbordo para equipe e controle de vendas em tempo real."}
            </p>
          </div>

          {master && (
            <div className={styles.controlArt} role="img" aria-label="Ilustração da central Master com empresas, planos e IA">
              <span><Building2 size={19} />Empresas</span>
              <span><Crown size={19} />Planos e franquias</span>
              <span><MessageCircle size={19} />Provedores de IA</span>
              <strong><ShieldCheck size={20} />Central Master</strong>
            </div>
          )}

          {!master && (
            <div className={styles.chatArt} role="img" aria-label="Demonstração do atendimento inteligente por WhatsApp">
              <div className={styles.chatHeader}>
                <div className={styles.avatarWrap}>
                  <span className={styles.avatar}><Bot size={18} /></span>
                  <span className={styles.statusPulse} aria-hidden="true" />
                </div>
                <div className={styles.chatHeaderInfo}>
                  <span className={styles.chatHeaderTitle}>
                    WhatsApp Conectado <small className={styles.liveBadge}>IA Ativa</small>
                  </span>
                  <span className={styles.chatHeaderSub}>Resposta instantânea 24h</span>
                </div>
                <span className={styles.onlinePill}>Online</span>
              </div>

              <div className={styles.bubble}>
                Olá! Gostaria de saber os horários e se entregam hoje? 😊
                <span className={styles.bubbleTime}>14:32</span>
              </div>

              <div className={`${styles.bubble} ${styles.reply}`}>
                Opa! Com certeza! 🛵 Atendemos até as 23h com entrega rápida. Quer ver o cardápio ou falar com a equipe?
                <span className={styles.replyFooter}>
                  <span className={styles.bubbleTime}>14:32</span>
                  <CheckCheck size={14} />
                </span>
              </div>

              <div className={styles.chatMetaChips}>
                <span className={styles.metaChip}><Sparkles size={11} /> Lead Qualificado</span>
                <span className={styles.metaChip}><Zap size={11} /> Resposta em 1.1s</span>
                <span className={styles.metaChip}><Users size={11} /> Equipe ao Vivo</span>
              </div>
            </div>
          )}

          <div className={styles.storyFooter}>
            <ShieldCheck size={15} />
            {master ? "Ambiente administrativo exclusivo NovaesWeb" : "Ambiente seguro e exclusivo para a sua empresa"}
          </div>
        </div>
      </section>

      {/* PAINEL DIREITO: FORMULÁRIO DE ACESSO */}
      <section className={styles.access} aria-labelledby="portal-login-title">
        <div className={styles.formWrap}>
          {/* Logo exibida no topo do form em telas mobile */}
          {!master && (
            <div className={styles.mobileLogoWrap}>
              <img
                src="/novaes-crm-ia-logo.jpg"
                alt="Novaes CRM IA"
                className={styles.mobileHeroLogo}
              />
            </div>
          )}

          <div className={styles.formHeaderRow}>
            <div className={styles.formIcon}>
              {master ? <Crown size={24} /> : <LockKeyhole size={22} />}
            </div>
            <div>
              <p className={styles.eyebrow}>
                {master ? "ADMINISTRAÇÃO NOVAESWEB" : "ACESSO EMPRESARIAL"}
              </p>
              <h2 id="portal-login-title">
                {recover ? "Recuperar acesso" : master ? "Acesso ao Painel Master" : "Acesse seu Painel"}
              </h2>
            </div>
          </div>

          <p className={styles.intro}>
            {recover
              ? "Informe o e-mail cadastrado da sua empresa para redefinir sua senha."
              : master
                ? "Entre com as credenciais da administração da plataforma."
                : "Entre com o e-mail e a senha fornecidos para gerenciar o WhatsApp da sua empresa."}
          </p>

          {checking ? (
            <div className={styles.checkingState} role="status">
              <span className={styles.spinner} />
              <span>Verificando seu acesso...</span>
            </div>
          ) : (
            <form onSubmit={event => void submit(event)} className={styles.form}>
              <label htmlFor={emailId}>E-mail{master ? " do administrador" : " da sua empresa"}</label>
              <div className={styles.inputWrapper}>
                <Mail size={17} className={styles.inputFieldIcon} />
                <input
                  id={emailId}
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                  maxLength={254}
                  placeholder={master ? "E-mail do administrador" : "seu@email.com"}
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                />
              </div>

              {!recover && (
                <>
                  <label htmlFor={passwordId}>Senha de acesso</label>
                  <div className={styles.inputWrapper}>
                    <LockKeyhole size={17} className={styles.inputFieldIcon} />
                    <input
                      id={passwordId}
                      name="password"
                      type={visible ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      maxLength={256}
                      placeholder="Sua senha"
                      value={password}
                      onChange={event => setPassword(event.target.value)}
                    />
                    <button
                      type="button"
                      className={styles.toggleVisibilityBtn}
                      onClick={() => setVisible(value => !value)}
                      aria-label={visible ? "Ocultar senha" : "Exibir senha"}
                      aria-pressed={visible}
                    >
                      {visible ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>

                  <div className={styles.options}>
                    <label className={styles.rememberOption}>
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={event => setRememberMe(event.target.checked)}
                      />
                      <span>Manter-me conectado</span>
                    </label>
                    <button
                      type="button"
                      className={styles.recoverLink}
                      onClick={() => {
                        setRecover(true);
                        setError("");
                        setNotice("");
                      }}
                    >
                      Esqueceu a senha?
                    </button>
                  </div>
                </>
              )}

              {error && <p role="alert" className={styles.error}>{error}</p>}
              {notice && <p role="status" className={styles.success}>{notice}</p>}

              <button className={styles.submit} type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <span className={styles.spinnerSm} />
                    <span>Aguarde...</span>
                  </>
                ) : recover ? (
                  <>
                    <span>Enviar instruções</span>
                    <ArrowRight size={17} />
                  </>
                ) : master ? (
                  <>
                    <span>Entrar no Painel Master</span>
                    <ArrowRight size={17} />
                  </>
                ) : (
                  <>
                    <span>Entrar na minha empresa</span>
                    <ArrowRight size={17} />
                  </>
                )}
              </button>

              {recover && (
                <button
                  type="button"
                  className={styles.back}
                  onClick={() => {
                    setRecover(false);
                    setError("");
                    setNotice("");
                  }}
                >
                  Voltar para o login
                </button>
              )}
            </form>
          )}

          <div className={styles.security}>
            <ShieldCheck size={15} />
            <span>
              {master
                ? "Este painel administra a plataforma. O acesso dos clientes acontece em um portal separado."
                : "Ambiente protegido por criptografia de ponta a ponta. Sua equipe 100% segura."}
            </span>
          </div>
        </div>
      </section>
    </main>
  );
}
