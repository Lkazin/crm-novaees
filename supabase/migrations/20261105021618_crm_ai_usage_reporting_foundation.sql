-- Metering is a separate secure foundation. No model calls or customer data inserted here.
create table public.crm_ai_usage_events (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.crm_tenants(id) on delete cascade,
 conversation_id uuid,
 provider text not null check(char_length(btrim(provider)) between 1 and 80),
 model text not null check(char_length(btrim(model)) between 1 and 150),
 status text not null check(status in ('success','rate_limited','error','timeout','fallback')),
 prompt_tokens integer check(prompt_tokens between 0 and 10000000),
 completion_tokens integer check(completion_tokens between 0 and 10000000),
 estimated_cost_usd numeric(14,7) check(estimated_cost_usd>=0),
 request_key text,
 occurred_at timestamptz not null default now(),
 foreign key(conversation_id,tenant_id) references public.crm_conversations(id,tenant_id)
);
create unique index crm_usage_dedup_idx on public.crm_ai_usage_events(tenant_id,request_key) where request_key is not null;
create index crm_usage_by_tenant_time_idx on public.crm_ai_usage_events(tenant_id,occurred_at desc);
create index crm_usage_by_conversation_idx on public.crm_ai_usage_events(conversation_id,tenant_id);
create table public.crm_usage_limits (
 tenant_id uuid primary key references public.crm_tenants(id) on delete cascade,
 monthly_model_requests integer check(monthly_model_requests between 1 and 100000000),
 monthly_token_limit bigint check(monthly_token_limit between 1 and 100000000000),
 monthly_budget_usd numeric(12,2) check(monthly_budget_usd>=0),
 hard_stop_on_limit boolean not null default true,
 updated_at timestamptz not null default now()
);
alter table public.crm_ai_usage_events enable row level security;
alter table public.crm_usage_limits enable row level security;
revoke all on public.crm_ai_usage_events,public.crm_usage_limits from anon,authenticated;
grant select on public.crm_ai_usage_events,public.crm_usage_limits to authenticated;
create policy crm_usage_member_read on public.crm_ai_usage_events for select to authenticated
 using(exists(select 1 from public.crm_tenant_memberships m where m.tenant_id=crm_ai_usage_events.tenant_id and m.user_id=(select auth.uid())));
create policy crm_limits_member_read on public.crm_usage_limits for select to authenticated
 using(exists(select 1 from public.crm_tenant_memberships m where m.tenant_id=crm_usage_limits.tenant_id and m.user_id=(select auth.uid())));
-- Budget enforcement must remain OFF until a metering pipeline and durable counters are live.
