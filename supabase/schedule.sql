-- Run only after the first successful account report. Database timezone is UTC.
-- The fixed region is required for the Binance account host.
select cron.schedule('market-bot-every-15-minutes','*/15 * * * *',
  $job$
  select net.http_post(
    url := 'https://qqdyagzvjshhiiqkzfat.supabase.co/functions/v1/market-bot',
    headers := jsonb_build_object('Content-Type','application/json','x-region','sa-east-1',
      'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='market_bot_cron_jwt')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $job$);
