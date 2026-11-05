# NovaesWeb CRM AI — execução em ordem de dependência

Este roteiro substitui a lista antiga: somente etapas que podem ser desenvolvidas pelo GitHub e Supabase sem acesso ao computador do operador. Status "código criado" NÃO significa "homologado com WhatsApp real". Não criar empresas ou clientes fictícios.

## Agora — desenvolvimento remoto

1. **Auditar código, fluxos e banco.** CONCLUÍDO nesta rodada: repo e tabelas existentes verificados; 0 empresas reais cadastradas; nenhuma alteração no Master/Entregador.
2. **Cadastrar e suspender empresas na Central Master.** IMPLEMENTADO, pendente teste autenticado com conta Master real: RPC service-only transacional cria tenant inativo, configurações seguras e audit_event; API verifica sessão e staff (MASTER/ADMINISTRADOR); formulário no /admin. Permite suspender e retirar suspensão com confirmação, guarda histórico e retorna a inativa ao remover suspensão. Não atribui usuários nem cria canais.
3. **Base de Conhecimento editável.** IMPLEMENTADO, pendente teste autenticado: página /operator/knowledge, API que lê artigos via RLS, permite criar rascunhos e atualizar/publicar apenas com papel autorizado. Falta consumir conteúdo publicado pelo agente IA e histórico de versões.
4. **Equipe e permissões.** A FAZER: convite por e-mail e cadastro somente de Auth users reais, revogação e trilha de auditoria, limitação por empresa.
5. **Atendimento humano e fila segura.** PARCIAL: API e RPC de atribuição humana e auditoria implementadas; guardião no webhook confere empresa ativa, modo IA e sinalização de envios autorizados antes e depois da geração. O sistema não possui worker de entrega homologado nem garantia transacional contra mudança entre a última consulta e o envio. Notas internas e outbox ainda pendentes.
6. **Instrumentar consumo das IAs e limites reais.** A FAZER: registrar chamadas por tenant, modelo efetivo, tokens de resposta, erros 429, fallback, alertas e limite transacional antes de executar; não inventar preço.
7. **Trabalhadores de fila e recuperação.** A FAZER: idempotência, backoff, estado de envio desconhecido, reconciliação e métricas de falha. Ligar worker de envio somente após homologação.
8. **Diagnóstico e testes finais do código.** EM ANDAMENTO: CI unitários, TypeScript, lint, build, browser no desktop/celular, checagem RLS e limites de API. Adicionar integração automatizada por empresa e cenários de falha.

## GOLF — exclusivamente no computador

- Atualizar branch no Windows, manter segredos em .env.ai-lab local e reconstruir **somente** o Docker Compose novaesweb-crm-ai-lab.
- Checar Redis, Evolution API, OmniRoute, webhook, reachability entre containers e estado da instância `novaesweb-ia-teste`.
- Conectar chave pública do Supabase ao login; configurar chave server-only apenas para os fluxos aprovados.
- Cadastrar o primeiro usuário real autorizado no Supabase Auth e atribuir staff via processo seguro; validar tela /admin e /operator.
- Testar criação de empresa inativa, artigos, contato, permissão entre empresas e mensagem autorizada de ponta a ponta.
- Configurar outras rotas de IA gratuitas e autorizadas; simular limite 429, erro de rede, fallback e evitar cobrança não autorizada.
- Somente com os testes prontos decidir habilitar captura e envio automático. Não ativar serviços ou WhatsApp por padrão.

## Critérios de conclusão

Cada etapa exige implementação do backend, interface quando pertinente, testes de acesso negado e sucesso em conta de teste autorizada, status fiel, documentação e resultado do GitHub Actions. Cenários que necessitam credenciais locais ficam "pendente de homologação GOLF"; não são reportados como completos.

## Regras

- `AI_REPLY_ENABLED=false` e `CRM_SUPABASE_INGEST_ENABLED=false` até testes reais autorizados.
- Nunca colocar service role no cliente, criar Master automaticamente ou popular dados fictícios.
- Funções de escrita sensíveis exigem autenticação, autorização, trilha de auditoria e configurações seguras.
- O código de desenvolvimento permanece em `feat/whatsapp-ai-lab`. Não fazer push na main.


## Segurança de suspensão (entrega incremental)

- `/api/crm/admin/suspension` exige conta Auth real, `platform_staff.enabled`, função Master/Administrador, origem correspondente e confirmação explícita.
- RPC `crm_admin_set_tenant_suspension` só é executável por service_role, cria auditoria, mantém contatos e mensagens e força flags de IA/campanhas/automações para false. Retirar suspensão só retorna para **inactive**.
- `src/lib/crm/outbound-guard.ts` consulta status real do tenant, do canal e da conversa. A rota do webhook injeta duas verificações no processamento: antes de gerar e imediatamente antes do envio.
- O esquema atual mantém `crm_tenant_settings.ai_sending_enabled=false` por CHECK; nenhum operador consegue habilitar envios comerciais nesta fase. `AI_REPLY_ENABLED=false` continua obrigatório.
- **Não considerar bloqueio em tempo real homologado em produção.** Existe uma janela de corrida entre checagem e envio; a garantia forte precisa de outbox transacional e worker com reconciliação. Não chamar o bloqueio de 100% imediato em todos os conectores ainda.
