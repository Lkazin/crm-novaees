# CRM AI: caixa de entrada real (primeira entrega)

## O que entrou nesta branch

- O painel inicial deixou de apresentar contatos e estatisticas inventados.
- A tela solicita CRM_LAB_ADMIN_TOKEN e mostra somente conversas registradas no Redis.
- A API GET /api/crm/inbox recusa acessos sem o token administrativo e nao usa cache.
- O webhook autentica o segredo existente e, se CRM_INBOX_CAPTURE_ENABLED=true, guarda eventos de texto individual da instancia EVOLUTION_INSTANCE.
- As mensagens sao armazenadas no Redis isolado por ate 7 dias; cada conversa mostra no maximo 100 mensagens recentes e a tela lista ate 50 contatos.
- O recurso nao manda respostas, nao configura a Evolution e nao concede acesso publico ao WhatsApp.

## Pendente antes de ativar captura de dados de clientes

1. Confirmar que `novaesweb-ia-teste` e a instancia correta e que pode ser destinada ao CRM.
2. Checar o webhook atual dessa instancia e se a Evolution consegue enviar o cabecalho `x-crm-webhook-secret`. **Nao sobrescrever** um webhook que ja atende outro sistema.
3. Definir aviso de privacidade, base legal, politica de retencao e quem acessa o CRM; armazenar em Redis com controle de acesso e backup apropriado.
4. Ativar somente `CRM_INBOX_CAPTURE_ENABLED=true` no arquivo .env.ai-lab do proprio computador, apos as verificacoes.
5. Atualizar **somente** os containers do projeto `novaesweb-crm-ai-lab`, nunca reiniciar as outras instancias.
6. Verificar se o novo endpoint aparece na interface e recebe evento real autorizado.
7. Deixar `AI_REPLY_ENABLED=false` ate concluir fila de envio, idempotencia ponta-a-ponta, transferencia humana e auditoria.

## Limitacoes importantes

Esta entrega e uma **caixa de entrada privada somente de leitura**, nao CRM pronto para producao. O painel ainda nao envia mensagens humanas, nao transfere atendimento de forma real, nao tem login multiusuario, nem persistencia permanente no Supabase. O `CRM_LAB_ADMIN_TOKEN` e apropriado apenas para um laboratorio local e nao substitui autenticacao por usuario com politicas de acesso. A IA continua respondendo somente na rota de teste; o envio automatico permanece desligado.

## Arquivos locais

`.env.ai-lab` contem chaves e **nunca** deve ser enviado ao GitHub ou no chat. A copia de exemplo no repositorio inicia com `CRM_INBOX_CAPTURE_ENABLED=false` e `AI_REPLY_ENABLED=false`. Um arquivo `.env.ai-lab` ja existente no computador nao e modificado automaticamente por `git pull`.
