# NovaesWeb CRM AI — proposta de produto para aprovação

Data: 2026-11-04. Estado: ESTRUTURA COMPLETA APROVADA PELO RESPONSÁVEL. Implementação progressiva, sem simulações enganosas. Aprovação da estrutura não autoriza ativação do WhatsApp, campanhas nem envio automático.

## Princípios

- CRM próprio e independente do Painel Master da NovaesWeb.
- Cliente da empresa A nunca enxerga atendimento, IA, chave ou contato da empresa B.
- Toda ação na interface deve ter backend, validação de permissão e auditoria; sem botão fictício.
- Recebimento e envio são fluxos separados. Envio por WhatsApp deve parar quando uma pessoa assumir a conversa.
- O sistema não inventa preço, política, estoque, disponibilidade ou condição comercial.
- Provedores de IA são configuráveis via gateway, com lista de modelos autorizados e teto de consumo. Nunca mudar para modelo pago sem aprovação explícita.

## Páginas essenciais (MVP, recomenda-se aprovar)

1. **Atendimentos**: caixa de entrada real; filtros por aberto, aguardando, resolvido, IA, humano e não lido; pesquisa; histórico; resposta humana; notas internas; prioridade; responsável; passagem IA ↔ humano e registro do motivo. Distinguir envio recebido, pendente, enviado, falha.
2. **Contatos**: cadastro ou criação a partir do WhatsApp; nome, telefone, empresa, etiquetas, observações, vínculo a conversas, último contato e preferências de privacidade. Sem duplicatas por empresa.
3. **Agentes de IA**: instruções da marca, saudação, limites, horário, transferência, modelos elegíveis, status ativo/pausado e botão "Testar sem enviar ao WhatsApp". Guardar versões de instruções.
4. **Base de conhecimento**: perguntas e respostas aprovadas sobre produtos, planos, preços (se fornecidos), horários, endereço, políticas e atendimento. Conteúdo com estado rascunho/publicado, autor, data da revisão. IA responde apenas com material publicado da própria empresa.
5. **Conexões**: Evolution API, instância, estado, verificação de webhook/cabeçalho, reconexão assistida (não automática), data do último evento e diagnóstico.
6. **Equipe**: membros por empresa, perfis proprietário, gerente, atendente, visualização; convite e remoção com revogação de acesso. Não criar usuários fictícios.
7. **Relatórios**: mensagens reais, primeiro tempo de resposta, tempo para resolver, desempenho IA/humano, escalonamentos, falhas e custo estimado de tokens somente com dados contabilizados.
8. **Configurações**: identidade comercial, horário e fuso, canais, retenção, segurança, acesso e controles de uso.
9. **Preparação**: estado técnico e pendências reais para homologação, sem botões para pular controles de segurança.

## Após MVP (não implementar antes do núcleo)

- **Automações**: regras declarativas "evento → condições → ações" com auditoria e teste em modo simulado.
- **Campanhas**: apenas com consentimento, gestão de opt-out e conformidade com regras do WhatsApp; não usar para disparo em massa sem política.
- **Modelos de resposta**: atalhos operacionais por equipe, com versões e histórico de uso.
- **SLA e fila prioritária**: por horários e categorias, só após possuir estados e carimbos de hora confiáveis.
- **Integrações extras**: Instagram/email/site depois de estabilizar WhatsApp.
- **Painel de custos**: quota por empresa, limite de tokens, alertas e bloqueio de custos inesperados.

## Fluxo básico recomendado

Recebe evento autenticado → valida tenant/canal/contato → grava evento de forma idempotente no banco → atualiza conversa e atribuição → determina humano ou IA → consulta conhecimento aprovado → escolhe modelo autorizado → produz rascunho ou resposta → grava na outbox → entrega com idempotência e reconciliação → registra status da entrega → apresenta no painel.

Se cliente pedir pessoa ou regra escalar, **não** enviar resposta automática subsequente até operador assumir e devolver controle à IA.

## Estado existente × pendente

**Já no repositório:** inbox de leitura temporária em Redis, testes de IA no OmniRoute, fallback opcional de duas rotas adicionais, verificação de status da Evolution, página de preparação e schema de banco com RLS e integridade entre empresas.

**Ainda precisa implementar:** identidade por operador, serviço de escrita no Supabase, fila persistente e worker de entrega, passagem humana real, histórico durável, conhecimento por empresa, gestão de perfis, integração ponta a ponta homologada e política de tratamento de dados.

## Decisões aprovadas e sequência de execução

- Aprovada a estrutura completa, com todos os módulos no menu, desde que somente operações reais sejam liberadas.
- Campanhas e automações têm fundação de banco e telas de prontidão, mas execução fica bloqueada até controles de segurança, consentimento e homologação.
- Começar com uma empresa piloto sob controle do próprio operador.
- IA principal Groq; no OmniRoute adicionar duas reservas gratuitas permitidas e testar fallback antes de ativá-las. Restringir cobrança não autorizada.
- Visual: painel escuro com roxo NovaesWeb, versão celular com caixa de entrada primeiro, ações de enviar/assumir em área fixa. Evitar excesso de cartões no topo.

## Referências públicas de produto

- Intercom Inbox setup: https://www.intercom.com/help/en/articles/10223008-setting-up-the-inbox
- Intercom bot inbox e transferência: https://www.intercom.com/help/en/articles/3722087-turn-on-the-bot-inbox
- Chatwoot help center (WhatsApp, automações e IA): https://www.chatwoot.com/help-center
- Evolution API webhook custom headers: https://github.com/evolution-foundation/docs-evolution/pull/22

## Entrega incremental de 04/11/2026

- Supabase exclusivo: oito novas tabelas para conhecimento, etiquetas, vínculo de etiquetas, notas, campanhas, consentimento, automações e configurações, com RLS e leitura limitada a membros do tenant.
- Cada mecanismo de envio por campanha, automação ou IA continua bloqueado no esquema; nenhum disparo foi autorizado.
- Menu: Base de Conhecimento, Equipe, Campanhas e Automações passaram a aparecer, mas os botões de criar permanecem desativados até existirem autenticação individual e APIs de escrita seguras.
- Próximas integrações: autenticação multiusuário; API de dados multiempresa; backend de contatos e conversas; edição e publicação de conhecimento; equipe; encaminhamento humano; automações e campanhas com consentimento.
