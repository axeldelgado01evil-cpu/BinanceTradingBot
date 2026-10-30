import assert from 'node:assert/strict';
import {moduleURL} from './load-ts.mjs';
const pair=await crypto.subtle.generateKey('Ed25519',true,['sign','verify']);
const bytes=Buffer.from(await crypto.subtle.exportKey('pkcs8',pair.privateKey));
const pem='-----BEGIN PRIVATE KEY-----\n'+bytes.toString('base64')+'\n-----END PRIVATE KEY-----';
const env={BINANCE_TRADE_API_KEY:'test-key',BINANCE_TRADE_PRIVATE_KEY:pem,SUPABASE_SERVICE_ROLE_KEY:'test-service',SUPABASE_URL:'https://db.test',SB_REGION:'sa-east-1'};
globalThis.Deno={env:{get:k=>env[k]},serve:()=>{}};
const trade=await import(await moduleURL(new URL('../supabase/functions/manual-trade/index.ts',import.meta.url)));
const token='a'.repeat(64),hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))).toString('hex');
let submits=0,permissionWithdraw=false,unknown=false,claimed=false,finalStatus;
globalThis.fetch=async(url,options={})=>{
 const u=new URL(url);const body=options.body&&String(options.body).startsWith('{')?JSON.parse(options.body):null;
 if(u.hostname==='db.test'){
  if(u.pathname.endsWith('/bot_ext'))return Response.json(body.p_data?.key==='trade_server'?{enabled:true,hash}:true);
  if(u.pathname.endsWith('/bot_trade')){
   if(body.p_action==='claim'){if(claimed)return Response.json({claimed:false,status:finalStatus});claimed=true;return Response.json({claimed:true,intent:{symbol:'BTCUSDT',side:'BUY',quantity:'0.001',price:'101',asset:'BTC'}});}
   if(body.p_action==='finish'){finalStatus=body.p_data.status;return Response.json(true);}
   return Response.json({id:'00000000-0000-0000-0000-000000000001',intent:body.p_data.intent,expiresAt:Date.now()+30000});
  }
 }
 if(u.pathname==='/api/v3/time')return Response.json({serverTime:Date.now()});
 if(u.pathname==='/api/v3/exchangeInfo')return Response.json({symbols:[{symbol:'BTCUSDT',baseAsset:'BTC',quoteAsset:'USDT',status:'TRADING',isSpotTradingAllowed:true,filters:[{filterType:'LOT_SIZE',minQty:'0.001',maxQty:'100',stepSize:'0.001'},{filterType:'PRICE_FILTER',tickSize:'0.01'},{filterType:'NOTIONAL',minNotional:'5'}]}]});
 if(u.pathname==='/api/v3/ticker/bookTicker')return Response.json({bidPrice:'99',askPrice:'100'});
 if(u.pathname==='/api/v3/account')return Response.json({canTrade:true,balances:[{asset:'USDT',free:'1000'},{asset:'BTC',free:'1'}]});
 if(u.pathname==='/sapi/v1/account/apiRestrictions')return Response.json({enableReading:true,enableSpotAndMarginTrading:true,enableWithdrawals:permissionWithdraw,enableInternalTransfer:false,permitsUniversalTransfer:false});
 if(u.pathname==='/api/v3/order'){
  assert.equal(options.method,'POST');const params=new URLSearchParams(options.body),signature=Buffer.from(params.get('signature'),'base64');params.delete('signature');
  assert.equal(await crypto.subtle.verify('Ed25519',pair.publicKey,signature,new TextEncoder().encode(params.toString())),true,'request uses valid asymmetric signature');
  assert.equal(params.get('type'),'LIMIT');assert.equal(params.get('timeInForce'),'IOC');submits++;
  if(unknown)return Response.json({code:-1007},{status:400});
  return Response.json({orderId:42,symbol:'BTCUSDT',clientOrderId:params.get('newClientOrderId'),status:'FILLED',executedQty:'0.001',cummulativeQuoteQty:'0.1',fills:[]});
 }
 throw Error('Unexpected endpoint '+u.pathname);
};
assert.equal(trade.quantize(1.2345,'0.001'), '1.234');
const preview=await trade.preview({symbol:'BTCUSDT',side:'BUY',amount:'10'});assert.equal(preview.timeInForce,'IOC');assert.ok(Number(preview.price)>=100);assert.ok(preview.value<=10);assert.equal(submits,0);
await assert.rejects(()=>trade.preview({symbol:'BTCUSDT',side:'BUY',amount:'1000'}));
permissionWithdraw=true;await assert.rejects(()=>trade.preview({symbol:'BTCUSDT',side:'BUY',amount:'10'}));permissionWithdraw=false;
await assert.rejects(()=>trade.signed('/sapi/v1/capital/withdraw/apply',{},'POST'));assert.equal(submits,0);
const request=body=>new Request('https://example/manual-trade',{method:'POST',headers:{Authorization:'Bearer '+token,'x-panel-user-id':'test-owner','Content-Type':'application/json'},body:JSON.stringify(body)});
const connection=await trade.handle(request({action:'status'}));
const connectionResult=await connection.json();assert.equal(connectionResult.enabled,true);assert.equal(connectionResult.permissionsChecked,true);assert.equal(connectionResult.withdrawals,false);assert.equal(submits,0,'connection checks never place orders');assert.ok(!JSON.stringify(connectionResult).includes('balances'));
assert.equal((await trade.handle(request({action:'execute',id:'00000000-0000-0000-0000-000000000001'}))).status,400);assert.equal(submits,0,'no order without explicit confirmation');
const order={action:'execute',id:'00000000-0000-0000-0000-000000000001',confirm:true};
assert.equal((await trade.handle(request(order))).status,200);assert.equal(submits,1);assert.equal(finalStatus,'confirmed');
await trade.handle(request(order));assert.equal(submits,1,'same intent never submits twice');
claimed=false;unknown=true;assert.equal((await trade.handle(request(order))).status,409);assert.equal(finalStatus,'unknown','execution timeout must not be labeled rejected');const count=submits;await trade.handle(request(order));assert.equal(submits,count,'ambiguous execution is not retried');
console.log('Manual trading tests passed with mocked exchange only: Ed25519 signature, IOC protection, balance/permission rules, confirmation, deduplication, unknown-result handling');
