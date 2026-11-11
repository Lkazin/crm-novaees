const fs = require('fs');
const file = 'C:/Users/camil/novaesweb-crm-ai/src/components/crm/ClientWorkspace.tsx';
let c = fs.readFileSync(file, 'utf8');

if (!c.includes('sidebarCollapsed')) {
  c = c.replace(
    'export const ClientWorkspace: React.FC<ClientWorkspaceProps> = ({ embedded = false }) => {',
    'export const ClientWorkspace: React.FC<ClientWorkspaceProps> = ({ embedded = false }) => {\n  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);'
  );

  c = c.replace(
    '<ClientSidebar',
    '<ClientSidebar\n              isCollapsed={sidebarCollapsed}\n              onToggleCollapse={() => setSidebarCollapsed(prev => !prev)}'
  );

  fs.writeFileSync(file, c, 'utf8');
  console.log('ClientWorkspace collapse state connected');
}
