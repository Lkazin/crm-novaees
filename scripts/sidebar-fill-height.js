const fs = require("fs");
const path = require("path");
const file = path.join(__dirname, "..", "src", "components", "crm", "ClientSidebar.module.css");
let css = fs.readFileSync(file, "utf8");
const NL = css.includes("\r\n") ? "\r\n" : "\n";
const rep = (re, s) => { if (!re.test(css)) throw new Error("nao achei: " + re); css = css.replace(re, s); };

// rodape deixa de empurrar; quem absorve o espaco sao os grupos do menu
rep(/\.neonQuotaCard \{ margin-top: auto; \}/, ".neonQuotaCard { flex-shrink: 0; }");

// grupos crescem para preencher toda a altura
rep(/\.neonGroup \{\s*display: flex;\s*flex-direction: column;\s*gap: 5px;\s*\}/,
  [".neonGroup {", "  display: flex;", "  flex-direction: column;", "  gap: 5px;", "  flex: 1 1 auto;", "}"].join(NL));

rep(/(\.neonGroupCard \{[^}]*?)gap: 2px;/,
  "$1gap: 2px;" + NL + "  flex: 1 1 auto;");

// itens de menu se esticam dentro do cartao e a letra cresce com a altura da tela
css = css.replace(
  /\.neonNavItem \{([^}]*?)padding: 8px 10px;([^}]*?)font-size: [\d.]+px;/,
  (m, a, b) => `.neonNavItem {${a}padding: 8px 10px;${b}font-size: clamp(15px, 2.1vh, 20px);`
);
rep(/\/\* Item de Navegação Comum \*\//,
  "/* Itens esticam para preencher o cartao */" + NL +
  ".neonGroupCard > * { flex: 1 1 auto; min-height: 44px; }" + NL + NL +
  "/* Item de Navegação Comum */");

// nao deixar quota/sair/cabecalho encolherem
css += NL + ".neonLogoutButton { flex-shrink: 0; }" + NL +
  "@media (max-width: 900px) {" + NL +
  "  .neonGroup, .neonGroupCard { flex: none; }" + NL +
  "  .neonGroupCard > * { flex: none; }" + NL +
  "}" + NL;

fs.writeFileSync(file, css);
console.log("ok");
