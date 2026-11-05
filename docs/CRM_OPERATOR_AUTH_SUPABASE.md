# NovaesWeb CRM AI — Portal operacional do Supabase

## Concluído na branch de desenvolvimento

- `/operator`: login individual via Supabase Auth, sem cadastro público.
- Sessão curta com cookie HTTP-only, SameSite=Strict, e validação server-side no Supabase Auth para cada acesso.
- `GET /api/crm/operator/data`: lista empresas vinculadas ao usuário, contatos, conversas e mensagens reais, respeitando RLS e seleção explícita do tenant.
- `POST /api/crm/operator/contacts`: cadastro real de contato com nome opcional e telefone com DDI; o banco autoriza somente `owner`, `admin` ou `agent` de empresa `active`.
- O laboratório original em `/` e o teste de Groq continuam separados.
- Nenhum atendente é criado automaticamente; nenhum cadastro fictício é inserido.
- Não há envio WhatsApp, resposta automática, alteração de webhook ou publicação externa por essas rotas.

## Estado da integração

A infraestrutura do Supabase foi aplicada no projeto isolado `novaesweb-crm-ai`. O portal funciona por chamadas REST autenticadas, sem chave `service_role`. A conexão efetiva ainda depende da chave pública do próprio projeto configurada **no arquivo local do Docker**. Os contatos do Redis e do Supabase não estão sincronizados; não chamar a caixa temporária de dados persistentes.

## Na máquina local, quando o operador disser GOLF

No arquivo `.env.ai-lab`, adicionar (ou preencher) as variáveis, mantendo o resto:

```dotenv
CRM_SUPABASE_URL=https://mpteambmrlflllfqtkmq.supabase.co
CRM_SUPABASE_PUBLISHABLE_KEY=COLE_AQUI_APENAS_A_CHAVE_PUBLISHABLE_OU_ANON_DO_CRM
AI_REPLY_ENABLED=false
CRM_INBOX_CAPTURE_ENABLED=false
```

Obter a chave correta em Supabase → projeto `novaesweb-crm-ai` → Project Settings/API Keys; nunca usar `service_role`, `sb_secret_...`, ou outra chave privilegiada. Não copiar nenhuma chave para o chat ou GitHub.

1. Atualizar a branch `feat/whatsapp-ai-lab` e reconstruir apenas `novaesweb-crm-ai-lab`.
2. Abrir `http://localhost:3040/operator`.
3. Confirmar que um usuário **real, previamente convidado** existe no Auth do Supabase e possui vínculo em `crm_tenant_memberships` com empresa válida em `crm_tenants`.
4. Login pelo e-mail e senha do operador; selecionar empresa. Se não houver empresa vinculada, exibir estado vazio verdadeiro.
5. Cadastrar um contato de teste com telefone autorizado e consentimento adequado, confirmar no Supabase e verificar que não houve envio de WhatsApp.
6. Conferir que outro usuário sem vínculo não consegue ver nem criar contatos da empresa; que `viewer` não cria; e que um mesmo telefone não é duplicado dentro da mesma empresa.
7. Conferir a sessão expirada, logout e filtros mobile.

### Limitações obrigatórias

- A UI de conversas é **somente leitura**: persistência de mensagens reais do webhook no Supabase ainda precisa ser implementada e homologada.
- Login usa sessão curta sem refresh automático, exigindo novo login quando expirar; correto para homologação inicial, não solução final de UX.
- Cadastro de contato ainda não implementa edição/exclusão, autorização granular de consentimentos nem auditoria de edição.
- O portal não tem onboarding automatizado (criação de empresa, convites e papéis), por ser um fluxo administrativo sensível.
- Operação externa/publicação requer rate limiting, MFA quando apropriado, proteção contra senhas vazadas no Supabase Auth, testes de RLS e HTTPS.
- Não habilitar resposta automática por WhatsApp antes da fila transacional, transferência humana e idempotência completa.

## Estrutura do banco

- Migração `20261105015851_crm_contact_create_operator_policy.sql` concede INSERT em `crm_contacts` apenas quando há membro autorizado e empresa ativa.
- SELECT continua limitado pela política RLS existente e não há GRANT de INSERT para usuários anônimos.
- A evolução do CRM deve manter operações autenticadas por usuário; `service_role` não deve acessar páginas públicas.
