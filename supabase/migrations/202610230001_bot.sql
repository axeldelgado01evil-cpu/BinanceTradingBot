-- Private application state and encrypted credentials. No client access.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;
create table if not exists public.bot_control (
  id boolean primary key default true check(id),
  state jsonb not null default '{"version":1,"cash":100,"positions":{},"trades":[],"last_candle":{},"status":"active"}',
  imported boolean not null default false,
  lease uuid,
  lease_until timestamptz,
  sent_slot bigint not null default -1,
  pending_slot bigint,
  pending_report text
);
alter table public.bot_control enable row level security;
revoke all on public.bot_control from anon, authenticated;
insert into public.bot_control(id) values(true) on conflict do nothing;

create or replace function public.bot_import_once(p_config jsonb, p_state jsonb, p_cron_jwt text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare already boolean;
begin
  select imported into already from public.bot_control where id=true for update;
  if already then return false; end if;
  if (select count(*) from jsonb_object_keys(p_config)) <> 4 or
     not (p_config ?& array['TELEGRAM_BOT_TOKEN','TELEGRAM_CHAT_ID','BINANCE_API_KEY','BINANCE_API_SECRET']) then
    raise exception 'Invalid configuration';
  end if;
  if p_state->>'version' <> '1' then raise exception 'Invalid paper state'; end if;
  perform vault.create_secret(p_config::text, 'market_bot_config');
  perform vault.create_secret(p_cron_jwt, 'market_bot_cron_jwt');
  update public.bot_control set imported=true, state=p_state where id=true;
  return true;
end $$;

create or replace function public.bot_claim(p_slot bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.bot_control%rowtype; config jsonb; claim_id uuid;
begin
  select * into r from public.bot_control where id=true for update;
  if not r.imported or r.lease_until > now() or p_slot <= r.sent_slot then return null; end if;
  select decrypted_secret::jsonb into config from vault.decrypted_secrets where name='market_bot_config';
  claim_id := gen_random_uuid();
  update public.bot_control set lease=claim_id, lease_until=now()+interval '180 seconds' where id=true;
  return jsonb_build_object('lease',claim_id,'slot',coalesce(r.pending_slot,p_slot),
    'state',r.state,'config',config,'report',r.pending_report);
end $$;

create or replace function public.bot_stage(p_lease uuid, p_slot bigint, p_state jsonb, p_report text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.bot_control set state=p_state,pending_slot=p_slot,pending_report=p_report
  where id=true and lease=p_lease and lease_until > now();
  return found;
end $$;

create or replace function public.bot_ack(p_lease uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.bot_control set sent_slot=pending_slot,pending_slot=null,pending_report=null,
    lease=null,lease_until=null where id=true and lease=p_lease;
  return found;
end $$;

revoke all on function public.bot_import_once(jsonb,jsonb,text) from public,anon,authenticated;
revoke all on function public.bot_claim(bigint) from public,anon,authenticated;
revoke all on function public.bot_stage(uuid,bigint,jsonb,text) from public,anon,authenticated;
revoke all on function public.bot_ack(uuid) from public,anon,authenticated;
grant execute on function public.bot_import_once(jsonb,jsonb,text) to service_role;
grant execute on function public.bot_claim(bigint) to service_role;
grant execute on function public.bot_stage(uuid,bigint,jsonb,text) to service_role;
grant execute on function public.bot_ack(uuid) to service_role;
