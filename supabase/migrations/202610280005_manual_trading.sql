create table if not exists public.bot_trade_intents(id uuid primary key default gen_random_uuid(),user_id text not null,created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '30 seconds',status text not null default 'pending',body jsonb not null,result jsonb);
alter table public.bot_trade_intents enable row level security;
revoke all on public.bot_trade_intents from public,anon,authenticated;
create or replace function public.bot_trade(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.bot_trade_intents%rowtype; uid text;
begin
 uid:=p_data->>'user';if uid is null or length(uid)>200 or length(uid)<3 then raise exception 'Invalid owner';end if;
 if p_action='create' then
  perform pg_catalog.pg_advisory_xact_lock(hashtext('manual_order:'||uid));
  if exists(select 1 from public.bot_trade_intents where user_id=uid and status in('unknown','submitting')) then return jsonb_build_object('blocked',true);end if;
  insert into public.bot_trade_intents(user_id,body) values(uid,p_data->'intent') returning * into r;
  return jsonb_build_object('id',r.id,'expiresAt',extract(epoch from r.expires_at)*1000,'intent',r.body);
 elsif p_action='claim' then
  select * into r from public.bot_trade_intents where id=(p_data->>'id')::uuid and user_id=uid for update;
  if not found then return null;end if;
  if r.status<>'pending' then return jsonb_build_object('claimed',false,'status',r.status,'result',r.result);end if;
  if r.expires_at<now() then return null;end if;
  update public.bot_trade_intents set status='submitting' where id=r.id;
  return jsonb_build_object('claimed',true,'intent',r.body);
 elsif p_action='recent' then
  return (select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'status',x.status,'intent',x.body,'result',x.result,'at',extract(epoch from x.created_at)*1000) order by x.created_at desc),'[]') from (select * from public.bot_trade_intents where user_id=uid and status<>'pending' order by created_at desc limit 10)x);
 elsif p_action='finish' then
  if p_data->>'status' not in('confirmed','rejected','unknown') then raise exception 'Invalid status';end if;
  update public.bot_trade_intents set status=p_data->>'status',result=p_data->'result' where id=(p_data->>'id')::uuid and user_id=uid and status in('submitting','unknown');return to_jsonb(found);
 elsif p_action='status' then
  select * into r from public.bot_trade_intents where id=(p_data->>'id')::uuid and user_id=uid;
  if not found then return null;end if;return jsonb_build_object('id',r.id,'status',r.status,'intent',r.body,'result',r.result);
 end if;raise exception 'Unknown action';
end $$;
revoke all on function public.bot_trade(text,jsonb) from public,anon,authenticated;
grant execute on function public.bot_trade(text,jsonb) to service_role;
