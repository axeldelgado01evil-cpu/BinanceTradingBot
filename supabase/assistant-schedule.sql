-- Run only after bot_ai migration, code deployment, and Groq Free activation.
-- Gateway JWT validation and fixed execution region remain unchanged.
select cron.schedule('market-bot-telegram-assistant','* * * * *',$$
  select net.http_post(
    url:='https://qqdyagzvjshhiiqkzfat.supabase.co/functions/v1/market-bot',
    headers:=jsonb_build_object('Content-Type','application/json','x-region','sa-east-1',
      'Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='market_bot_cron_jwt')),
    body:='{"action":"assistant_poll"}'::jsonb,
    timeout_milliseconds:=120000
  );
$$);
