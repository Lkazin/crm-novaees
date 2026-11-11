-- Migration: corrigir a contagem da franquia de mensagens da IA
--
-- PROBLEMA (verificado em 11/11/2026):
--   A IA respondeu 8 vezes em um dia e crm_attendance_usage continuou em used=1.
--
-- CAUSA:
--   1. crm_commit_ai_message fazia
--        UPDATE public.crm_attendance_usage SET used=used+1 WHERE ...;
--        IF NOT found THEN RAISE EXCEPTION 'message_usage_not_found';
--      O caminho normal de crm_reserve_ai_message faz
--        INSERT ... ON CONFLICT DO UPDATE SET used = greatest(...)
--      Quando o valor nao muda (greatest), o UPDATE nao toca em nenhuma linha e
--      FOUND fica false -> a funcao levantava excecao.
--   2. O cliente (src/lib/crm/attendance-quota.ts) tem fallback para
--      crm_commit_attendance, que por sua vez so incrementa quando
--      new_window = true. Em conversa ja aberta (new_window=false), nao incrementa.
--   Resultado: cada resposta da IA numa conversa ja aberta NAO era cobrada.
--
-- CORRECAO:
--   crm_commit_ai_message passa a incrementar de forma incondicional (UPDATE
--   direto), garante a linha com INSERT ... ON CONFLICT antes de incrementar, e
--   valida o periodo da reserva. Sem depender de FOUND.

create or replace function public.crm_commit_ai_message(p_tenant uuid, p_token uuid)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare r public.crm_ai_message_reservations%rowtype; n integer;
begin
  perform public.crm_locked_config(p_tenant);

  select * into r from public.crm_ai_message_reservations
  where tenant_id = p_tenant and token = p_token;
  if not found then raise exception 'reservation_not_found' using errcode='22023'; end if;

  -- Idempotente: commit de uma reserva ja commitada devolve o valor atual.
  if r.state = 'committed' then
    select used into n from public.crm_attendance_usage
    where tenant_id = p_tenant and period_key = r.period_key;
    return jsonb_build_object('committed', true, 'used', coalesce(n, 0),
      'period', r.period_key, 'newWindow', false);
  end if;

  if r.state <> 'dispatching' then
    raise exception 'reservation_not_dispatched' using errcode='42501';
  end if;

  -- Garante a linha do periodo antes de incrementar.
  insert into public.crm_attendance_usage(tenant_id, period_key, used)
  values (p_tenant, r.period_key, 0)
  on conflict (tenant_id, period_key) do nothing;

  -- Incremento incondicional: uma mensagem aceita = uma mensagem cobrada.
  update public.crm_attendance_usage
  set used = used + 1
  where tenant_id = p_tenant and period_key = r.period_key;

  update public.crm_ai_message_reservations
  set state = 'committed', updated_at = now()
  where tenant_id = p_tenant and token = p_token;

  select used into n from public.crm_attendance_usage
  where tenant_id = p_tenant and period_key = r.period_key;

  return jsonb_build_object('committed', true, 'used', n,
    'period', r.period_key, 'newWindow', false);
end $function$;

revoke all on function public.crm_commit_ai_message(uuid, uuid) from public, anon, authenticated;
grant execute on function public.crm_commit_ai_message(uuid, uuid) to service_role;
