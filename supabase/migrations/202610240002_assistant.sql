-- Private Telegram polling, public market snapshot, and bounded free-tier AI use.
create table if not exists public.bot_assistant (
  id boolean primary key default true check(id),
  enabled_since timestamptz not null default now(),
  telegram_offset bigint not null default 0,
  lease uuid,
  lease_until timestamptz,
  snapshot jsonb,
  account_text text,
  usage_day date not null default (now() at time zone 'UTC')::date,
  summary_calls integer not null default 0,
  chat_calls integer not null default 0
);
alter table public.bot_assistant enable row level security;
revoke all on public.bot_assistant from public,anon,authenticated;
insert into public.bot_assistant(id) values(true) on conflict do nothing;

create or replace function public.bot_ai(p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.bot_assistant%rowtype; cfg jsonb; claim_id uuid;
begin
  select * into r from public.bot_assistant where id=true for update;
  if p_action='publish' then
    if jsonb_typeof(p_data->'snapshot') is distinct from 'object' or length((p_data->'snapshot')::text)>4000
      or length(p_data->>'account_text')>2000 then raise exception 'Invalid snapshot'; end if;
    update public.bot_assistant set snapshot=p_data->'snapshot',account_text=p_data->>'account_text' where id=true;
    return 'true'::jsonb;
  elsif p_action='reserve' then
    if r.usage_day<>(now() at time zone 'UTC')::date then
      update public.bot_assistant set usage_day=(now() at time zone 'UTC')::date,summary_calls=0,chat_calls=0 where id=true;
      r.summary_calls:=0;r.chat_calls:=0;
    end if;
    if p_data->>'kind'='summary' and r.summary_calls<96 then
      update public.bot_assistant set summary_calls=summary_calls+1 where id=true;
    elsif p_data->>'kind'='chat' and r.chat_calls<24 then
      update public.bot_assistant set chat_calls=chat_calls+1 where id=true;
    else return 'false'::jsonb;
    end if;
    return 'true'::jsonb;
  elsif p_action='claim' then
    if r.lease_until>now() then return null; end if;
    select decrypted_secret::jsonb into cfg from vault.decrypted_secrets where name='market_bot_config';
    if cfg is null then return null; end if;
    claim_id:=gen_random_uuid();
    update public.bot_assistant set lease=claim_id,lease_until=now()+interval '90 seconds' where id=true;
    return jsonb_build_object('lease',claim_id,'offset',r.telegram_offset,'enabled_since',r.enabled_since,
      'snapshot',r.snapshot,'account_text',r.account_text,
      'config',jsonb_build_object('TELEGRAM_BOT_TOKEN',cfg->>'TELEGRAM_BOT_TOKEN','TELEGRAM_CHAT_ID',cfg->>'TELEGRAM_CHAT_ID'));
  elsif p_action='finish' then
    update public.bot_assistant set telegram_offset=greatest(telegram_offset,(p_data->>'offset')::bigint),lease=null,lease_until=null
      where id=true and lease=(p_data->>'lease')::uuid;
    return to_jsonb(found);
  elsif p_action='status' then
    return jsonb_build_object('snapshot_at',r.snapshot->>'at','summary_calls',r.summary_calls,'chat_calls',r.chat_calls);
  end if;
  raise exception 'Unknown action';
end $$;
revoke all on function public.bot_ai(text,jsonb) from public,anon,authenticated;
grant execute on function public.bot_ai(text,jsonb) to service_role;
