const fs = require('fs');
const file = 'C:/Users/camil/novaesweb-crm-ai/src/components/crm/ClientWorkspace.module.css';
let content = fs.readFileSync(file, 'utf8');

// Soft red glow for cards (.op-card, .primaryPanel, .metric)
const cardRedGlow = `
.clientSurface :global(.op-card) {
  background: rgba(22, 8, 32, 0.72) !important;
  border: 1px solid rgba(225, 29, 72, 0.28) !important;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3), 0 0 16px rgba(225, 29, 72, 0.08) !important;
  backdrop-filter: blur(12px) !important;
}
.clientSurface :global(.op-card):hover {
  border-color: rgba(225, 29, 72, 0.45) !important;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35), 0 0 20px rgba(225, 29, 72, 0.14) !important;
}
`;

if (!content.includes('rgba(225, 29, 72, 0.28)')) {
  content += cardRedGlow;
  fs.writeFileSync(file, content, 'utf8');
  console.log('ClientWorkspace cards updated with soft red glow');
} else {
  console.log('Already contains soft red glow');
}
