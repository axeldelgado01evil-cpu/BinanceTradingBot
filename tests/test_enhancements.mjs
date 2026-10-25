import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
const url=source=>'data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64');
const analytics=url(await readFile(new URL('../supabase/functions/market-bot/analytics.ts',import.meta.url),'utf8'));
const text=await readFile(new URL('../supabase/functions/market-bot/enhancements.ts',import.meta.url),'utf8');
const e=await import(url(text.replace("from './analytics.ts'",`from '${analytics}'`)));
const records={},fills=new Map(),requests=[];
const d={rpc:async(name,{p_action:a,p_data:p})=>{
  assert.equal(name,'bot_ext');
  if(a==='get')return records[p.key]??null;
  if(a==='set'){records[p.key]=p.value;return true;}
  if(a==='ingest'){for(const f of p.fills)fills.set(f.symbol+f.id,f);return p.fills.length;}
  if(a==='fills')return {rows:[...fills.values()],truncated:false};
  if(a==='alert')return true;
  assert.fail('Unexpected database action '+a);
},json:async(url,options)=>{
  requests.push({url,options});const u=new URL(url);
  if(u.pathname==='/api/v3/exchangeInfo')return {symbols:['BTC','ETH','SOL'].map(base=>({symbol:base+'USDT',baseAsset:base,quoteAsset:'USDT',status:'TRADING',filters:[{filterType:'MIN_NOTIONAL',minNotional:'5'},{filterType:'LOT_SIZE',minQty:'.00001',stepSize:'.00001'}]}))};
  if(u.pathname==='/api/v3/time')return {serverTime:Date.now()};
  assert.equal(options.method,'GET');assert.ok(u.searchParams.get('signature'));
  if(u.pathname==='/api/v3/myTrades')return u.searchParams.get('symbol')==='BTCUSDT'&&u.searchParams.get('fromId')==='0'?[{id:1,time:Date.now()-1000,price:'100',qty:'1',quoteQty:'100',commission:'0',commissionAsset:'USDT',isBuyer:true}]:[];
  if(u.pathname.includes('/capital/'))return [];
  if(u.pathname==='/sapi/v1/asset/transfer')return {rows:[],total:0};
  if(u.pathname==='/api/v3/account/commission')return {standardCommission:{taker:'.001',buyer:'0',seller:'0'}};
  assert.fail('Unexpected endpoint '+u.pathname);
}};
const config={BINANCE_API_KEY:'test',BINANCE_API_SECRET:'test'};
const holdings=[{asset:'BTC',amount:1,price:110},{asset:'USDT',amount:100,price:1}];
let result=await e.refreshPortfolio(holdings,config,d);
assert.equal(result.accounting.unrealized,10);assert.equal(result.risk.total,210);
result=await e.refreshPortfolio([{...holdings[0]},{...holdings[1],amount:200}],config,d);
assert.equal(result.accounting.unrealized,10,'cash deposit cannot become trading profit');assert.equal(fills.size,1);
const before=requests.length;
await assert.rejects(e.readOnlyBinance(config,d)('/api/v3/order'),/not allowed/);
assert.equal(requests.length,before,'disallowed paths must fail before network');
assert.equal(records.fees.symbols.BTCUSDT.minNotional,5);assert.equal(records.fees.symbols.BTCUSDT.buyTaker,.001);
console.log('Enrichment passed: read-only allowlist, incremental history/dedupe, deposits excluded from PnL, actual fee/rule metadata.');
