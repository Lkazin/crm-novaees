-- Complete CRM modules, safe foundations; no campaign sends or automation executors.
create table public.crm_knowledge_articles (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.crm_tenants(id) on delete cascade,
 title text not null check (char_length(btrim(title)) between 3 and 200),
 body text not null check (char_length(body) between 1 and 20000),
 status text not null default 'draft' check (status in ('draft','published','archived')),
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(id, tenant_id)
);
create table public.crm_tags (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.crm_tenants(id) on delete cascade,
 name text not null check (char_length(btrim(name)) between 2 and 60),
 color text not null default 'neutral' check (color in ('neutral','purple','blue','green','amber','red')),
 unique(tenant_id, name),
 unique(id,tenant_id)
);
create table public.crm_contact_tags (
 tenant_id uuid not null references public.crm_tenants(id) on delete cascade,
 contact_id uuid not null,
 tag_id uuid not null,
 primary key (tenant_id,contact_id,tag_id),
 foreign key (contact_id,tenant_id) references public.crm_contacts(id,tenant_id) on delete cascade,
 foreign key (tag_id,tenant_id) references public.crm_tags(id,tenant_id) on delete cascade
);
create table public.crm_internal_notes (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.crm_tenants(id) on delete cascade,
 conversation_id uuid not null,
 author_id uuid references auth.users(id) on delete set null,
 body text not null check (char_length(body) between 1 and 4000),
 created_at timestamptz not null default now(),
 foreign key (conversation_id,tenant_id) references public.crm_conversations(id,tenant_id) on delete cascade
);
create table public.crm_campaigns (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.crm_tenants(id) on delete cascade,
 name text not null check (char_length(btrim(name)) between 2 and 140),
 status text not null default 'draft' check (status in ('draft','paused','archived')),
 content text not null default '',
 requires_opt_in boolean not null default true check (requires_opt_in = true),
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.crm_contact_consents (
 tenant_id uuid not null references public.crm_tenants(id) on delete cascade,
 contact_id uuid not null,
 channel text not null default 'whatsapp' check(channel in ('whatsapp')),
 status text not null default 'unknown' check(status in ('unknown','granted','revoked')),
 collected_at timestamptz,
 revoked_at timestamptz,
 evidence text,
 updated_at timestamptz not null default now(),
 primary key(tenant_id,contact_id,channel),
 foreign key(contact_id,tenant_id) references public.crm_contacts(id,tenant_id) on delete cascade,
 check ((status <> 'granted') or (collected_at is not null and evidence is not null))
);
create table public.crm_automations (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.crm_tenants(id) on delete cascade,
 name text not null check (char_length(btrim(name)) between 2 and 140),
 status text not null default 'draft' check (status in ('draft','paused','archived')),
 event_type text not null check(event_type in ('message_received','conversation_opened','conversation_resolved','handoff_requested')),
 rule jsonb not null default '{}'::jsonb check (jsonb_typeof(rule)='object'),
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.crm_tenant_settings (
 tenant_id uuid primary key references public.crm_tenants(id) on delete cascade,
 timezone text not null default 'America/Sao_Paulo',
 business_description text not null default '',
 human_handoff_enabled boolean not null default true,
 ai_sending_enabled boolean not null default false check(ai_sending_enabled = false),
 campaigns_enabled boolean not null default false check(campaigns_enabled = false),
 automation_execution_enabled boolean not null default false check(automation_execution_enabled = false),
 retention_days integer not null default 7 check(retention_days between 1 and 365),
 updated_at timestamptz not null default now()
);
create index crm_knowledge_tenant_status_idx on public.crm_knowledge_articles(tenant_id,status);
create index crm_tags_tenant_idx on public.crm_tags(tenant_id);
create index crm_contact_tags_tag_idx on public.crm_contact_tags(tag_id,tenant_id);
create index crm_notes_conversation_idx on public.crm_internal_notes(conversation_id,tenant_id,created_at desc);
create index crm_notes_author_idx on public.crm_internal_notes(author_id);
create index crm_campaigns_tenant_idx on public.crm_campaigns(tenant_id,status);
create index crm_campaigns_author_idx on public.crm_campaigns(created_by);
create index crm_automations_tenant_idx on public.crm_automations(tenant_id,status);
create index crm_automations_author_idx on public.crm_automations(created_by);
create index crm_knowledge_author_idx on public.crm_knowledge_articles(created_by);
-- Explicitly lock every new public table and grant only tenant-scoped reads.
alter table public.crm_knowledge_articles enable row level security;
alter table public.crm_tags enable row level security;
alter table public.crm_contact_tags enable row level security;
alter table public.crm_internal_notes enable row level security;
alter table public.crm_campaigns enable row level security;
alter table public.crm_contact_consents enable row level security;
alter table public.crm_automations enable row level security;
alter table public.crm_tenant_settings enable row level security;
revoke all on public.crm_knowledge_articles,public.crm_tags,public.crm_contact_tags,
 public.crm_internal_notes,public.crm_campaigns,public.crm_contact_consents,
 public.crm_automations,public.crm_tenant_settings from anon,authenticated;
grant select on public.crm_knowledge_articles,public.crm_tags,public.crm_contact_tags,
 public.crm_internal_notes,public.crm_campaigns,public.crm_contact_consents,
 public.crm_automations,public.crm_tenant_settings to authenticated;
create policy crm_knowledge_read on public.crm_knowledge_articles for select to authenticated
 using (exists(select 1 from public.crm_tenant_memberships m where m.tenant_id=crm_knowledge_articles.tenant_id and m.user_id=(select auth.uid())));
create policy crm_tags_read on public.crm_tags for select to authenticated
 using (exists(select 1 from public.crm_tenant_memberships m where m.tenant_id=crm_tags.tenant_id and m.user_id=(select auth.uid())));
create policy crm_contact_tags_read on public.crm_contact_tags for select to authenticated
 using (exists(select 1 from public.crm_tenant_memberships m where m.tenant_id=crm_contact_tags.tenant_id and m.user_id=(select auth.uid())));
create policy crm_internal_notes_read on public.crm_internal_notes for select to authenticated
 using (exists(select 1 from public.crm_tenant_memberships m where m.tenant_id=crm_internal_notes.tenant_id and m.user_id=(select auth.uid())));
create policy crm_campaigns_read on public.crm_campaigns for select to authenticated
 using (exists(select 1 from public.crm_tenant_memberships m where m.tenant_id=crm_campaigns.tenant_id and m.user_id=(select auth.uid())));
create policy crm_consents_read on public.crm_contact_consents for select to authenticated
 using (exists(select 1 from public.crm_tenant_memberships m where m.tenant_id=crm_contact_consents.tenant_id and m.user_id=(select auth.uid())));
create policy crm_automations_read on public.crm_automations for select to authenticated
 using (exists(select 1 from public.crm_tenant_memberships m where m.tenant_id=crm_automations.tenant_id and m.user_id=(select auth.uid())));
create policy crm_settings_read on public.crm_tenant_settings for select to authenticated
 using (exists(select 1 from public.crm_tenant_memberships m where m.tenant_id=crm_tenant_settings.tenant_id and m.user_id=(select auth.uid())));
