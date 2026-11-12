-- =============================================================================
-- Fase 1.2: separa o artigo em dois, sem perder o original
-- =============================================================================
-- O artigo 3301c893 trazia site + CRM juntos. Aqui:
--   - o original vai inteiro para crm_knowledge_articles_history
--   - ele mesmo passa a ser o artigo de SITES (category='sites')
--   - um novo artigo recebe a parte de CRM IA (category='crm')
-- O texto e preservado; o que sai e a duplicacao e a contradicao entre os dois
-- blocos ("nao invente valores" convivendo com "Essencial R$ 69/mes").
-- =============================================================================

do $$
declare
  v_tenant uuid;
  v_article uuid := '3301c893-e0f5-4613-8cec-a3bd8cdf7a5d';
  v_body text;
begin
  select tenant_id, body into v_tenant, v_body
  from public.crm_knowledge_articles where id = v_article;

  if v_tenant is null then
    raise notice 'artigo % nao encontrado, nada a separar', v_article;
    return;
  end if;

  -- 1. guarda o original antes de mexer
  insert into public.crm_knowledge_articles_history
    (article_id, tenant_id, title, body, category, archived_reason)
  select id, tenant_id, title, body, category, 'separacao_sites_crm'
  from public.crm_knowledge_articles where id = v_article;

  -- 2. o artigo original passa a ser SITES
  update public.crm_knowledge_articles
  set category = 'sites',
      title = 'NovaesWeb — Planos de Site e Cardápio Virtual',
      body = $sites$**EMPRESA: NOVAESWEB**

A NovaesWeb oferece criação de sites profissionais e cardápios virtuais para ajudar empresas a vender e atender clientes.

**PLANOS NOVAESWEB — SITE E CARDÁPIO VIRTUAL**

**1. ESSENCIAL — R$ 69/mês**
- Site e cardápio virtual.
- Hospedagem inclusa.
- Integração com WhatsApp.
- Formulário de contato.
- Layout responsivo para celular e computador.
- Manutenção básica.
- Treinamento inicial.
- Orientação para aquisição de domínio.

**2. AVANÇADO — R$ 99/mês**
Inclui os benefícios do Essencial, mais:
- Cardápio interativo.
- Atualizações ilimitadas.
- Integração com redes sociais.
- Mais opções de personalização.

**3. PREMIUM — R$ 159/mês**
Inclui os benefícios dos planos anteriores, mais:
- Painel administrativo.
- Recebimento de pedidos online.
- Integração de pagamentos via Pix.
- Relatórios de pedidos.
- Suporte VIP.
- Funcionalidades avançadas de gerenciamento.

**4. AVANÇADO PERSONALIZADO — SOB CONSULTA**
- Projetos personalizados conforme a necessidade do estabelecimento.
- Recursos, valores e condições definidos mediante orçamento.

**PÚBLICO-ALVO**

Restaurantes, pizzarias, hamburguerias, açaíterias, lojas de roupas, barbearias, salões de beleza, pet shops e outros comércios.

**LIMITES DESTE DOCUMENTO**

Este documento trata apenas de SITE e CARDÁPIO VIRTUAL. Planos do CRM IA têm documento próprio e não devem ser misturados com estes valores.
$sites$,
      updated_at = now()
  where id = v_article;

  -- 3. novo artigo com a parte de CRM IA
  if not exists (
    select 1 from public.crm_knowledge_articles
    where tenant_id = v_tenant and category = 'crm' and status = 'published'
  ) then
    insert into public.crm_knowledge_articles (tenant_id, title, body, status, category)
    values (v_tenant, 'NovaesWeb CRM IA — Planos e Franquia', $crm$**NOVAESWEB CRM IA — PLANOS E FRANQUIA**

O NovaesWeb CRM IA automatiza o atendimento pelo WhatsApp com inteligência artificial, painel de atendimentos e controle de franquia por empresa.

**1. GRÁTIS — TESTE DE 7 DIAS**
- Experimentação gratuita da plataforma.
- Recursos e limites conforme as condições oficiais do teste.

**2. PREMIUM — R$ 89,90/mês**
- 1.200 mensagens mensais.
- Até 3 WhatsApps conectados.
- Até 2 operadores.
- Todas as funcionalidades do plano.
- Recarga de 100 mensagens por R$ 20.
- Possibilidade de contratar múltiplas recargas.

**COMO A FRANQUIA É CONTADA**

- Cada resposta da IA enviada com sucesso consome 1 mensagem.
- Mensagens escritas por atendente humano não consomem franquia.
- Transferência para atendimento humano não consome franquia.
- Quando a franquia acaba, a IA para de responder até renovar o ciclo ou contratar recarga.

**LIMITES DESTE DOCUMENTO**

Este documento trata apenas do CRM IA. Planos de site e cardápio virtual têm documento próprio e não devem ser misturados com estes valores.

Nunca informe preço, franquia ou funcionalidade que não esteja escrito acima.
$crm$, 'published', 'crm');
  end if;

  raise notice 'artigo separado: sites=% crm=ok', v_article;
end $$;
