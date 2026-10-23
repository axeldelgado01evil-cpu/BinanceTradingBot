import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const env = new Map([['SUPABASE_SERVICE_ROLE_KEY','test-service-key'],['SB_REGION','sa-east-1']]);
let handler;
globalThis.Deno = { env: {get:key=>env.get(key)}, serve:fn=>{handler=fn;} };
const source=stripTypeScriptTypes(await readFile(new URL('../supabase/functions/market-bot/index.ts',import.meta.url),'utf8'));
const bot=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const analysis=(symbol,overrides={})=>({symbol,price:100,change:5,change_15m:0.2,volume_24h:50000000,
  rsi:55,histogram:1,volume_ratio:2,atr:2,support:95,resistance:105,trend:'alcista',candle_id:123,...overrides});
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
assert.ok(text.includes('14:00 (España)'));
assert.ok(text.includes('&lt;prueba&gt;'));
assert.ok(text.includes('&lt;falso&gt; &amp; noticia'));
assert.ok(!source.includes('/api/v3/order'));
let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('must not fetch');};
const denied=await handler(new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer anon'}}));
assert.equal(denied.status,401);assert.equal(calls,0);
env.set('SB_REGION','us-east-1');
const wrongRegion=await handler(new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer test-service-key'}}));
assert.equal(wrongRegion.status,503);assert.equal(calls,0);
console.log('Edge checks passed: paper risk, stops, repeat candle, pause, report, auth and region.');
