-- RPC crm_create_contact
--
-- Contexto: src/app/api/crm/operator/contacts/route.ts chama
-- POST /rest/v1/rpc/crm_create_contact com { p_tenant, p_phone, p_name }.
-- Nenhuma migration anterior definia esta funcao, portanto o codigo respondia
-- sempre 503 insert_failed (PGRST202). Esta migration cria a funcao faltante.
--
-- Contrato esperado pela rota:
--   - sucesso                -> corpo JSON = id (uuid) do contato, HTTP 200
--   - telefone/empresa ruim  -> errcode 22023
--   - empresa inativa        -> errcode 42501  (a rota devolve 503)
--   - contato ja existente   -> REST devolve 409 (err aridade/constraint)

create or replace function public.crm_create_contact(p_tenant uuid,p_phone text,p_name text default null)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_phone text; v_name text; v_id uuid; v_cfg jsonb;
begin
  -- Normaliza: apenas digitos.
  v_phone := regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');

  if p_tenant is null then
    raise exception 'invalid_tenant' using errcode='22023';
  end if;
  if v_phone !~ '^[0-9]{10,15}$' then
    raise exception 'invalid_phone' using errcode='22023';
  end if;

  -- Empresa precisa existir e estar ativa.
  if not exists(select 1 from public.crm_tenants where id=p_tenant and status='active') then
    raise exception 'tenant_inactive' using errcode='42501';
  end if;

  -- Empresa suspensa administrativamente nao recebe contato novo.
  v_cfg := public.crm_locked_config(p_tenant);
  if coalesce((v_cfg->'suspension'->>'isSuspended')::boolean,false) then
    raise exception 'tenant_suspended' using errcode='42501';
  end if;

  v_name := nullif(btrim(left(coalesce(p_name,''),160)),'');

  -- Contato ja existente: devolve o id atual preservando o nome gravado.
  select id into v_id from public.crm_contacts where tenant_id=p_tenant and phone=v_phone;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.crm_contacts(tenant_id,phone,display_name)
  values(p_tenant,v_phone,coalesce(v_name,v_phone))
  on conflict(tenant_id,phone) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.crm_contacts where tenant_id=p_tenant and phone=v_phone;
  end if;

  return v_id;
end $$;

-- Mesmo modelo de exposicao das demais RPCs do CRM: apenas service_role.
revoke all on function public.crm_create_contact(uuid,text,text) from public;
grant execute on function public.crm_create_contact(uuid,text,text) to service_role;
