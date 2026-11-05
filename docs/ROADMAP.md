# NovaesWeb CRM AI — execução em ordem de dependência

Este roteiro substitui a lista antiga: somente etapas que podem ser desenvolvidas pelo GitHub e Supabase sem acesso ao computador do operador. Status "código criado" NÃO significa "homologado com WhatsApp real". Não criar empresas ou clientes fictícios.

## Agora — desenvolvimento remoto

1. **Auditar código, fluxos e banco.** CONCLUÍDO nesta rodada: repo e tabelas existentes verificados; 0 empresas reais cadastradas; nenhuma alteração no Master/Entregador.
2. **Cadastrar empresas na Central Master.** IMPLEMENTADO, pendente teste autenticado com conta Master real: RPC service-only transacional cria tenant inativo, configurações seguras e audit_event; API verifica sessão e staff (MASTER/ADMINISTRADOR); formulário no /admin. Não atribui usuários nem cria canais.
3. **Base de Conhecimento editável.** IMPLEMENTADO, pendente teste autenticado: página /operator/knowledge, API que lê artigos via RLS, permite criar rascunhos e atualizar/publicar apenas com papel autorizado. Falta consumir conteúdo publicado pelo agente IA e histórico de versões.
4. **Equipe e permissões.** A FAZER: convite por e-mail e cadastro somente de Auth users reais, revogação e trilha de auditoria, limitação por empresa.
5. **Atendimento humano e fila segura.** A FAZER: atribuição, modo humano, bloquear IA quando transferido, notas internas, indicadores de entrega. Nunca enviar WhatsApp diretamente antes do contrato/outbox estar homologado.
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
