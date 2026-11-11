// Aplica uma migration do diretorio supabase/migrations no projeto Supabase
// via Management API (POST /v1/projects/{ref}/database/query).
//
// Uso: SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply-migration.mjs <arquivo.sql>
// Nao imprime o token. Mostra apenas o nome do arquivo e a resposta do servidor.

import { readFileSync } from "node:fs";
import { basename } from "node:path";

const token = process.env.SUPABASE_ACCESS_TOKEN;
const file = process.argv[2];
const ref = process.env.SUPABASE_PROJECT_REF || "mpteambmrlflllfqtkmq";

if (!token) {
  console.error("SUPABASE_ACCESS_TOKEN ausente no ambiente.");
  process.exit(1);
}
if (!file) {
  console.error("Uso: node scripts/apply-migration.mjs <arquivo.sql>");
  process.exit(1);
}

const query = readFileSync(file, "utf8");

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ query }),
});

const text = await res.text();
console.log(`${basename(file)} -> HTTP ${res.status}`);
if (text.trim()) console.log(text.slice(0, 600));
process.exit(res.ok ? 0 : 1);
