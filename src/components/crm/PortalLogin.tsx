"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Building2,
  CheckCheck,
  CheckCircle2,
  Crown,
  Eye,
  EyeOff,
  Headphones,
  LockKeyhole,
  Mail,
  MessageCircle,
  Radio,
  Server,
  ShieldCheck,
  Sparkles,
  Users,
  Zap
} from "lucide-react";
import styles from "./PortalLogin.module.css";
import LightningBackground from "./LightningBackground";

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
      {/* =================================================================== */}
      {/* FUNDO VIVO: LUZES ROXAS, ROSAS E VERMELHAS COM REDE NEURAL (CANVAS) */}
      {/* =================================================================== */}
      <LightningBackground />

      {/* ÁREA PRINCIPAL DIVIDIDA EM 2 COLUNAS */}
      <div className={styles.mainContainer}>
        {/* COLUNA ESQUERDA: APRESENTAÇÃO, LOGO E O QUE FAZEMOS */}
        <section className={styles.story} aria-label={master ? "Administração da plataforma" : "Atendimento da sua empresa"}>
          <div className={styles.storyContent}>
            {/* LOGO OFICIAL */}
            <Link href={master ? "/novaescrmadm" : "/"} className={styles.brandLogoContainer} aria-label={master ? "Novaes CRM IA Master" : "Novaes CRM IA"}>
              <img
                src="/novaes-crm-ia-logo.jpg"
                alt={master ? "Novaes CRM IA - Central Master" : "Novaes CRM IA - CRM Inteligente da NovaesWeb"}
                className={styles.brandHeroLogo}
              />
            </Link>

            {/* TEXTOS PRINCIPAIS */}
            <div className={styles.storyHeaderCompact}>
              <div className={styles.badgesRow}>
                <span className={master ? styles.scopeBadgeMaster : styles.scopeBadge}>
                  {master ? <Crown size={14} /> : <Sparkles size={13} className={styles.badgeSparkle} />}
                  {master ? "CENTRAL DE COMANDO MASTER" : "PORTAL DO CLIENTE"}
                </span>
                <span className={styles.liveServerBadge}>
                  <Radio size={12} className={styles.radioPulse} /> {master ? "Nuvem Master Ativa 24/7" : "Sistema Operacional 24/7"}
                </span>
              </div>

              <h1>
                {master ? (
                  <>
                    Controle Global da Operação.
                    <br />
                    <span className={styles.gradientTextGold}>Plataforma Multi-Empresa.</span>
                  </>
                ) : (
                  <>
                    Atendimento Inteligente.
                    <br />
                    <span className={styles.gradientText}>Venda mais pelo WhatsApp.</span>
                  </>
                )}
              </h1>

              <p>
                {master
                  ? "Governança centralizada de clientes, provedores de inteligência artificial, franquias comerciais de WhatsApp e faturamento em tempo real."
                  : "Acelere seu negócio com inteligência artificial humanizada, transbordo para atendentes em 1 clique e gestão completa da sua equipe."}
              </p>
            </div>

            {master && (
              <>
                {/* O QUE FAZEMOS NA CENTRAL MASTER */}
                <div className={styles.masterCapabilitiesGrid} role="region" aria-label="O que fazemos na Central Master">
                  <div className={styles.capabilityCard}>
                    <div className={styles.capabilityIconWrap}>
                      <Building2 size={19} className={styles.capIconPurple} />
                    </div>
                    <div className={styles.capabilityText}>
                      <strong>Gestão Multi-Empresa</strong>
                      <span>Isolamento total de inquilinos, limite de instâncias e status em tempo real.</span>
                    </div>
                  </div>

                  <div className={styles.capabilityCard}>
                    <div className={styles.capabilityIconWrap}>
                      <Sparkles size={19} className={styles.capIconPink} />
                    </div>
                    <div className={styles.capabilityText}>
                      <strong>Orquestrador de IA</strong>
                      <span>Roteamento de OpenAI, Gemini, Groq e DeepSeek com failover e sem alucinações.</span>
                    </div>
                  </div>

                  <div className={styles.capabilityCard}>
                    <div className={styles.capabilityIconWrap}>
                      <Zap size={19} className={styles.capIconRed} />
                    </div>
                    <div className={styles.capabilityText}>
                      <strong>WhatsApp Multi-Instância</strong>
                      <span>Até 5 conexões por empresa, transbordo humano instantâneo e controle de fila ao vivo.</span>
                    </div>
                  </div>

                  <div className={styles.capabilityCard}>
                    <div className={styles.capabilityIconWrap}>
                      <ShieldCheck size={19} className={styles.capIconGreen} />
                    </div>
                    <div className={styles.capabilityText}>
                      <strong>Planos, PIX & Franquias</strong>
                      <span>Aprovação manual de recargas, governança de mensagens e gestão de planos.</span>
                    </div>
                  </div>
                </div>

                <div className={styles.statsHighlightsRow}>
                  <div className={styles.statPillItem}>
                    <Server size={14} className={styles.statIconGreen} />
                    <span><strong>99.9%</strong> Alta Disponibilidade</span>
                  </div>
                  <div className={styles.statPillItem}>
                    <ShieldCheck size={14} className={styles.statIconBlue} />
                    <span><strong>Isolamento</strong> Multi-Tenant</span>
                  </div>
                  <div className={styles.statPillItem}>
                    <CheckCircle2 size={14} className={styles.statIconPink} />
                    <span><strong>Conformidade</strong> LGPD</span>
                  </div>
                </div>
              </>
            )}

            {!master && (
              <>
                {/* SIMULAÇÃO DE ATENDIMENTO AO VIVO */}
                <div className={styles.chatArt} role="img" aria-label="Demonstração do atendimento inteligente por WhatsApp">
                  <div className={styles.chatHeader}>
                    <div className={styles.avatarWrap}>
                      <span className={styles.avatar}><Bot size={19} /></span>
                      <span className={styles.statusPulse} aria-hidden="true" />
                    </div>
                    <div className={styles.chatHeaderInfo}>
                      <span className={styles.chatHeaderTitle}>
                        NovaesWeb IA <small className={styles.liveBadge}>WhatsApp Oficial</small>
                      </span>
                      <span className={styles.chatHeaderSub}>IA Ativa • Respostas Instantâneas</span>
                    </div>
                    <span className={styles.onlinePill}>Online</span>
                  </div>

                  {/* Mensagem do Cliente com texto ampliado */}
                  <div className={styles.bubble}>
                    <span className={styles.bubbleSender}>Cliente</span>
                    Olá! Gostaria de conhecer os planos de entrega e saber se vocês atendem hoje? 😊
                    <span className={styles.bubbleTime}>14:32</span>
                  </div>

                  {/* Resposta da IA com texto ampliado e gradiente */}
                  <div className={`${styles.bubble} ${styles.reply}`}>
                    <span className={styles.bubbleSender}>NovaesWeb IA</span>
                    Opa! Com certeza! 🛵 Atendemos hoje até as 23h com entrega rápida e planos especiais para sua empresa! Quer que eu te envie o cardápio oficial ou prefere falar com um atendente da equipe?
                    <span className={styles.replyFooter}>
                      <span className={styles.bubbleTime}>14:32</span>
                      <CheckCheck size={15} />
                    </span>
                  </div>

                  {/* Chips Informativos de Alta Conversão */}
                  <div className={styles.chatMetaChips}>
                    <span className={styles.metaChip}><Sparkles size={12} /> Lead Qualificado 🔥</span>
                    <span className={styles.metaChip}><Zap size={12} /> Resposta em 1.1s</span>
                    <span className={styles.metaChip}><Users size={12} /> Equipe Integrada</span>
                    <span className={styles.metaChip}><CheckCircle2 size={12} /> Fila ao Vivo</span>
                  </div>
                </div>

                {/* Destaques rápidos de valor */}
                <div className={styles.statsHighlightsRow}>
                  <div className={styles.statPillItem}>
                    <Zap size={14} className={styles.statIconPink} />
                    <span><strong>1.1s</strong> Tempo Médio</span>
                  </div>
                  <div className={styles.statPillItem}>
                    <Server size={14} className={styles.statIconGreen} />
                    <span><strong>99.9%</strong> Disponibilidade</span>
                  </div>
                  <div className={styles.statPillItem}>
                    <ShieldCheck size={14} className={styles.statIconBlue} />
                    <span><strong>SSL 256-bit</strong> Isolamento</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>

        {/* COLUNA DIREITA: FORMULÁRIO DE LOGIN COM VISUAL AMPLIADO */}
        <section className={styles.access} aria-labelledby="portal-login-title">
          <div className={styles.formWrap}>
            {/* Logo em telas menores */}
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
                {master ? <Crown size={26} /> : <LockKeyhole size={24} />}
              </div>
              <div className={styles.formHeaderTexts}>
                <p className={styles.eyebrow}>
                  {master ? "ADMINISTRAÇÃO CENTRAL NOVAESWEB" : "ÁREA EXCLUSIVA DA SUA EMPRESA"}
                </p>
                <h2 id="portal-login-title" className={styles.portalTitleLarge}>
                  {recover ? (
                    "Recuperar Acesso"
                  ) : master ? (
                    <>
                      Portal <span className={styles.gradientTextGold}>Master</span>
                    </>
                  ) : (
                    <>
                      Portal do <span className={styles.gradientText}>Cliente</span>
                    </>
                  )}
                </h2>
              </div>
            </div>

            <p className={styles.intro}>
              {recover
                ? "Informe o e-mail cadastrado para receber as instruções de recuperação."
                : master
                  ? "Entre com as credenciais de superadministrador para gerenciar toda a plataforma e as empresas integradas."
                  : "Entre com o e-mail e a senha fornecidos para gerenciar o WhatsApp e os atendimentos da sua empresa."}
            </p>

            {checking ? (
              <div className={styles.checkingState} role="status">
                <span className={styles.spinner} />
                <span>Verificando suas credenciais...</span>
              </div>
            ) : (
              <form onSubmit={event => void submit(event)} className={styles.form}>
                <label htmlFor={emailId}>E-mail{master ? " do administrador" : " da sua empresa"}</label>
                <div className={styles.inputWrapper}>
                  <Mail size={19} className={styles.inputFieldIcon} />
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
                      <LockKeyhole size={19} className={styles.inputFieldIcon} />
                      <input
                        id={passwordId}
                        name="password"
                        type={visible ? "text" : "password"}
                        autoComplete="current-password"
                        required
                        maxLength={256}
                        placeholder="Sua senha de acesso"
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
                        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
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
                      <span>Conectando...</span>
                    </>
                  ) : recover ? (
                    <>
                      <span>Enviar instruções de redefinição</span>
                      <ArrowRight size={19} />
                    </>
                  ) : master ? (
                    <>
                      <span>Acessar Portal Master</span>
                      <ArrowRight size={19} />
                    </>
                  ) : (
                    <>
                      <span>Acessar Portal do Cliente</span>
                      <ArrowRight size={19} />
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
                    Voltar para a tela de login
                  </button>
                )}
              </form>
            )}

            <div className={styles.security}>
              <ShieldCheck size={16} />
              <span>
                {master
                  ? "Acesso exclusivo à administração NovaesWeb. Conexão criptografada, auditada e com isolamento multi-tenant."
                  : "Ambiente criptografado com isolamento de dados. Sua empresa com total privacidade."}
              </span>
            </div>
          </div>
        </section>
      </div>

      {/* =================================================================== */}
      {/* RODAPÉ ESTRUTURADO COM INFORMAÇÕES IMPORTANTES                     */}
      {/* =================================================================== */}
      <footer className={styles.globalFooter} role="contentinfo">
        <div className={styles.footerContainer}>
          <div className={styles.footerBadges}>
            <span className={styles.footerItem}>
              <ShieldCheck size={13} className={styles.footerIconPink} />
              <span>Criptografia SSL AES-256</span>
            </span>
            <span className={styles.footerDot}>•</span>
            <span className={styles.footerItem}>
              <Server size={13} className={styles.footerIconGreen} />
              <span>Nuvem de Alta Disponibilidade (99.9%)</span>
            </span>
            <span className={styles.footerDot}>•</span>
            <span className={styles.footerItem}>
              <CheckCircle2 size={13} className={styles.footerIconBlue} />
              <span>Conformidade LGPD</span>
            </span>
          </div>

          <div className={styles.footerLinks}>
            <a
              href="https://wa.me/5551991189293?text=Ol%C3%A1%2C%20preciso%20de%20ajuda%20com%20o%20acesso%20ao%20NovaesWeb%20CRM%20IA"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.footerHelpLink}
              title="Falar com o suporte NovaesWeb pelo WhatsApp"
            >
              <Headphones size={13} />
              <span>Dúvidas com o acesso? Fale no WhatsApp</span>
            </a>
            <span className={styles.footerDot}>•</span>
            <span className={styles.footerCopyright}>
              © 2026 NovaesWeb CRM IA — Todos os direitos reservados.
            </span>
          </div>
        </div>
      </footer>
    </main>
  );
}
