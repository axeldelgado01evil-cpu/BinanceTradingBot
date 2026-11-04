# Laboratory

Read-only, integrated with the existing Supabase 15-minute report. No new model calls, trading credentials or payment plan. The existing Groq explanation receives only a small public-data summary for laboratory/memecoin questions, under the original quota and input limits.

Five modules expose source freshness and missing data: token radar, liquidity/activity, contract checks, BTC/ETH/SOL context, and forward observations. These are deterministic jobs, not five independent AI models or trade executors.

## Coverage and selection

The public DEX Screener recent-profile list supplies at most 18 distinct contracts across Solana, Ethereum, BSC and Base. Up to eight pending tracked tokens may be added solely for follow-up. Token batches use fixed official API hosts and validated addresses. Only matching base-token contracts and supported quote tokens are accepted. The most liquid compatible pool per token is displayed, up to 12 rows. Token visibility and paid boosts do not establish quality or identify a token as a memecoin.

Basic observation filters: at least USD100,000 liquidity, USD250,000 24-hour volume, pool age24h, recent buys and sells, bounded daily movement, volume/liquidity ratio and valuation/liquidity ratio. Missing values fail these filters. Up to two new GoPlus checks run per cycle, with existing hourly cache; incomplete review never becomes a qualified alert. These rules are experimental screening criteria, not validated investment signals.

Alerts: at most one newly qualified candidate per cycle, six-hour cooldown per contract; requires basic filters, a current completed contract review without the consulted flags, and 1-hour movement between2% and15%. The usual report links to `/laboratorio`. This is observation only, never an order or probability of profit.

## Forward observations

One observation per qualifying base contract per24h, original pool identity preserved. Prices must be read at1h within20min or24h within30min after the horizon; missed windows are recorded as missing. No future observations, cross-pool substitution or invented returns. Retention7days and at most180 observations. Displayed means are gross observed price variations, not executed profit, and exclude fees/slippage. Illiquidity can prevent executing a trade at the quoted price. No synthetic money portfolio is shown.

`/laboratorio`, `/lab`, `/radar` use stored data and mark stale readings. The private panel includes the same record under its existing authentication; no public portfolio exposure. Purchases/sales remain in Binance. `manual-trade` remains retired.

Sources: https://docs.dexscreener.com/api/reference and the existing GoPlus token-security integration.
