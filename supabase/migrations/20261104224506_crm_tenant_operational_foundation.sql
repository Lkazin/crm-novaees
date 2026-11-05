-- NovaesWeb CRM AI — foundation for tenant-scoped operational records.
-- No production tenant or sample customer rows are inserted.
-- Authenticated users may read ONLY their own tenant data, never perform direct writes.
-- Writes must pass through a future authenticated, audited backend.
create extension if not exists pgcrypto;
create table if not exists public.crm_tenants (
 id uuid primary key default gen_random_uuid(),
 name text not null check (char_length(trim(name)) between 2 and 160),
 status text not null default 'inactive' check (status in ('inactive','active','suspended')),
 created_at timestamptz not null default now()
);
create table if not exists public.crm_tenant_memberships (
 tenant_id uuid not null references public.crm_tenants(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null default 'agent' check(role in ('owner','admin','agent','viewer')),
 created_at timestamptz not null default now(),
 primary key (tenant_id,user_id)
);
create index if not exists crm_memberships_user_idx on public.crm_tenant_memberships(user_id);
create table if not exists public.crm_channels (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.crm_tenants(id) on delete cascade,
 provider text not null default 'evolution' check(provider in ('evolution')),
 instance_name text not null check(char_length(trim(instance_name)) between 2 and 120),
 status text not null default 'disconnected' check(status in ('disconnected','connected','paused')),
 created_at timestamptz not null default now(),
 unique(tenant_id,instance_name),
 unique(id,tenant_id)
);
create table if not exists public.crm_contacts (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.crm_tenants(id) on delete cascade,
 phone text not null check (phone ~ '^[0-9]{10,15}$'),
 display_name text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(tenant_id,phone),
 unique(id,tenant_id)
);
create table if not exists public.crm_agents (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.crm_tenants(id) on delete cascade,
 label text not null check (char_length(trim(label)) between 2 and 100),
 instructions text not null default '',
 provider_route text not null default 'auto',
 enabled boolean not null default false,
 created_at timestamptz not null default now(),
 unique(id,tenant_id)
);
create table if not exists public.crm_conversations (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.crm_tenants(id) on delete cascade,
 contact_id uuid not null,
 channel_id uuid not null,
 assigned_to uuid references auth.users(id) on delete set null,
 mode text not null default 'human' check(mode in ('human','ai','paused')),
 status text not null default 'open' check(status in ('open','pending','resolved')),
 last_message_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(id,tenant_id),
 unique(tenant_id,contact_id,channel_id),
 foreign key(contact_id,tenant_id) references public.crm_contacts(id,tenant_id),
 foreign key(channel_id,tenant_id) references public.crm_channels(id,tenant_id)
);
create index if not exists crm_conversations_recent_idx on public.crm_conversations(tenant_id,last_message_at desc);
create table if not exists public.crm_messages (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.crm_tenants(id) on delete cascade,
 conversation_id uuid not null,
 external_id text,
 direction text not null check(direction in ('inbound','outbound')),
 sender_type text not null check(sender_type in ('customer','agent','human','system')),
 body text not null check (char_length(body) between 1 and 8000),
 delivery_status text not null default 'received' check(delivery_status in ('received','queued','sent','failed','unknown')),
 created_at timestamptz not null default now(),
 foreign key(conversation_id,tenant_id) references public.crm_conversations(id,tenant_id)
);
create unique index if not exists crm_inbound_idempotency_idx
 on public.crm_messages(tenant_id,conversation_id,external_id)
 where external_id is not null and direction='inbound';
create index if not exists crm_messages_conversation_idx on public.crm_messages(tenant_id,conversation_id,created_at desc);
create table if not exists public.crm_handoffs (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.crm_tenants(id) on delete cascade,
 conversation_id uuid not null,
 requested_by text not null check(requested_by in ('customer','agent','human','system')),
 status text not null default 'pending' check(status in ('pending','accepted','closed')),
 reason text,
 created_at timestamptz not null default now(),
 foreign key(conversation_id,tenant_id) references public.crm_conversations(id,tenant_id)
);
create table if not exists public.crm_outbox (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.crm_tenants(id) on delete cascade,
 message_id uuid not null unique references public.crm_messages(id) on delete cascade,
 status text not null default 'queued' check(status in ('queued','processing','sent','failed','unknown')),
 attempt_count integer not null default 0 check(attempt_count between 0 and 20),
 next_attempt_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists crm_outbox_pending_idx on public.crm_outbox(status,next_attempt_at);
create table if not exists public.crm_audit_events (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.crm_tenants(id) on delete cascade,
 actor_id uuid references auth.users(id) on delete set null,
 action text not null,
 entity_type text not null,
 entity_id uuid,
 created_at timestamptz not null default now()
);
-- RLS enabled on every exposed table.
alter table public.crm_tenants enable row level security;
alter table public.crm_tenant_memberships enable row level security;
alter table public.crm_channels enable row level security;
alter table public.crm_contacts enable row level security;
alter table public.crm_agents enable row level security;
alter table public.crm_conversations enable row level security;
alter table public.crm_messages enable row level security;
alter table public.crm_handoffs enable row level security;
alter table public.crm_outbox enable row level security;
alter table public.crm_audit_events enable row level security;
-- No client-side write permissions to business data until backend authorization exists.
revoke all on public.crm_tenants, public.crm_tenant_memberships,public.crm_channels,
 public.crm_contacts,public.crm_agents,public.crm_conversations,public.crm_messages,
 public.crm_handoffs,public.crm_outbox,public.crm_audit_events from anon,authenticated;
grant select on public.crm_tenants, public.crm_tenant_memberships,public.crm_channels,
 public.crm_contacts,public.crm_agents,public.crm_conversations,public.crm_messages,
 public.crm_handoffs to authenticated;
-- Avoid recursive membership policies; memberships can be read only for own row.
create policy crm_memberships_read_own on public.crm_tenant_memberships
 for select to authenticated using (user_id=(select auth.uid()));
-- Tenant policies only select the viewer's directly readable memberships.
create policy crm_tenants_read_member on public.crm_tenants
 for select to authenticated using (
 exists(select 1 from public.crm_tenant_memberships m where m.tenant_id=id and m.user_id=(select auth.uid()))
 );
create policy crm_channels_read_member on public.crm_channels
 for select to authenticated using (
 exists(select 1 from public.crm_tenant_memberships m where m.tenant_id=crm_channels.tenant_id and m.user_id=(select auth.uid()))
 );
create policy crm_contacts_read_member on public.crm_contacts
 for select to authenticated using (
 exists(select 1 from public.crm_tenant_memberships m where m.tenant_id=crm_contacts.tenant_id and m.user_id=(select auth.uid()))
 );
create policy crm_agents_read_member on public.crm_agents
 for select to authenticated using (
 exists(select 1 from public.crm_tenant_memberships m where m.tenant_id=crm_agents.tenant_id and m.user_id=(select auth.uid()))
 );
create policy crm_conversations_read_member on public.crm_conversations
 for select to authenticated using (
 exists(select 1 from public.crm_tenant_memberships m where m.tenant_id=crm_conversations.tenant_id and m.user_id=(select auth.uid()))
 );
create policy crm_messages_read_member on public.crm_messages
 for select to authenticated using (
 exists(select 1 from public.crm_tenant_memberships m where m.tenant_id=crm_messages.tenant_id and m.user_id=(select auth.uid()))
 );
create policy crm_handoffs_read_member on public.crm_handoffs
 for select to authenticated using (
 exists(select 1 from public.crm_tenant_memberships m where m.tenant_id=crm_handoffs.tenant_id and m.user_id=(select auth.uid()))
 );
-- Outbox and audit stay service-only.
