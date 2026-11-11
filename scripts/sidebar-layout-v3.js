const fs = require("fs");
const path = require("path");
const dir = path.join(__dirname, "..", "src", "components", "crm");
const fail = (m) => { throw new Error(m); };

/* ---------- TSX: topo | meio (menus) | rodape ---------- */
const tsxPath = path.join(dir, "ClientSidebar.tsx");
let tsx = fs.readFileSync(tsxPath, "utf8");
const NL = tsx.includes("\r\n") ? "\r\n" : "\n";
if (!tsx.includes("neonMiddle")) {
  const a = "      {/* 2. GRUPO: ATENDIMENTO & IA */}";
  const b = "      {/* 6. Franquia do Mês (Visual da Imagem) */}";
  const c = "    </aside>";
  if (!tsx.includes(a) || !tsx.includes(b) || !tsx.includes(c)) fail("marcadores do TSX nao encontrados");
  tsx = tsx.replace(a, `      {/* AREA CENTRAL: grupos de menu (rola por dentro se faltar altura) */}${NL}      <div className={styles.neonMiddle}>${NL}${a}`);
  tsx = tsx.replace(b, `      </div>${NL}${NL}      {/* RODAPE ancorado: Franquia + Sair */}${NL}      <div className={styles.neonFooter}>${NL}${b}`);
  tsx = tsx.replace(c, `      </div>${NL}${c}`);
  fs.writeFileSync(tsxPath, tsx);
}

/* ---------- CSS ---------- */
const cssPath = path.join(dir, "ClientSidebar.module.css");
let css = fs.readFileSync(cssPath, "utf8");
const n = (s) => s.replace(/\n/g, NL);

// sidebar nao rola mais por inteiro: so a area central rola; topo e rodape ficam fixos
css = css.replace(/overflow-y: auto;\s*overflow-x: hidden;\s*overscroll-behavior: contain;/,
  "overflow: hidden;");
if (!css.includes("overflow: hidden;")) fail("bloco .neonSidebar nao encontrado");

// letras acompanham a altura da tela
css = css.replace(/font-size: 15px;(\s*font-weight: 600;\s*cursor: pointer;)/,
  "font-size: clamp(15px, 1.9vh, 18px);$1");

if (!css.includes("/* __LAYOUT_V3__ */")) {
  const marker = "/* Botao e ffundo do menu mobile";
  const add = n(`/* __LAYOUT_V3__ */
/* Area central: ocupa a altura livre e distribui os grupos de forma equilibrada */
.neonSidebar > .neonMiddle {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 12px;
  scrollbar-width: thin;
}
.neonMiddle > .neonGroup { flex: 1 0 auto; }
.neonMiddle > .neonGroupCard { flex: 0 0 auto; }
.neonMiddle .neonGroup > .neonGroupCard { flex: 1 0 auto; }
/* Itens crescem com moderacao para ocupar a altura, sem ficar exagerados */
.neonMiddle .neonGroupCard > * {
  flex: 1 0 auto;
  min-height: 42px;
  max-height: 66px;
}
.neonMiddle .neonGroupCard > button { box-sizing: border-box; }

/* Rodape: sempre visivel e colado no fim */
.neonSidebar > .neonFooter {
  flex: 0 0 auto;
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

`);
  const i = css.indexOf("/* Botao e fundo do menu mobile");
  if (i < 0) fail("ponto de insercao do CSS nao encontrado");
  css = css.slice(0, i) + add + css.slice(i);
}
fs.writeFileSync(cssPath, css);
console.log("ok");
