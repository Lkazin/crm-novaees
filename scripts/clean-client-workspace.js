const fs = require('fs');
const file = 'C:/Users/camil/novaesweb-crm-ai/src/components/crm/ClientWorkspace.tsx';
let c = fs.readFileSync(file, 'utf8');

// 1. Remove <SetupJourney ... /> from main flow
c = c.replace(
  /<SetupJourney[\s\S]*?onUpgrade=\{openUpgradeRequest\}\s*\/>\s*/,
  ''
);

// 2. Remove identity icon <div className={styles.identityIcon}><Building2 size={25}/></div>
c = c.replace(
  /<div className=\{styles\.identityIcon\}><Building2 size=\{25\}\/><\/div>/,
  ''
);

// 3. Remove Sparkles icon box in Section 2 (Configurar Minha IA)
c = c.replace(
  /<div className=\{styles\.sectionIcon\}>\s*<Sparkles size=\{26\} color=\"#fff\"\/>\s*<\/div>/,
  ''
);

fs.writeFileSync(file, c, 'utf8');
console.log('CLIENT_WORKSPACE_CLEANED');
