const fs = require('fs');
const file = 'C:/Users/camil/novaesweb-crm-ai/src/components/crm/ClientSidebar.tsx';
let c = fs.readFileSync(file, 'utf8');

// Add collapsed state and ChevronLeft / ChevronRight toggle
if (!c.includes('isCollapsed')) {
  c = c.replace(
    'export const ClientSidebar: React.FC<ClientSidebarProps> = ({',
    'export const ClientSidebar: React.FC<ClientSidebarProps> = ({\n  isCollapsed: externalCollapsed,\n  onToggleCollapse,\n'
  );
  
  c = c.replace(
    'interface ClientSidebarProps {',
    'interface ClientSidebarProps {\n  isCollapsed?: boolean;\n  onToggleCollapse?: () => void;'
  );

  // Insert Collapse Toggle button in header
  c = c.replace(
    '<div className={styles.neonBrandText}>',
    `{!isCollapsed && <div className={styles.neonBrandText}>`
  );
  
  c = c.replace(
    '<div className={styles.neonBrandSubtitle}>CRM INTELIGENTE</div>\n        </div>',
    `<div className={styles.neonBrandSubtitle}>CRM INTELIGENTE</div>
        </div>}
        <button
          type="button"
          className={styles.neonCollapseToggle}
          onClick={onToggleCollapse}
          title={isCollapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
          aria-label={isCollapsed ? "Expandir menu" : "Recolher menu"}
        >
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>`
  );

  // Import ChevronLeft if needed
  c = c.replace('ChevronRight,', 'ChevronRight,\n  ChevronLeft,');

  fs.writeFileSync(file, c, 'utf8');
  console.log('ClientSidebar toggle added successfully');
}
