# Central Administrativa NovaesWeb CRM AI — entrega incremental

## Implementado no GitHub
- Página `/admin` com interface responsiva e dados somente leitura.
- API privada `GET /api/crm/admin/overview`.
- Autenticação por sessão real do `/operator` (cookie HttpOnly).
- Autorização obrigatória: registro em `platform_staff`, `enabled=true`, papel `MASTER`, `ADMINISTRADOR` ou `FINANCEIRO`. A verificação é feita com JWT próprio do usuário e RLS da tabela.
- Somente após autorização, o servidor consulta dados entre empresas com credencial server-only. Essa chave NUNCA é enviada ao cliente e NÃO é segura em variáveis `NEXT_PUBLIC_`.
- Consulta de `crm_tenants`, `crm_channels`, `crm_ai_usage_events` e `crm_usage_limits` com limites de paginação e aviso de resultados parciais.
- Migração aplicada: `20261105021618_crm_ai_usage_reporting_foundation.sql` (eventos de uso, modelos, tokens, custo estimado, limites e RLS por empresa).
- As tabelas de consumo não são preenchidas por simulação; os eventos reais serão inseridos quando integrarmos o registro de execução ao gateway e ao mecanismo de fallback.

## Limitações reais
- A tabela `platform_staff` estava vazia na verificação. **Nenhum administrador foi criado automaticamente**.
- As empresas do CRM ainda não foram cadastradas; os relatórios mostrarão estado vazio até existir informação real.
- `crm_usage_limits` registra limites planejados, mas NÃO bloqueia uso antes da integração do motor de orçamento. Não anunciar controle de custos automático em funcionamento.
- Estado `connected` de um canal é registro no banco, não um ping em tempo real da Evolution.
- A tela é de consulta: não cria, edita ou suspende empresas, não mexe em planos e não opera cobranças.
- Contagens são limitadas a 100 empresas, 200 canais e 1000 eventos no mês atual. O painel indica resultados parciais.
- Não expor dados de consumo comercial a papéis `SUPORTE` ou `VISUALIZACAO` até existir uma política de acesso por funcionalidade.
- Não há envio por WhatsApp nessa tela.

## Para GOLF (computador)
1. Fazer `git pull origin feat/whatsapp-ai-lab`; conferir que a branch e o repo são os corretos.
2. Conferir no arquivo local `.env.ai-lab` as chaves `CRM_SUPABASE_URL` e `CRM_SUPABASE_PUBLISHABLE_KEY`; para administração entre empresas será necessária `CRM_SUPABASE_SERVICE_ROLE_KEY` somente no backend do CRM.
3. Antes de usar a chave privilegiada, verificar os limites de acesso do container e não publicar a porta 3040 fora de `127.0.0.1` sem HTTPS e controles adicionais.
4. Cadastrar um **usuário real** no Auth do projeto CRM, e somente após verificar identidade e permissões, atribuir `platform_staff` com papel autorizado; não copiar senha, token ou chaves no chat.
5. Iniciar somente o Compose do CRM, acessar `http://localhost:3040/operator` para fazer login e depois abrir `http://localhost:3040/admin`.
6. Conferir acesso recusado para usuários sem `platform_staff`, desabilitados e papéis sem privilégio. Confirmar que a lista fica vazia se não houver empresas reais.
7. Testar backend da IA com `AI_REPLY_ENABLED=false`. Configurar e testar fallback do OmniRoute sem disparar mensagens a clientes.

## Próximas etapas do produto
- Cadastro e edição de empresas com ações transacionais, validação de papel e auditoria persistida.
- Convites e gestão de operadores com MFA, expiração de sessões e revogação.
- Instrumentação da IA com idempotência por requisição, tokens obtidos do provedor, modelo efetivo e custos estimados quando houver tabela de preços real.
- Aplicação transacional de limites por empresa antes de chamar o modelo, monitoramento de erro 429 e filas.
- Painel de diagnóstico e trilha de auditoria para ações sensíveis.
