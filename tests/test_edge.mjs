import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const env = new Map([['SUPABASE_SERVICE_ROLE_KEY','test-service-key'],['SB_REGION','sa-east-1']]);
let handler;
globalThis.Deno = { env: {get:key=>env.get(key)}, serve:fn=>{handler=fn;} };
const source=stripTypeScriptTypes(await readFile(new URL('../supabase/functions/market-bot/index.ts',import.meta.url),'utf8'));
const bot=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const analysis=(symbol,overrides={})=>({symbol,price:100,change:5,change_15m:0.2,volume_24h:50000000,
  rsi:55,histogram:1,volume_ratio:2,atr:2,support:95,resistance:105,trend:'alcista',candle_id:123,
  external:{ok:true,sources:['CMC'],gap:0,reason:'precio contrastado'},...overrides});
const a=Object.fromEntries(['BTCUSDT','ETHUSDT','SOLUSDT','DOGEUSDT','PEPEUSDT','LINKUSDT'].map(s=>[s,analysis(s)]));
const blank=()=>({version:1,cash:100,positions:{},trades:[],last_candle:{},status:'active'});
assert.equal(bot.rsi(Array(30).fill(100)),50);
assert.equal(bot.rsi(Array.from({length:30},(_,i)=>100+i)),100);
assert.equal(bot.candidate(analysis('DOGEUSDT',{change:30}),true),false);
const state=blank();
bot.updatePaper(state,a,'2026-10-23T12:00:00Z');
assert.equal(Object.keys(state.positions).length,3);
assert.ok(state.cash>=20);
assert.ok(bot.equity(state,a)<100);
for(const p of Object.values(state.positions)){
  assert.ok((p.entry-p.stop)*p.quantity<=1);
  assert.equal(p.target-p.entry,2*(p.entry-p.stop));
}
const afterEntry=structuredClone(state);
const stopped=structuredClone(a);stopped.BTCUSDT.price=90;
bot.updatePaper(state,stopped,'2026-10-23T12:15:00Z');
assert.equal(state.positions.BTCUSDT,undefined);
bot.updatePaper(state,a,'2026-10-23T12:20:00Z');
assert.equal(state.positions.BTCUSDT,undefined,'must not reenter the stopped candle');
const low=blank();low.cash=94;bot.updatePaper(low,a,'now');assert.equal(low.status,'paused');assert.deepEqual(low.positions,{});
const halted=blank();halted.cash=84;bot.updatePaper(halted,a,'now');assert.equal(halted.status,'halted');
const text=bot.report(a,{market_change:2,fear_greed:60},{title:'Mercado <falso> & noticia',url:'https://www.criptonoticias.com/a'},afterEntry,
  'Binance Spot · solo lectura\nValor: 100 USDT. <prueba>',Array(3).fill('Compra de prueba: salida por pérdida 10,00; objetivo 20,00.'),new Date('2026-10-23T12:00:00Z'));
assert.ok(text.length<4000,`Telegram report length: ${text.length}`);
assert.ok(text.includes('09:00 (Uruguay)'));
assert.ok(text.includes('&lt;prueba&gt;'));
assert.ok(!text.includes('Cartera de prueba'));
assert.ok(!text.includes('Compra de prueba: salida por pérdida'));
assert.ok(text.includes('&lt;falso&gt; &amp; noticia'));
assert.ok(!source.includes('/api/v3/order'));
const now=Date.now(),quote=(usd,age=0)=>({usd,updated:now-age});
const check=structuredClone(a);
bot.crossCheck(check,{cmc:{BTC:quote(99.9),ETH:quote(99.9),SOL:quote(99.9),USDT:quote(0.999)}},now);
assert.ok(check.BTCUSDT.external.ok,'must convert Binance USDT into USD before comparing');
assert.ok(check.BTCUSDT.external.gap<0.00001);
bot.crossCheck(check,{cmc:{BTC:quote(110),USDT:quote(1)},gecko:{BTC:quote(100),USDT:quote(1)}},now);
assert.equal(check.BTCUSDT.external.ok,false,'one disagreeing source blocks the entry');
bot.crossCheck(check,{cmc:{BTC:quote(100,900001),USDT:quote(1)}},now);
assert.equal(check.BTCUSDT.external.ok,false,'stale quotes must not confirm an entry');
const noQuote=blank();bot.updatePaper(noQuote,check,'now');assert.deepEqual(noQuote.positions,{});
bot.crossCheck(check,{cmc:{BTC:quote(98),USDT:quote(0.98)}},now);
assert.equal(check.BTCUSDT.external.reason,'USDT se aparta del dólar');
assert.throws(()=>bot.parseCmc({status:{error_code:0},data:[{id:1,symbol:'ETH',quote:[]}]}));
const cmc=bot.parseCmc({status:{error_code:'0'},data:[{id:1,symbol:'BTC',quote:[{symbol:'USD',price:100,last_updated:new Date(now).toISOString()}]}]});
assert.equal(cmc.BTC.usd,100);
assert.equal(bot.parseGecko({bitcoin:{usd:100,last_updated_at:Math.floor(now/1000)}}).BTC.usd,100);
const addr='Aa'.repeat(16),pair='B'.repeat(32),targets=[{chain:'solana',address:addr}];
const pool={chainId:'solana',baseToken:{address:addr,symbol:'TEST'},quoteToken:{symbol:'SOL'},pairAddress:pair,
  liquidity:{usd:2000000},volume:{h24:2000000},pairCreatedAt:now-10*86400000,fdv:20000000,marketCap:20000000};
assert.equal(bot.selectDexPairs([pool],targets,now).length,1);
assert.equal(bot.selectDexPairs([{...pool,liquidity:{usd:900000}}],targets,now).length,0);
assert.equal(bot.selectDexPairs([{...pool,pairCreatedAt:now-86400000}],targets,now).length,0);
assert.equal(bot.selectDexPairs([{...pool,baseToken:{address:addr.toLowerCase(),symbol:'TEST'}}],targets,now).length,0,'Solana addresses are case sensitive');
const worstContext={sources:{CMC:'no disponible',CoinGecko:'datos antiguos',DefiLlama:'ok','DEX Screener':'ok'},
  defi:{volume:12345678900,change:-20,checked:now},dex:{scanned:8,checked:now,qualified:Array(2).fill({symbol:'A'.repeat(15),chain:'solana',url:'https://dexscreener.com/solana/'+'A'.repeat(88),liquidity:123456789})}};
const worst=bot.report(check,worstContext,null,afterEntry,'Cuenta Spot\n'+Array(5).fill('• SHIB: ≈123456789,123456 (≈123456789,12 USDT)').join('\n'),Array(3).fill('Compra de prueba de BTC por 100 USDT. Salida por pérdida: 123456; objetivo: 123456.'));
assert.ok(worst.length<4000,`Worst-case report length: ${worst.length}`);
let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('must not fetch');};
const denied=await handler(new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer anon'}}));
assert.equal(denied.status,401);assert.equal(calls,0);
env.set('SB_REGION','us-east-1');
const wrongRegion=await handler(new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer test-service-key'}}));
assert.equal(wrongRegion.status,503);assert.equal(calls,0);
console.log('Edge checks passed: paper risk, stops, repeat candle, pause, report, auth and region.');
