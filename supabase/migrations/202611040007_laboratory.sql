-- The Site retains owner-only ChatGPT authentication. Its read-only key stays server-side.
create or replace function public.bot_panel(p_hash text,p_days integer default 30) returns jsonb
language plpgsql security definer set search_path='' as $$
declare records jsonb; series jsonb;
begin
  if p_hash!~'^[a-f0-9]{64}$' or p_days not in(7,30,90) then return null;end if;
  if not exists(select 1 from public.bot_panel_sessions where hash=p_hash and expires_at>now())
    and not exists(select 1 from public.bot_records where key='panel_server' and value->>'hash'=p_hash and value->>'enabled'='true') then return null;end if;
  select coalesce(jsonb_object_agg(key,value),'{}') into records from public.bot_records
    where key in('portfolio','ledger','risk','validation','health','watchlist','limits','security','markets','fees','flows','forward_evaluation','correlations','panel_live','laboratory');
  select coalesce(jsonb_agg(jsonb_build_object('at',extract(epoch from bucket)*1000,'total',total) order by bucket),'[]') into series from
    (select date_trunc('hour',ts) as bucket,avg(total) as total from public.bot_values where ts>now()-make_interval(days=>p_days) group by 1)x;
  return jsonb_build_object('records',records,'series',series,'at',extract(epoch from now())*1000,'readOnly',true);
end $$;
revoke all on function public.bot_panel(text,integer) from public,anon,authenticated;
grant execute on function public.bot_panel(text,integer) to service_role;

