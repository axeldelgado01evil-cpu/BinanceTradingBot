import assert from 'node:assert/strict';
import {moduleURL} from './load-ts.mjs';
const m=await import(await moduleURL(new URL('../supabase/functions/market-bot/interaction.ts',import.meta.url)));
const records={},alerts=[],memory=[];
const deps={rpc:async(name,{p_action:a,p_data:d={}})=>{
 if(a==='get')return records[d.key];if(a==='set')return records[d.key]=d.value;
 if(a==='alert'){if(alerts.some(e=>e.key===d.key))return false;alerts.push(d);return true;}
 if(a==='history')return [];if(a==='sample')return true;
 if(a==='forget'){memory.length=0;return true;}if(a==='panel_issue'){assert.match(d.hash,/^[a-f0-9]{64}$/);records.session=d.hash;return true;}
 throw Error(a);
},json:async()=>[]};
assert.equal(m.privateQuestion('¿Cuánto tengo en mi cuenta?'),true);
assert.equal(m.privateQuestion('¿Qué pasa con Bitcoin?'),false);
assert.deepEqual(m.safeMemory([{question:'mi saldo',answer:'10 USDT'},{question:'Bitcoin',answer:'dato público'}]),[{question:'Bitcoin',answer:'dato público'}]);
assert.equal(await m.localCommand('¿Qué pasa con BTC?',deps),null);
for(const command of ['/guardarbtc','/custodia','/metamask','/guardarbtc@CryptoAlertasPersonal_bot']){
 const guide=await m.localCommand(command,deps);
 assert.match(guide,/red Bitcoin/);
 assert.match(guide,/fuera de internet/);
 assert.match(guide,/no lo ejecuta/);
 assert.match(guide,/ya no aparece en tu saldo de Binance/);
 assert.match(guide,/no garantiza ganancias/);
}
assert.match(await m.localCommand('/ayuda',deps),/\/guardarbtc/);
await m.localCommand('/alertas movimiento 4',deps);assert.equal(records.limits.move,4);
await m.localCommand('/alertas movimiento -2',deps);assert.equal(records.limits.move,4);
const now=Date.now(),old={at:now-900000,prices:{BTCUSDT:100}},snapshot={at:now-30000,assets:[{asset:'BTC',support:98,resistance:105}]};
const es=m.monitorEvents(old,[{symbol:'BTCUSDT',bidPrice:'94',askPrice:'96'}],snapshot,{move:3,spread:.5},now);
assert.equal(es.length,3);assert.ok(es.some(e=>e.key==='support:BTCUSDT'));
assert.equal(m.monitorEvents({...old,at:now-3600000},[{symbol:'BTCUSDT',price:90}],snapshot,{move:3,spread:.5},now).length,0,'stale baseline is not a fresh drop');
records.monitor=old;records.health={reportSent:now};deps.json=async()=>[{symbol:'BTCUSDT',bidPrice:'94',askPrice:'96'}];
await m.monitorTick(deps,snapshot,now);const first=alerts.length;await m.monitorTick(deps,snapshot,now+120000);assert.equal(alerts.length,first,'outbox dedupes repeated types');
const link=await m.localCommand('/panel',deps,true);assert.match(link,/#session=[a-f0-9]{64}/);assert.ok(!link.includes(records.session),'only hash persisted');
records.forward_evaluation={observations:[{asset:'BTC',at:now-86400000,entry:100}]};
await m.recordMarket({at:now,assets:[{asset:'BTC',usdt:110,signal:true}]},deps);assert.equal(records.forward_evaluation.completed,1);assert.ok(Math.abs(records.forward_evaluation.mean24h-10)<1e-8);assert.equal(records.forward_evaluation.observations.length,2);
await m.recordMarket({at:now+900000,assets:[{asset:'BTC',usdt:111,signal:true}]},deps);assert.equal(records.forward_evaluation.observations.length,2,'no duplicate same-day signal');
console.log('interaction: privacy, config, alerts, capability and forward observation passed');
