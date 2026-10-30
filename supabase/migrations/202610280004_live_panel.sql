-- The Site retains owner-only ChatGPT authentication. Its read-only key stays server-side.
create or replace function public.bot_panel(p_hash text,p_days integer default 30) returns jsonb
language plpgsql security definer set search_path='' as $$
declare records jsonb; series jsonb;
begin
  if p_hash!~'^[a-f0-9]{64}$' or p_days not in(7,30,90) then return null;end if;
  if not exists(select 1 from public.bot_panel_sessions where hash=p_hash and expires_at>now())
    and not exists(select 1 from public.bot_records where key='panel_server' and value->>'hash'=p_hash and value->>'enabled'='true') then return null;end if;
  select coalesce(jsonb_object_agg(key,value),'{}') into records from public.bot_records
    where key in('portfolio','ledger','risk','validation','health','watchlist','limits','security','markets','fees','flows','forward_evaluation','correlations','panel_live');
  select coalesce(jsonb_agg(jsonb_build_object('at',extract(epoch from bucket)*1000,'total',total) order by bucket),'[]') into series from
    (select date_trunc('hour',ts) as bucket,avg(total) as total from public.bot_values where ts>now()-make_interval(days=>p_days) group by 1)x;
  return jsonb_build_object('records',records,'series',series,'at',extract(epoch from now())*1000,'readOnly',true);
end $$;
revoke all on function public.bot_panel(text,integer) from public,anon,authenticated;
grant execute on function public.bot_panel(text,integer) to service_role;

create or replace function public.bot_live_claim() returns jsonb
language plpgsql security definer set search_path='' as $$
declare last_at double precision; cfg jsonb; stamp double precision;
begin
  perform pg_catalog.pg_advisory_xact_lock(13003371);
  stamp:=extract(epoch from now())*1000;
  select (value->>'at')::double precision into last_at from public.bot_records where key='live_refresh';
  if last_at>stamp-60000 then return null;end if;
  insert into public.bot_records(key,value) values('live_refresh',jsonb_build_object('at',stamp)) on conflict(key) do update set value=excluded.value,updated_at=now();
  select decrypted_secret::jsonb into cfg from vault.decrypted_secrets where name='market_bot_config';
  if cfg->>'BINANCE_API_KEY' is null or cfg->>'BINANCE_API_SECRET' is null then return null;end if;
  return jsonb_build_object('BINANCE_API_KEY',cfg->>'BINANCE_API_KEY','BINANCE_API_SECRET',cfg->>'BINANCE_API_SECRET');
end $$;
revoke all on function public.bot_live_claim() from public,anon,authenticated;
grant execute on function public.bot_live_claim() to service_role;
