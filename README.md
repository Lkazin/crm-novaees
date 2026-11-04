# NovaesWeb CRM AI

Plataforma independente de CRM multiempresa e agentes de IA para WhatsApp.

**Status:** planejamento. Primeiro desenvolvimento local com Docker Desktop; não há atendimento ou integração ativa.

## Diretrizes
- Painel Master NovaesWeb e futuro painel por cliente.
- Supabase independente (`novaesweb-crm-ai`, região São Paulo), acesso com RLS e isolamento por empresa.
- Evolution API como conector inicial; backend controla filas, agentes, custos e atendimento humano.
- Nunca versionar credenciais, arquivos de sessão, tokens ou dados pessoais.
- Não alterar os sistemas Master, Entregador ou infraestrutura existente.

## Próxima etapa
Inventário somente leitura do Docker, Evolution API, Redis, PostgreSQL e roteador de IA instalado. Implementação apenas depois do diagnóstico.
