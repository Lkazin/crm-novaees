const fs = require('fs');
const file = 'C:/Users/camil/novaesweb-crm-ai/src/components/crm/ClientSidebar.tsx';
let c = fs.readFileSync(file, 'utf8');

c = c.replace(
  /<div className=\{styles\.neonLogoWrapper\}>[\s\S]*?<\/div>\s*<\/div>/,
  `<div className={styles.neonLogoWrapper}>
          <img src="/novaes-crm-logo.jpg" alt="Novaes CRM IA" className={styles.neonLogoImg} />
        </div>`
);

fs.writeFileSync(file, c, 'utf8');
console.log('LOGO_UPDATED_SUCCESS');
