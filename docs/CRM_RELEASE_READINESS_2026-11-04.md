# NovaesWeb CRM AI — rota de atendimento e provedores

## Situação verificada em 04/11/2026

- `novaesweb-ia-teste` foi escolhida para a integração; o webhook real ainda não foi conectado nem homologado.
- A resposta via CRM → OmniRoute → Groq passou em teste local relatado pelo operador.
- `AI_REPLY_ENABLED=false` permanece obrigatório até homologação ponta a ponta.
- A configuração `AI_MODEL=auto` depende do comportamento da versão instalada do OmniRoute e das regras de roteamento no painel dele.
- Nenhum fallback adicional está conectado ou validado neste commit.

## Fallback opcional por modelo

`AI_FALLBACK_MODELS` aceita até duas rotas extras separadas por vírgulas, **somente** se o operador aprovar esses IDs de modelo/rota no OmniRoute. O CRM tenta o próximo apenas em HTTP 429/502/503/504, timeout ou erro de rede, com prazo total máximo de 25 segundos. Falhas de autenticação (401), bad request (400) e respostas vazias não acionam o próximo automaticamente. Não são repetidos envios de WhatsApp por causa do fallback: a alternância ocorre antes da etapa de envio.

Exemplo ilustrativo (IDs NÃO VERIFICADOS, não copiar para produção):
```dotenv
AI_MODEL=rota-principal-autorizada
AI_FALLBACK_MODELS=rota-reserva-1,rota-reserva-2
AI_REPLY_ENABLED=false
```
Primeiro descobrir os IDs reais permitidos pelo próprio OmniRoute. Configurar limite de orçamento, rota gratuita, quota por provedor, proteção de dados e políticas de retenção. `auto` pode escolher modelos de múltiplos provedores; não presumir que todos sejam gratuitos.

## Banco Supabase

Projeto isolado: `mpteambmrlflllfqtkmq` (nome `novaesweb-crm-ai`). Migration `20261104224506_crm_tenant_operational_foundation.sql` foi aplicada e 10 tabelas com RLS foram confirmadas via consulta. As tabelas estão vazias, sem cliente, empresa ou membro criado automaticamente. Banco operacional ainda NÃO está ligado à caixa de entrada temporária Redis. O uso de um token único do laboratório não substitui autenticação de usuários para vender a outras empresas.

## Painel e módulos

- Dashboard: contagem real da caixa de entrada, sem métricas inventadas.
- Atendimentos: leitura autenticada das mensagens recebidas e armazenadas quando captura estiver ligada.
- Contatos: lista dos telefones da caixa de entrada, sem cadastro persistente ainda.
- Agentes de IA: consulta segura da rota atual e das alternativas configuradas; não altera credenciais.
- Conexões WhatsApp: consulta do estado da instância configurada usando chave do backend; outras instâncias não são modificadas.
- Relatórios: total registrado e mensagens de hoje, com limitações explícitas.
- Configurações: indicadores somente leitura das chaves de segurança; não exibe segredos.

## Amanhã (dependências do computador)

1. `git pull origin feat/whatsapp-ai-lab`.
2. Confirmar a instância `novaesweb-ia-teste` e diagnóstico do webhook existente, sem sobrescrever outros atendimentos.
3. Revisar LGPD, aviso de privacidade e política de retenção antes de habilitar captura de mensagens.
4. Atualizar apenas o projeto `novaesweb-crm-ai-lab` no Docker; validar build, Redis, OmniRoute e Evolution localmente.
5. Abrir `http://localhost:3040`, fazer login no protótipo privado pelo `CRM_LAB_ADMIN_TOKEN` e testar cada módulo.
6. Conectar novas rotas gratuitas permitidas no OmniRoute e confirmar fallback com falha simulada e real controlada.
7. Conectar autenticação de usuários por empresa ao Supabase antes de liberar acesso externo.
8. Implementar envio humano confiável, transferência e outbox worker antes de ativar qualquer resposta automática para clientes reais.

Não registrar valores de chaves, tokens ou telefones reais em commits, logs ou conversas.
