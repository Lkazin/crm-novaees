# Laboratório de um agente WhatsApp + IA (sem clientes reais)

## O que está implementado
Fluxo experimental: webhook Evolution (somente `messages.upsert` texto individual) → validação de segredo no cabeçalho `x-crm-webhook-secret` → instância única e allowlist de número → Redis (trava de 90 segundos; duplicidade por 24 horas) → API de chat compatível com OpenAI → `/message/sendText/{instance}` da Evolution.

**Não é ainda SaaS multiempresa nem suporte de produção.** Não tem memória multi-turno, atendimento humano integrado, faturamento, fila persistente/outbox, auditoria, observabilidade ou reconciliação de envios. Webhook é processado sincronamente; em produção deve ser substituído por fila/worker e outbox persistente. Se um envio realmente acontecer, mas houver timeout antes da confirmação, um retry pode gerar mensagem duplicada.

## Antes de rodar
1. Ter Docker Desktop operacional e identificar a instância Evolution API realmente instalada, versão e porta. **Não recriar nem reiniciar** os containers atuais.
2. Provedor inicial escolhido: **OpenRouter**. O endpoint oficial é `https://openrouter.ai/api/v1/chat/completions` e o modelo `openrouter/free` seleciona uma opção gratuita. Isso ainda não constitui conexão validada; requer uma chave própria e limites por conta. A integração permanece adaptável a outros provedores compatíveis.
3. Criar o arquivo local `.env.ai-lab` a partir de `.env.ai-lab.example`. Inserir as chaves **somente localmente**. Usar um WhatsApp de teste autorizado e seu próprio número como `AI_TEST_ALLOWED_NUMBER` (DDI+DDD+número).
4. Gerar o segredo do webhook (32+ caracteres fortes, independentes da chave Evolution).
5. Manter `AI_REPLY_ENABLED=false` inicialmente.

## Iniciar laboratório (somente depois do inventário)
```powershell
docker compose -f docker-compose.ai-lab.yml --project-name novaesweb-crm-ai-lab up --build -d
```
UI no computador: `http://localhost:3040`. Health: `http://localhost:3040/api/ai/health`. A porta 3040 está vinculada a 127.0.0.1, sem abertura intencional ao público.

**A Evolution, se estiver em outro container Docker, não consegue acessar o 127.0.0.1 do host diretamente.** Configure-a com uma URL privada acessível entre os containers (rede Docker compartilhada explicitamente) ou uma URL HTTPS com proxy autenticado. Não exponha o webhook publicamente antes de confirmar autenticação/TLS. O container `crm-ai-app` consulta Evolution/IA pelo host gateway `host.docker.internal`, com as portas reais definidas no ambiente.

## Configurar webhook na instância de testes
A Evolution API v2 costuma usar `POST /webhook/set/{instance}` ou `/event/webhook/set/{instance}` dependendo da instalação. Conferir via versão e endpoint existente, sem sobrescrever webhooks de outros projetos. Selecionar apenas o evento `MESSAGES_UPSERT`, desabilitar `webhookByEvents` e `webhookBase64`. O servidor espera `x-crm-webhook-secret`; **somente habilitar conexão se a versão da Evolution instalada suportar configurar esse cabeçalho personalizado**. Exemplo conceitual de configuração em versões com suporte:
```json
{
  "enabled": true,
  "url": "http://crm-ai-app:3000/api/evolution/webhook",
  "webhookByEvents": false,
  "webhookBase64": false,
  "headers": { "x-crm-webhook-secret": "VALOR_DO_SEU_SEGREDO_LOCAL" },
  "events": ["MESSAGES_UPSERT"]
}
```
O formato exato de `headers` e de `webhook` (aninhado ou plano) depende da versão instalada. Não há descoberta automática nem instalação já executada.

## Teste de funcionamento
1. Rodar `npm run test:agent`, `npm run lint` e `npm run build`.
2. Com `AI_REPLY_ENABLED=false`, confirmar `/api/ai/health` e enviar payload fictício ao webhook autenticado: retorno esperado `disabled`, sem saída para WhatsApp.
3. Testar webhook sem header, com segredo incorreto, grupos, mensagens enviadas por nós e números diferentes (ignorar/bloquear).
4. Verificar manualmente conexão real com Redis, roteador IA e Evolution; o endpoint health *não* testa serviços externos.
5. Testar a resposta da IA antes do WhatsApp através de `POST http://localhost:3040/api/ai/test` com JSON `{\"question\":\"Qual o horário?\"}` e header `x-crm-lab-admin-token` igual ao valor de `CRM_LAB_ADMIN_TOKEN` (secret distinto do webhook). O retorno deve conter `deliveredToWhatsApp: false`. Nunca usar a senha real em comandos salvos no GitHub.\n6. Autorizar `AI_REPLY_ENABLED=true` **somente no laboratório e para número em allowlist**. Reiniciar só o container do lab; mandar uma mensagem de texto de teste do número permitido; verificar recebimento e resposta.
7. Desligar novamente após o teste. Antes de vender, implementar isolamento multiempresa com RLS, consentimento, transferência humana e política oficial do WhatsApp.

## Limites técnicos
- Provedor AI: requer chave + modelo e endpoint compatível. Falhas retornam status 503 e não são consideradas sucesso.
- Entrada: só mensagem de texto individual com `@s.whatsapp.net`; alguns formatos de ID `@lid` e mídia foram intencionalmente ignorados.
- Deduplicação Redis reduz repetições, mas não garante entrega exatamente uma vez.
- O laboratório não altera o Supabase CRM nem tem cadastro de clientes reais.


## Configuração do OpenRouter (primeira opção)
1. Crie uma conta em https://openrouter.ai e acesse https://openrouter.ai/settings/keys para gerar uma chave API com limites adequados. Nunca envie a chave pelo chat ou commit.
2. No arquivo **local** `.env.ai-lab`, configure:
   ```dotenv
   AI_OPENAI_BASE_URL=https://openrouter.ai/api/v1
   AI_API_KEY=SUA_CHAVE_SOMENTE_NO_COMPUTADOR
   AI_MODEL=openrouter/free
   AI_REPLY_ENABLED=false
   ```
3. O endpoint de teste da IA é `POST /api/ai/test`, protegido por `CRM_LAB_ADMIN_TOKEN` (segredo diferente do webhook). Ele responde sem transmitir WhatsApp.
4. Para o OpenRouter, a aplicação recusa modelos faturáveis: só permite `openrouter/free` ou IDs terminados em `:free`. O roteador gratuito pode variar o modelo selecionado; não garante consistência entre conversas.
5. Limites publicados em novembro de 2026: em geral 20 solicitações/minuto e 50/dia no gratuito, sujeitos a mudanças. Atingir o limite retorna erro; não há fallback silencioso para modelo pago.
6. Não confundir token e senha de login. Segredos só em arquivo local não versionado e nunca em frontend. Use dados fictícios no contexto da empresa até definir privacidade/LGPD.
7. Primeiro valide a IA sozinha, depois Redis/Evolution e finalmente o número de teste autorizado. Não ative `AI_REPLY_ENABLED=true` antes da homologação.

## Verificações
O CI faz build, testes unitários e testes de rotas negadas sem token. **Não testa a OpenRouter de verdade**, porque não possui chave (corretamente) nem depende de terceiros. Uma resposta real só é comprovada após o operador configurar a chave local e executar um teste autenticado.
