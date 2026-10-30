-- Owner chose to trade directly in Binance. Preserve private receipts, disable access.
select public.bot_ext('set','{"key":"trade_server","value":{"enabled":false}}'::jsonb);
