const fs = require('fs');
const path = 'C:/Users/camil/novaesweb-crm-ai/src/components/crm/ClientWorkspace.tsx';
let content = fs.readFileSync(path, 'utf8');

const importTarget = 'import WorkspaceNavigation, { type WorkspaceNavItem }';
if (content.includes(importTarget)) {
  content = content.replace(importTarget, "import { ClientSidebar } from './ClientSidebar';\n" + importTarget);
}

const sTarget = '{!embedded && <aside className="nw-sidebar">';
const eTarget = '</aside>}';
const sIdx = content.indexOf(sTarget);
const eIdx = content.indexOf(eTarget, sIdx);

if (sIdx !== -1 && eIdx !== -1) {
  const replacement = `{!embedded && (
            <ClientSidebar
              activeTab={activeTab}
              onSelectTab={selectWorkspaceSection}
              onSignOut={() => void signOut()}
              data={data}
              tenant={tenant}
              onChangeTenant={t => void changeTenant(t)}
              quotaData={quotaData}
              quotaPercent={quotaPercent}
              whatsappSlots={whatsappSlots}
              teamOperators={teamOperators}
              clientRecoveryVerified={clientRecoveryVerified}
            />
          )}`;
  content = content.slice(0, sIdx) + replacement + content.slice(eIdx + eTarget.length);
  fs.writeFileSync(path, content, 'utf8');
  console.log('OK_UPDATED');
} else {
  console.log('FAIL_NOT_FOUND', sIdx, eIdx);
}
