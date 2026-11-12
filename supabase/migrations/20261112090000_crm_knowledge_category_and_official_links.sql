-- =============================================================================
-- Fase 1: base de conhecimento separada por categoria + links oficiais
-- =============================================================================
-- Diagnostico: o artigo publicado tem 4.400 chars e traz, no MESMO documento,
-- os planos de SITE/CARDAPIO e os planos do CRM IA — em duas versoes que se
-- contradizem (a primeira manda "nao invente valores", a segunda afirma
-- "Essencial R$ 69/mes"). A IA recebia os dois blocos juntos e misturava.
--
-- Aqui:
--   1. crm_knowledge_articles ganha category, para o prompt poder filtrar.
--   2. crm_tenant_settings ganha official_links (jsonb): a UNICA fonte de URL
--      que a IA pode citar. Vazio = a IA nao cita nenhum link.
--   3. Guarda o artigo atual numa tabela de historico antes de qualquer mudanca.
-- =============================================================================

-- ---- 1. categoria do artigo ----
alter table if exists public.crm_knowledge_articles
  add column if not exists category text not null default 'geral';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'crm_knowledge_articles_category_check'
  ) then
    alter table public.crm_knowledge_articles
      add constraint crm_knowledge_articles_category_check
      check (category in ('sites', 'crm', 'geral'));
  end if;
end $$;

create index if not exists crm_knowledge_articles_category_idx
  on public.crm_knowledge_articles (tenant_id, category, status);

-- ---- 2. links oficiais por empresa ----
alter table if exists public.crm_tenant_settings
  add column if not exists official_links jsonb not null default '{}'::jsonb;

comment on column public.crm_tenant_settings.official_links is
  'Links oficiais autorizados para a IA citar. Ex.: {"contratacao":"https://...","suporte":"https://..."}. Vazio = a IA nao cita URL nenhuma.';

-- ---- 3. historico do artigo antes da separacao ----
create table if not exists public.crm_knowledge_articles_history (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null,
  tenant_id uuid not null,
  title text not null,
  body text not null,
  category text,
  archived_reason text,
  archived_at timestamptz not null default now()
);

alter table public.crm_knowledge_articles_history enable row level security;

drop policy if exists crm_knowledge_articles_history_service on public.crm_knowledge_articles_history;
create policy crm_knowledge_articles_history_service on public.crm_knowledge_articles_history
  for all to service_role using (true) with check (true);

-- ---- 4. verificacao ----
do $$
declare
  sem_categoria int;
begin
  select count(*) into sem_categoria
  from public.crm_knowledge_articles
  where category is null;
  if sem_categoria > 0 then
    raise warning 'Artigos sem categoria: %', sem_categoria;
  end if;
end $$;
