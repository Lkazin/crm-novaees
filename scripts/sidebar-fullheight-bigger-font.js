const fs = require("fs");
const path = require("path");
const file = path.join(__dirname, "..", "src", "components", "crm", "ClientSidebar.module.css");
let css = fs.readFileSync(file, "utf8");

// 1) Letras maiores (x1.2, arredondado para 0.5px)
css = css.replace(/font-size:\s*([\d.]+)px/g, (_, n) => {
  const v = Math.round(parseFloat(n) * 1.2 * 2) / 2;
  return `font-size: ${v}px`;
});

// 2) Altura total da tela, acompanhando a rolagem
css = css.replace(
  /align-self: stretch;\s*\r?\n\s*min-height: 100vh;/,
  "align-self: flex-start;\n  position: sticky;\n  top: 0;\n  height: 100vh;\n  min-height: 100vh;\n  overflow-y: auto;\n  overflow-x: hidden;"
);
css = css.replace(/width: 320px;/, "width: 340px;");

// 3) Rodape (franquia + sair) sempre no fim da sidebar
if (!css.includes("/* __FOOTER_PUSH__ */")) {
  css = css.replace(
    /\/\* Header Brand \/ Logo \*\//,
    "/* __FOOTER_PUSH__ */\n.neonQuotaCard { margin-top: auto; }\n\n/* Header Brand / Logo */"
  );
}

// 4) Mobile: sem altura fixa
css = css.replace(
  /@media \(max-width: 900px\) \{\s*\r?\n\s*\.neonSidebar \{\s*\r?\n\s*width: 100%;/,
  "@media (max-width: 900px) {\n  .neonSidebar {\n    position: relative;\n    height: auto;\n    overflow-y: visible;\n    width: 100%;"
);

fs.writeFileSync(file, css);
console.log("ok");
