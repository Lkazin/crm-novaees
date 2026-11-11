const fs = require("fs");
const path = require("path");
const dir = path.join(__dirname, "..", "src", "components", "crm");
const read = (f) => fs.readFileSync(path.join(dir, f), "utf8");
const write = (f, c) => fs.writeFileSync(path.join(dir, f), c);
const fail = (m) => { throw new Error(m); };

/* ---------------- CSS da sidebar ---------------- */
let css = read("ClientSidebar.module.css");
const NL = css.includes("\r\n") ? "\r\n" : "\n";
const n = (s) => s.replace(/\n/g, NL);

// bloco principal: fixa na altura visivel, rolagem interna
css = css.replace(/width: 340px;\s*flex-shrink: 0;\s*align-self: flex-start;\s*position: sticky;\s*top: 0;\s*height: 100vh;\s*min-height: 100vh;\s*overflow-y: auto;\s*overflow-x: hidden;/,
  n("width: 290px;\n  flex-shrink: 0;\n  align-self: flex-start;\n  position: relative;\n  height: 100vh;\n  height: 100dvh;\n  min-height: 0;\n  overflow-y: auto;\n  overflow-x: hidden;\n  overscroll-behavior: contain;"));
if (!/width: 290px;/.test(css)) fail("bloco .neonSidebar nao encontrado");

// desfaz o esticamento
css = css.replace(/\.neonQuotaCard \{ flex-shrink: 0; \}/, ".neonSidebar > * { flex-shrink: 0; }");
css = css.replace(/(\.neonGroup \{[^}]*?)\s*flex: 1 1 auto;/, "$1");
css = css.replace(/(\.neonGroupCard \{[^}]*?)\s*flex: 1 1 auto;/, "$1");
css = css.replace(/\/\* Itens esticam para preencher o cartao \*\/\s*\.neonGroupCard > \* \{[^}]*\}\s*/, "");
css = css.replace(/font-size: clamp\(15px, 2\.1vh, 20px\);/, "font-size: 15px;");

// remove os blocos @media antigos (do ultimo "max-width: 900px" com .neonSidebar ate o fim)
const idx = css.indexOf("@media (max-width: 900px) {");
if (idx < 0) fail("media antigo nao encontrado");
css = css.slice(0, idx).trimEnd() + NL + NL;
css = css.replace(/\.neonLogoutButton \{ flex-shrink: 0; \}\s*$/m, "");

css += n(`/* Botao e fundo do menu mobile (escondidos no desktop/tablet) */
.neonMobileToggle { display: none; }
.neonBackdrop { display: none; }

/* Tablet: sidebar compacta (modo recolhido) e nunca sobrepoe o conteudo */
@media (min-width: 901px) and (max-width: 1024px) {
  .neonSidebar { width: 78px; }
}

/* Celular: menu fechado ao iniciar, abre como painel lateral sobre a pagina */
@media (max-width: 900px) {
  .neonSidebar {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 1100;
    width: min(300px, 86vw);
    height: 100vh;
    height: 100dvh;
    transform: translateX(-105%);
    transition: transform 0.25s ease;
    box-shadow: none;
    border-radius: 0;
    margin: 0;
  }
  .neonSidebar.mobileOpen {
    transform: translateX(0);
    box-shadow: 8px 0 40px rgba(0, 0, 0, 0.6);
  }
  .neonCollapseToggle { display: none; }
  .neonMobileToggle {
    display: flex;
    position: fixed;
    top: 12px;
    left: 12px;
    z-index: 1050;
    width: 44px;
    height: 44px;
    align-items: center;
    justify-content: center;
    border-radius: 12px;
    background: #1b0c2a;
    border: 1px solid rgba(225, 29, 72, 0.5);
    color: #ffffff;
    cursor: pointer;
    box-shadow: 0 0 14px rgba(225, 29, 72, 0.25);
  }
  .neonBackdrop {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 1090;
    background: rgba(5, 2, 10, 0.65);
  }
}
`);
write("ClientSidebar.module.css", css);

/* ---------------- TSX da sidebar ---------------- */
let tsx = read("ClientSidebar.tsx");
if (!/\bMenu,/.test(tsx)) tsx = tsx.replace(/import \{\s*\r?\n(\s*)Smartphone,/, (m, sp) => `import {${NL}${sp}Menu,${NL}${sp}X,${NL}${sp}Smartphone,`);
tsx = tsx.replace('import React from "react";', 'import React, { useState } from "react";');
tsx = tsx.replace(/  onSelectTab,\r?\n  onSignOut,\r?\n  data,\r?\n  tenant,\r?\n  onChangeTenant,\r?\n  quotaData,\r?\n  quotaPercent,\r?\n  whatsappSlots,\r?\n  teamOperators,\r?\n  clientRecoveryVerified = false,\r?\n\}\) => \{/,
  n(`  onSelectTab: onSelectTabProp,
  onSignOut,
  data,
  tenant,
  onChangeTenant,
  quotaData,
  quotaPercent,
  whatsappSlots,
  teamOperators,
  clientRecoveryVerified = false,
}) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const onSelectTab = (tab: any) => {
    onSelectTabProp(tab);
    setMobileOpen(false);
  };`));
if (!tsx.includes("onSelectTabProp(tab)")) fail("props da sidebar nao encontrados");
tsx = tsx.replace(/  return \(\r?\n    <aside className=\{styles\.neonSidebar\} aria-label="Menu Lateral do Cliente">/,
  n(`  return (
    <>
    <button
      type="button"
      className={styles.neonMobileToggle}
      onClick={() => setMobileOpen((v) => !v)}
      aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
      aria-expanded={mobileOpen}
    >
      {mobileOpen ? <X size={22} /> : <Menu size={22} />}
    </button>
    {mobileOpen && <div className={styles.neonBackdrop} onClick={() => setMobileOpen(false)} aria-hidden="true" />}
    <aside
      className={\`\${styles.neonSidebar} \${isCollapsed ? styles.isCollapsed : ""} \${mobileOpen ? styles.mobileOpen : ""}\`}
      aria-label="Menu Lateral do Cliente"
    >`));
if (!tsx.includes("neonMobileToggle")) fail("return da sidebar nao encontrado (verifique classe isCollapsed)");
tsx = tsx.replace(/    <\/aside>\r?\n  \);\r?\n\};/, n("    </aside>\n    </>\n  );\n};"));
write("ClientSidebar.tsx", tsx);

/* ---------------- ClientWorkspace ---------------- */
let ws = read("ClientWorkspace.tsx");
if (!/\buseEffect\b/.test(ws.slice(0, 4000))) fail("useEffect nao importado");
ws = ws.replace(/(  const \[sidebarCollapsed, setSidebarCollapsed\] = useState\(false\);)/,
  n(`$1
  // Tablet (901-1024px): sidebar compacta. Celular/desktop: expandida (celular usa painel suspenso).
  useEffect(() => {
    let band = -1;
    const apply = () => {
      const w = window.innerWidth;
      const next = w <= 900 ? 0 : w <= 1024 ? 1 : 2;
      if (next === band) return;
      band = next;
      setSidebarCollapsed(next === 1);
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);`));
if (!ws.includes("let band = -1")) fail("sidebarCollapsed nao encontrado em ClientWorkspace");
write("ClientWorkspace.tsx", ws);

let wcss = read("ClientWorkspace.module.css");
if (!wcss.includes("/* sidebar fixa */")) {
  wcss += n(`
/* sidebar fixa: so o conteudo principal rola */
.clientSurface:global(.nw-layout-shell) {
  height: 100vh;
  height: 100dvh;
  min-height: 0;
  overflow: hidden;
}
.clientSurface :global(.nw-main-content) {
  height: 100vh;
  height: 100dvh;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
}
@media (max-width: 900px) {
  .clientSurface :global(.nw-main-content) { padding-top: 68px; }
}
`);
}
write("ClientWorkspace.module.css", wcss);
console.log("ok");
