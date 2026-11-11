// Executa uma consulta SQL somente-leitura no projeto Supabase via Management API.
// Uso: SUPABASE_ACCESS_TOKEN=sbp_... node scripts/supabase-query.mjs "select 1"

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF || "mpteambmrlflllfqtkmq";
const query = process.argv[2];

if (!token) { console.error("SUPABASE_ACCESS_TOKEN ausente no ambiente."); process.exit(1); }
if (!query) { console.error("Uso: node scripts/supabase-query.mjs \"<sql>\""); process.exit(1); }

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query }),
});

const text = await res.text();
console.log(`HTTP ${res.status}`);
console.log(text.slice(0, 4000));
process.exit(res.ok ? 0 : 1);
