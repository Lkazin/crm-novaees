const fs = require('fs');
const file = 'C:/Users/camil/novaesweb-crm-ai/src/components/crm/ClientWorkspace.module.css';
let content = fs.readFileSync(file, 'utf8');

// Cores padrões NovaesWeb: Fundo profundo roxo escuro, bordas com brilho vermelho suave
const globalRedGlow = `
/* ================= PADRÃO NOVAESWEB: BRILHO VERMELHO SUAVE NAS PÁGINAS ================= */
.clientSurface {
  background: #0f0717 !important;
}

.clientSurface :global(.op-card),
.clientSurface :global(.op-inbox),
.clientSurface :global(.op-chat-container),
.clientSurface :global(.op-chat-header),
.clientSurface :global(.op-chat-footer) {
  background: rgba(22, 9, 32, 0.75) !important;
  border: 1px solid rgba(225, 29, 72, 0.32) !important;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35), 0 0 16px rgba(225, 29, 72, 0.12) !important;
  backdrop-filter: blur(12px) !important;
}

.clientSurface :global(.op-card):hover {
  border-color: rgba(225, 29, 72, 0.5) !important;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.4), 0 0 20px rgba(225, 29, 72, 0.18) !important;
}

/* Campos de Input e Textarea Padronizados */
.clientSurface :global(input:not([type="checkbox"]):not([type="radio"])),
.clientSurface :global(textarea),
.clientSurface :global(select) {
  background: rgba(16, 7, 24, 0.85) !important;
  border: 1px solid rgba(225, 29, 72, 0.25) !important;
  color: #ffffff !important;
}

.clientSurface :global(input:focus),
.clientSurface :global(textarea:focus),
.clientSurface :global(select:focus) {
  border-color: rgba(225, 29, 72, 0.6) !important;
  box-shadow: 0 0 12px rgba(225, 29, 72, 0.25) !important;
}

/* Topbar com Brilho Vermelho Suave */
.workspaceTopbar {
  background: rgba(22, 9, 32, 0.85) !important;
  border: 1px solid rgba(225, 29, 72, 0.35) !important;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4), 0 0 20px rgba(225, 29, 72, 0.15) !important;
}
`;

content += globalRedGlow;
fs.writeFileSync(file, content, 'utf8');
console.log('GLOBAL_RED_GLOW_APPLIED');
