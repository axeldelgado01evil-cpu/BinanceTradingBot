-- Private analytics, historical samples and capability hashes. No client grants.
create table if not exists public.bot_records(key text primary key,value jsonb not null,updated_at timestamptz not null default now());
create table if not exists public.bot_fills(symbol text not null,trade_id bigint not null,body jsonb not null,primary key(symbol,trade_id));
create table if not exists public.bot_values(ts timestamptz primary key,total numeric,body jsonb not null);
create table if not exists public.bot_samples(ts timestamptz primary key,body jsonb not null);
create table if not exists public.bot_alerts(id uuid primary key default gen_random_uuid(),key text not null,body text not null,created_at timestamptz not null default now(),sent_at timestamptz);
create index if not exists bot_alerts_key_time on public.bot_alerts(key,created_at desc);
create table if not exists public.bot_memory(id bigint generated always as identity primary key,at timestamptz not null default now(),question text not null,answer text not null);
create table if not exists public.bot_panel_sessions(hash text primary key,expires_at timestamptz not null);
alter table public.bot_records enable row level security;
alter table public.bot_fills enable row level security;
alter table public.bot_values enable row level security;
alter table public.bot_samples enable row level security;
alter table public.bot_alerts enable row level security;
alter table public.bot_memory enable row level security;
alter table public.bot_panel_sessions enable row level security;
revoke all on public.bot_records,public.bot_fills,public.bot_values,public.bot_samples,public.bot_alerts,public.bot_memory,public.bot_panel_sessions from public,anon,authenticated;

create or replace function public.bot_ext(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare answer jsonb; n integer; k text;
begin
  if p_action='get' then
    select value into answer from public.bot_records where key=p_data->>'key';return answer;
  elsif p_action='set' then
    k:=p_data->>'key';
    if k is null or k!~'^[a-z_]{1,40}$' or octet_length((p_data->'value')::text)>1000000 then raise exception 'Invalid record'; end if;
    insert into public.bot_records(key,value) values(k,p_data->'value') on conflict(key) do update set value=excluded.value,updated_at=now();return 'true';
  elsif p_action='fills' then
    select jsonb_build_object('rows',coalesce(jsonb_agg(body),'[]'),'truncated',(select count(*)>10000 from public.bot_fills)) into answer
      from (select body from public.bot_fills order by (body->>'time')::bigint,symbol,trade_id limit 10000)x;return answer;
  elsif p_action='ingest' then
    if jsonb_typeof(p_data->'fills') is distinct from 'array' or jsonb_array_length(p_data->'fills')>1000 then raise exception 'Invalid fills'; end if;
    insert into public.bot_fills(symbol,trade_id,body) select f->>'symbol',(f->>'id')::bigint,f from jsonb_array_elements(p_data->'fills')f
      where f->>'symbol'~'^[A-Z0-9]{1,20}USDT$' and (f->>'id')::bigint>=0 on conflict do nothing;
    get diagnostics n=row_count;return to_jsonb(n);
  elsif p_action='repair_fees' then
    if jsonb_typeof(p_data->'fills') is distinct from 'array' or jsonb_array_length(p_data->'fills')>5 then raise exception 'Invalid fee repairs';end if;
    update public.bot_fills b set body=b.body||jsonb_build_object('feeUsdt',f->'feeUsdt','feeEstimated',true)
      from jsonb_array_elements(p_data->'fills')f where b.symbol=f->>'symbol' and b.trade_id=(f->>'id')::bigint
      and (b.body->>'feeUsdt') is null and (f->>'feeUsdt')::numeric>=0;return 'true';
  elsif p_action='sample' then
    insert into public.bot_samples(ts,body) values(to_timestamp((p_data->>'at')::double precision/1000),p_data->'market') on conflict do nothing;
    if p_data ? 'portfolio' then
      insert into public.bot_values(ts,total,body) values(to_timestamp((p_data->>'at')::double precision/1000),(p_data->'portfolio'->>'total')::numeric,p_data->'portfolio') on conflict do nothing;
    end if;
    delete from public.bot_values where ts<now()-interval '90 days';delete from public.bot_samples where ts<now()-interval '90 days';
    delete from public.bot_memory where at<now()-interval '30 minutes';delete from public.bot_panel_sessions where expires_at<now();
    delete from public.bot_alerts where created_at<now()-interval '7 days' and sent_at is not null;return 'true';
  elsif p_action='history' then
    select coalesce(jsonb_agg(jsonb_build_object('at',extract(epoch from ts)*1000,'value',body) order by ts),'[]') into answer from
      (select ts,body from public.bot_samples where ts>now()-interval '30 days' order by ts desc limit 3000)x;return answer;
  elsif p_action='alert' then
    k:=p_data->>'key';
    perform pg_catalog.pg_advisory_xact_lock(hashtext(k));
    if not exists(select 1 from public.bot_alerts where key=k and created_at>now()-make_interval(mins=>greatest(5,least(1440,coalesce((p_data->>'cooldown')::integer,60))))) then
      insert into public.bot_alerts(key,body) values(k,left(p_data->>'message',1500));return 'true';
    end if;return 'false';
  elsif p_action='pending' then
    select coalesce(jsonb_agg(jsonb_build_object('id',id,'body',body) order by created_at),'[]') into answer from
      (select id,body,created_at from public.bot_alerts where sent_at is null order by created_at limit 3)x;return answer;
  elsif p_action='ack_alert' then
    update public.bot_alerts set sent_at=now() where id=(p_data->>'id')::uuid and sent_at is null;return to_jsonb(found);
  elsif p_action='memory' then
    select coalesce(jsonb_agg(jsonb_build_object('question',x.question,'answer',x.reply,'at',extract(epoch from x.at)*1000) order by x.id),'[]') into answer from
      (select b.id,b.at,b.question,b.answer as reply from public.bot_memory b where b.at>now()-interval '30 minutes' order by b.id desc limit 2)x;return answer;
  elsif p_action='remember' then
    insert into public.bot_memory(question,answer) values(left(p_data->>'question',250),left(p_data->>'answer',250));
    delete from public.bot_memory where id not in(select id from public.bot_memory order by id desc limit 6);return 'true';
  elsif p_action='forget' then
    delete from public.bot_memory;return 'true';
  elsif p_action='panel_issue' then
    if p_data->>'hash'!~'^[a-f0-9]{64}$' then raise exception 'Invalid session';end if;
    delete from public.bot_panel_sessions where expires_at<now();
    insert into public.bot_panel_sessions(hash,expires_at) values(p_data->>'hash',now()+interval '15 minutes');return 'true';
  end if;
  raise exception 'Unknown action';
end $$;
revoke all on function public.bot_ext(text,jsonb) from public,anon,authenticated;
grant execute on function public.bot_ext(text,jsonb) to service_role;

create or replace function public.bot_panel(p_hash text,p_days integer default 30) returns jsonb
language plpgsql security definer set search_path='' as $$
declare records jsonb; series jsonb;
begin
  if p_hash!~'^[a-f0-9]{64}$' or p_days not in(7,30,90) or not exists(select 1 from public.bot_panel_sessions where hash=p_hash and expires_at>now()) then return null;end if;
  select coalesce(jsonb_object_agg(key,value),'{}') into records from public.bot_records
    where key in('portfolio','ledger','risk','validation','health','watchlist','limits','security','markets','fees','flows','forward_evaluation','correlations');
  select coalesce(jsonb_agg(jsonb_build_object('at',extract(epoch from bucket)*1000,'total',total) order by bucket),'[]') into series from
    (select date_trunc('hour',ts) as bucket,avg(total) as total from public.bot_values where ts>now()-make_interval(days=>p_days) group by 1)x;
  return jsonb_build_object('records',records,'series',series,'at',extract(epoch from now())*1000,'readOnly',true);
end $$;
revoke all on function public.bot_panel(text,integer) from public,anon,authenticated;
grant execute on function public.bot_panel(text,integer) to service_role;
