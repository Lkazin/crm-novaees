"use client";

import { useEffect, useState } from "react";
import {
  Mail, Lock, Eye, EyeOff, LogIn, AlertCircle,
  Bot, Layers, BarChart3, Users, Crown, ShieldCheck
} from "lucide-react";

export default function MasterSecretLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [error, setError] = useState("");

  // Check if user already has an active Master session on mount
  useEffect(() => {
    let active = true;
    async function checkExistingSession() {
      if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("error")) {
        if (active) setCheckingSession(false);
        return;
      }
      try {
        const res = await fetch("/api/crm/auth/session", { credentials: "same-origin", cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (data.authenticated && data.role === "master") {
            window.location.href = "/admin";
            return;
          }
        }
      } catch {}
      if (active) setCheckingSession(false);
    }
    void checkExistingSession();
    return () => { active = false; };
  }, []);

  // Handle Master Authentication
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/crm/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          email: email.trim(),
          password,
          rememberMe
        })
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || (data.error === "invalid_credentials" ? "Credenciais de administrador inválidas." : data.error) || "Falha na autenticação Master.");
        return;
      }

      if (data.success && data.role === "master") {
        window.location.href = data.redirectTo || "/admin";
      } else {
        setError("Esta área é exclusiva para administradores da NovaesWeb.");
      }
    } catch {
      setError("Falha de comunicação com o servidor de autenticação Master.");
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#07030c",
          color: "#ffffff",
          fontFamily: "system-ui, -apple-system, sans-serif"
        }}
      >
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              width: "48px",
              height: "48px",
              border: "3px solid rgba(236, 72, 153, 0.2)",
              borderTopColor: "#ec4899",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite"
            }}
          />
          <span style={{ fontSize: "14px", color: "#c4b5fd" }}>Validando permissões Master...</span>
        </div>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </main>
    );
  }

  return (
    <main
      style={{
        position: "relative",
        minHeight: "100vh",
        width: "100%",
        backgroundColor: "#07030c",
        backgroundImage: `
          radial-gradient(ellipse 65% 50% at 12% 18%, rgba(217, 70, 239, 0.32) 0%, rgba(147, 51, 234, 0.14) 42%, transparent 70%),
          radial-gradient(ellipse 60% 48% at 18% 92%, rgba(244, 63, 94, 0.38) 0%, rgba(225, 29, 72, 0.18) 46%, transparent 75%),
          radial-gradient(ellipse 55% 45% at 94% 88%, rgba(217, 70, 239, 0.32) 0%, rgba(168, 85, 247, 0.14) 50%, transparent 75%),
          radial-gradient(ellipse 42% 38% at 92% 10%, rgba(225, 29, 72, 0.25) 0%, transparent 60%)
        `,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 24px",
        color: "#ffffff",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        overflow: "hidden"
      }}
    >
      {/* Background Neon Curves */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 1,
          overflow: "hidden"
        }}
      >
        <svg
          style={{ position: "absolute", top: "-10%", left: "-10%", width: "120%", height: "120%", opacity: 0.7 }}
          viewBox="0 0 1440 900"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M-80 230 C 220 70, 260 400, 520 270 C 760 150, 880 490, 1560 820"
            stroke="url(#neon-magenta-login)"
            strokeWidth="64"
            strokeLinecap="round"
            filter="blur(40px)"
          />
          <path
            d="M-50 220 C 240 80, 280 390, 520 280 C 760 170, 890 480, 1520 800"
            stroke="#ff1493"
            strokeWidth="10"
            strokeLinecap="round"
            filter="blur(8px)"
          />
          <path
            d="M-40 840 C 320 730, 440 900, 780 830 C 1080 770, 1220 940, 1540 830"
            stroke="url(#neon-red-login)"
            strokeWidth="74"
            filter="blur(46px)"
          />
          <path
            d="M-40 840 C 320 730, 440 900, 780 830 C 1080 770, 1220 940, 1540 830"
            stroke="#ff1e42"
            strokeWidth="8"
            filter="blur(7px)"
          />
          <defs>
            <linearGradient id="neon-magenta-login" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ec4899" />
              <stop offset="50%" stopColor="#d946ef" />
              <stop offset="100%" stopColor="#8b5cf6" />
            </linearGradient>
            <linearGradient id="neon-red-login" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ff1744" />
              <stop offset="50%" stopColor="#e11d48" />
              <stop offset="100%" stopColor="#a824e8" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* Content Container */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          width: "100%",
          maxWidth: "1160px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
          alignItems: "center",
          gap: "52px",
          margin: "0 auto"
        }}
      >
        {/* Left column: Brand & Master info */}
        <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div
              style={{
                position: "relative",
                width: "70px",
                height: "70px",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <svg width="70" height="70" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M16 38 C 16 22, 25 14, 36 14 C 47 14, 56 22, 56 38"
                  stroke="#ec4899"
                  strokeWidth="4.5"
                  strokeLinecap="round"
                  filter="drop-shadow(0 0 6px #ec4899)"
                />
                <rect x="10" y="32" width="8" height="18" rx="4" fill="#a855f7" filter="drop-shadow(0 0 6px #a855f7)" />
                <rect x="54" y="32" width="8" height="18" rx="4" fill="#a855f7" filter="drop-shadow(0 0 6px #a855f7)" />
                <rect x="18" y="24" width="36" height="32" rx="14" fill="#ffffff" />
                <circle cx="28" cy="38" r="2.8" fill="#1e1035" />
                <circle cx="44" cy="38" r="2.8" fill="#1e1035" />
                <path d="M31 43 Q 36 48, 41 43" stroke="#1e1035" strokeWidth="2.2" strokeLinecap="round" fill="none" />
                <circle cx="24" cy="42" r="2" fill="#f43f5e" opacity="0.6" />
                <circle cx="48" cy="42" r="2" fill="#f43f5e" opacity="0.6" />
              </svg>
            </div>

            <div style={{ position: "relative", display: "flex", flexDirection: "column" }}>
              <div style={{ position: "relative", display: "inline-flex", alignItems: "baseline" }}>
                <span style={{ fontSize: "28px", fontWeight: 900, color: "#ffffff", letterSpacing: "-0.5px" }}>
                  Novaes
                </span>
                <span style={{ fontSize: "28px", fontWeight: 900, color: "#ff1e42", letterSpacing: "-0.5px" }}>
                  Web
                </span>
                <svg
                  style={{
                    position: "absolute",
                    top: "-10px",
                    right: "-12px",
                    width: "80px",
                    height: "28px",
                    overflow: "visible",
                    pointerEvents: "none"
                  }}
                  viewBox="0 0 80 28"
                  fill="none"
                >
                  <path
                    d="M2 24 C 24 2, 54 2, 78 18"
                    stroke="#ff1e42"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <span
                style={{
                  fontSize: "22px",
                  fontWeight: 900,
                  letterSpacing: "1px",
                  background: "linear-gradient(90deg, #ffffff 0%, #fbcfe8 50%, #c084fc 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  textTransform: "uppercase",
                  marginTop: "-4px"
                }}
              >
                CRM IA
              </span>
            </div>
          </div>

          <div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "6px 14px",
                borderRadius: "9999px",
                background: "rgba(42, 14, 48, 0.7)",
                border: "1px solid rgba(236, 72, 153, 0.45)",
                boxShadow: "0 0 16px rgba(236, 72, 153, 0.25)"
              }}
            >
              <Crown size={14} style={{ color: "#fbbf24" }} />
              <span style={{ fontSize: "13px", fontWeight: 700, color: "#f5d0fe", letterSpacing: "0.2px" }}>
                Painel Master — Acesso Exclusivo
              </span>
            </div>
          </div>

          <h1
            style={{
              fontSize: "clamp(26px, 3.2vw, 36px)",
              fontWeight: 900,
              lineHeight: 1.15,
              color: "#ffffff",
              letterSpacing: "-0.6px",
              margin: 0
            }}
          >
            Central Administrativa<br />NovaesWeb CRM IA
          </h1>

          <p
            style={{
              fontSize: "14px",
              lineHeight: 1.6,
              color: "rgba(226, 232, 240, 0.75)",
              margin: 0,
              maxWidth: "460px"
            }}
          >
            Ambiente exclusivo para gestão de clientes parceiros, governança de planos, modelos de inteligência artificial e operação centralizada.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: "10px",
              marginTop: "12px"
            }}
          >
            <div
              style={{
                background: "rgba(24, 12, 32, 0.55)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "14px",
                padding: "16px 8px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                gap: "8px",
                backdropFilter: "blur(10px)",
                boxShadow: "0 4px 18px rgba(0, 0, 0, 0.35)"
              }}
            >
              <Users size={22} style={{ color: "#f1f5f9" }} />
              <span style={{ fontSize: "11px", fontWeight: 600, color: "#e2e8f0", lineHeight: 1.3 }}>
                Clientes e<br />Empresas
              </span>
            </div>

            <div
              style={{
                background: "rgba(24, 12, 32, 0.55)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "14px",
                padding: "16px 8px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                gap: "8px",
                backdropFilter: "blur(10px)",
                boxShadow: "0 4px 18px rgba(0, 0, 0, 0.35)"
              }}
            >
              <Layers size={22} style={{ color: "#f1f5f9" }} />
              <span style={{ fontSize: "11px", fontWeight: 600, color: "#e2e8f0", lineHeight: 1.3 }}>
                Planos e<br />Governança
              </span>
            </div>

            <div
              style={{
                background: "rgba(24, 12, 32, 0.55)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "14px",
                padding: "16px 8px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                gap: "8px",
                backdropFilter: "blur(10px)",
                boxShadow: "0 4px 18px rgba(0, 0, 0, 0.35)"
              }}
            >
              <Bot size={22} style={{ color: "#f1f5f9" }} />
              <span style={{ fontSize: "11px", fontWeight: 600, color: "#e2e8f0", lineHeight: 1.3 }}>
                IA e<br />Provedores
              </span>
            </div>

            <div
              style={{
                background: "rgba(24, 12, 32, 0.55)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "14px",
                padding: "16px 8px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                gap: "8px",
                backdropFilter: "blur(10px)",
                boxShadow: "0 4px 18px rgba(0, 0, 0, 0.35)"
              }}
            >
              <BarChart3 size={22} style={{ color: "#f1f5f9" }} />
              <span style={{ fontSize: "11px", fontWeight: 600, color: "#e2e8f0", lineHeight: 1.3 }}>
                CRM Próprio<br />NovaesWeb
              </span>
            </div>
          </div>
        </div>

        {/* Right column: Master Login Box */}
        <div style={{ display: "flex", justifyContent: "center" }}>
          <div
            style={{
              width: "100%",
              maxWidth: "430px",
              background: "rgba(24, 12, 34, 0.68)",
              backdropFilter: "blur(28px)",
              WebkitBackdropFilter: "blur(28px)",
              border: "1px solid rgba(255, 255, 255, 0.14)",
              borderRadius: "28px",
              padding: "36px 32px",
              boxShadow: "0 24px 60px rgba(0, 0, 0, 0.65), 0 0 32px rgba(217, 70, 239, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.16)"
            }}
          >
            <div
              style={{
                width: "52px",
                height: "52px",
                margin: "0 auto 16px",
                borderRadius: "14px",
                background: "linear-gradient(135deg, #7c3aed 0%, #c026d3 100%)",
                boxShadow: "0 6px 20px rgba(192, 38, 211, 0.45)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <Crown size={24} style={{ color: "#ffffff" }} />
            </div>

            <h2
              style={{
                fontSize: "22px",
                fontWeight: 800,
                color: "#ffffff",
                textAlign: "center",
                margin: 0,
                letterSpacing: "-0.3px"
              }}
            >
              Acesso ao Painel Master
            </h2>
            <p
              style={{
                fontSize: "13px",
                color: "#c4b5fd",
                textAlign: "center",
                margin: "4px 0 24px",
                fontWeight: 500
              }}
            >
              NovaesWeb CRM IA — Exclusivo Mantenedor
            </p>

            <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ position: "relative", width: "100%" }}>
                <Mail
                  size={18}
                  style={{
                    position: "absolute",
                    left: "14px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "#94a3b8",
                    pointerEvents: "none"
                  }}
                />
                <input
                  type="email"
                  placeholder="E-mail do administrador (opcional)"
                  aria-label="E-mail"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "13px 14px 13px 44px",
                    background: "rgba(12, 6, 18, 0.7)",
                    border: "1px solid rgba(255, 255, 255, 0.14)",
                    borderRadius: "12px",
                    color: "#ffffff",
                    fontSize: "14px",
                    outline: "none",
                    transition: "border-color 0.2s, box-shadow 0.2s"
                  }}
                  onFocus={e => {
                    e.target.style.borderColor = "#d946ef";
                    e.target.style.boxShadow = "0 0 0 3px rgba(217, 70, 239, 0.25)";
                  }}
                  onBlur={e => {
                    e.target.style.borderColor = "rgba(255, 255, 255, 0.14)";
                    e.target.style.boxShadow = "none";
                  }}
                />
              </div>

              <div style={{ position: "relative", width: "100%" }}>
                <Lock
                  size={18}
                  style={{
                    position: "absolute",
                    left: "14px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "#94a3b8",
                    pointerEvents: "none"
                  }}
                />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Senha Master ou da sua conta"
                  aria-label="Senha"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  style={{
                    width: "100%",
                    padding: "13px 44px 13px 44px",
                    background: "rgba(12, 6, 18, 0.7)",
                    border: "1px solid rgba(255, 255, 255, 0.14)",
                    borderRadius: "12px",
                    color: "#ffffff",
                    fontSize: "14px",
                    outline: "none",
                    transition: "border-color 0.2s, box-shadow 0.2s"
                  }}
                  onFocus={e => {
                    e.target.style.borderColor = "#d946ef";
                    e.target.style.boxShadow = "0 0 0 3px rgba(217, 70, 239, 0.25)";
                  }}
                  onBlur={e => {
                    e.target.style.borderColor = "rgba(255, 255, 255, 0.14)";
                    e.target.style.boxShadow = "none";
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Ocultar senha" : "Exibir senha"}
                  style={{
                    position: "absolute",
                    right: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    color: "#94a3b8",
                    cursor: "pointer",
                    padding: "4px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginTop: "4px",
                  fontSize: "13px"
                }}
              >
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    color: "#cbd5e1",
                    cursor: "pointer",
                    userSelect: "none"
                  }}
                >
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={e => setRememberMe(e.target.checked)}
                    style={{
                      accentColor: "#d946ef",
                      width: "16px",
                      height: "16px",
                      cursor: "pointer"
                    }}
                  />
                  <span>Manter-me conectado</span>
                </label>
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "13px 20px",
                  borderRadius: "12px",
                  border: "none",
                  marginTop: "10px",
                  cursor: loading ? "wait" : "pointer",
                  background: "linear-gradient(90deg, #ff1e42 0%, #e11d48 35%, #a824e8 100%)",
                  boxShadow: "0 6px 22px rgba(225, 29, 72, 0.4)",
                  color: "#ffffff",
                  fontWeight: 700,
                  fontSize: "15px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "10px",
                  transition: "all 0.2s"
                }}
              >
                <LogIn size={18} />
                <span>{loading ? "Autenticando..." : "Entrar no Painel Master"}</span>
              </button>
            </form>

            {error && (
              <div
                role="alert"
                style={{
                  marginTop: "16px",
                  padding: "12px 14px",
                  borderRadius: "10px",
                  background: "rgba(225, 29, 72, 0.15)",
                  border: "1px solid rgba(225, 29, 72, 0.4)",
                  color: "#fecdd3",
                  fontSize: "13px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px"
                }}
              >
                <AlertCircle size={16} style={{ color: "#fb7185", flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            <div
              style={{
                marginTop: "24px",
                paddingTop: "16px",
                borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                color: "#94a3b8",
                fontSize: "12px"
              }}
            >
              <ShieldCheck size={14} style={{ color: "#10b981" }} />
              <span>Ambiente Administrativo Seguro &middot; NovaesWeb</span>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

