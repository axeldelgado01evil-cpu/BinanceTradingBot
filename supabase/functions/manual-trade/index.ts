// Manual Spot LIMIT IOC only. No AI decisions, withdrawals, transfers, margin or derivatives.
const SITE='https://cripto-alertas-axel-panel.ablegoat69.chatgpt.site';
const API='https://api.binance.com',PUBLIC='https://data-api.binance.vision';
const headers={'Cache-Control':'no-store','Content-Type':'application/json'};
class TradeError extends Error{code:string;status:number;constructor(code:string,status=400){super(code);this.code=code;this.status=status;}}
async function rpc(name:string,data:any){const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;const r=await fetch(Deno.env.get('SUPABASE_URL')+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(10000)});if(!r.ok)throw new TradeError('storage_unavailable',503);return r.json();}
const record=(key:string)=>rpc('bot_ext',{p_action:'get',p_data:{key}});
async function json(url:string,options:any={}){const r=await fetch(url,{...options,signal:AbortSignal.timeout(12000)});const body=await r.json().catch(()=>({}));if(!r.ok)throw new TradeError(Number(body.code)===-2010?'order_rejected':Number(body.code)===-2015?'permissions_unavailable':'exchange_unavailable',r.status>=500||[-1006,-1007].includes(Number(body.code))?503:400);return body;}
function pemBytes(pem:string){return Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g,'').replace(/\s/g,'')),c=>c.charCodeAt(0));}
function limitedPermissions(p:any){return p.enableReading===true&&p.enableSpotAndMarginTrading===true&&!p.enableWithdrawals&&!p.enableInternalTransfer&&!p.permitsUniversalTransfer&&!p.enableFutures&&!p.enableMargin;}
export async function signed(path:string,params:Record<string,string>={},method='GET'){
 const allowed=method==='POST'?path==='/api/v3/order':['/api/v3/account','/sapi/v1/account/apiRestrictions','/api/v3/order'].includes(path);
 if(!allowed||!['GET','POST'].includes(method))throw new TradeError('endpoint_not_allowed');
 const apiKey=Deno.env.get('BINANCE_TRADE_API_KEY'),pem=Deno.env.get('BINANCE_TRADE_PRIVATE_KEY');
 if(!apiKey||!pem)throw new TradeError('trading_not_configured',503);
 const clock=await json(API+'/api/v3/time');
 const query=new URLSearchParams({...params,timestamp:String(clock.serverTime),recvWindow:'5000'});
 const key=await crypto.subtle.importKey('pkcs8',pemBytes(pem),'Ed25519',false,['sign']);
 const signature=new Uint8Array(await crypto.subtle.sign('Ed25519',key,new TextEncoder().encode(query.toString())));
 query.set('signature',btoa(String.fromCharCode(...signature)));
 return json(API+path+(method==='GET'?'?'+query:''),{method,headers:{'X-MBX-APIKEY':apiKey,'Content-Type':'application/x-www-form-urlencoded'},...(method==='POST'?{body:query.toString()}:{})});
}
export function quantize(value:number,stepText:string,up=false){
 const step=Number(stepText);if(!(value>0)||!(step>0)||!Number.isFinite(value/step))throw new TradeError('invalid_amount');
 const decimals=(stepText.split('.')[1]??'').replace(/0+$/,'').length;
 return ((up?Math.ceil(value/step):Math.floor(value/step))*step).toFixed(Math.min(12,decimals));
}
export async function preview(input:any){
 const symbol=String(input.symbol),side=input.side,amount=Number(input.amount);
 if(!/^[A-Z0-9]{1,20}USDT$/.test(symbol)||!['BUY','SELL'].includes(side)||!/^\d{1,12}(\.\d{1,12})?$/.test(String(input.amount))||!(amount>0))throw new TradeError('invalid_order');
 const [info,book,account,permissions]=await Promise.all([
  json(PUBLIC+'/api/v3/exchangeInfo?symbol='+symbol),json(PUBLIC+'/api/v3/ticker/bookTicker?symbol='+symbol),signed('/api/v3/account'),signed('/sapi/v1/account/apiRestrictions'),
 ]);
 if(!limitedPermissions(permissions))throw new TradeError('permissions_not_limited');
 const rule=info.symbols?.[0];if(!rule||rule.status!=='TRADING'||rule.quoteAsset!=='USDT'||!rule.isSpotTradingAllowed||account.canTrade===false)throw new TradeError('pair_unavailable');
 const lot=rule.filters.find((f:any)=>f.filterType==='LOT_SIZE'),tick=rule.filters.find((f:any)=>f.filterType==='PRICE_FILTER'),notional=rule.filters.find((f:any)=>f.filterType==='NOTIONAL'||f.filterType==='MIN_NOTIONAL');
 if(!lot||!tick||!notional)throw new TradeError('pair_rules_missing');
 const price=quantize(Number(side==='BUY'?book.askPrice:book.bidPrice)*(side==='BUY'?1.005:.995),tick.tickSize,side==='BUY');
 const quantity=quantize(side==='BUY'?amount/Number(price):amount,lot.stepSize),value=Number(quantity)*Number(price);
 if(!(Number(quantity)>0)||Number(quantity)<Number(lot.minQty)||Number(quantity)>Number(lot.maxQty)||value<Number(notional.minNotional)||(notional.maxNotional&&Number(notional.maxNotional)>0&&value>Number(notional.maxNotional)))throw new TradeError('below_or_above_exchange_limits');
 const ceiling=Number(Deno.env.get('MANUAL_ORDER_MAX_USDT')??100);if(!Number.isFinite(ceiling)||value>ceiling)throw new TradeError('order_limit_100_usdt');
 const free=(asset:string)=>Number(account.balances?.find((b:any)=>b.asset===asset)?.free??0);
 if(side==='BUY'?free('USDT')<value:free(rule.baseAsset)<Number(quantity))throw new TradeError('insufficient_available_balance');
 return {symbol,asset:rule.baseAsset,side,type:'LIMIT',timeInForce:'IOC',price,quantity,value,feeIncluded:false,
   explanation:'Orden limitada IOC: puede ejecutarse parcialmente o no ejecutarse. El límite protege el precio, no garantiza la ejecución. Las comisiones se liquidan aparte.'};
}
const clientId=(id:string)=>'ca_'+id.replaceAll('-','');
function receipt(r:any){return {symbol:r.symbol,orderId:r.orderId,clientOrderId:r.clientOrderId,status:r.status,executedQty:r.executedQty,cumulativeQuote:r.cummulativeQuoteQty,fills:Array.isArray(r.fills)?r.fills.map((f:any)=>({price:f.price,qty:f.qty,commission:f.commission,commissionAsset:f.commissionAsset})):[]};}
export async function handle(req:Request){
 try{
  if(Deno.env.get('SB_REGION')!=='sa-east-1')throw new TradeError('wrong_region',503);
  if(req.method!=='POST')throw new TradeError('POST_required',405);
  if(req.headers.get('origin')&&req.headers.get('origin')!==SITE)throw new TradeError('forbidden',403);
  const token=req.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];if(!token)throw new TradeError('unauthorized',401);
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(v=>v.toString(16).padStart(2,'0')).join('');
  const auth=await record('trade_server');if(!auth?.enabled||auth.hash!==hash)throw new TradeError('unauthorized',401);
  const input=await req.json(),user=req.headers.get('x-panel-user-id');if(!user||user.length>200)throw new TradeError('owner_required',401);
  if(input.action==='status'){
   if(!Deno.env.get('BINANCE_TRADE_API_KEY')||!Deno.env.get('BINANCE_TRADE_PRIVATE_KEY'))return Response.json({enabled:false,error:'trading_not_configured'},{headers});
   const [permissions,account]=await Promise.all([signed('/sapi/v1/account/apiRestrictions'),signed('/api/v3/account')]);
   if(!limitedPermissions(permissions))throw new TradeError('permissions_not_limited');
   return Response.json({enabled:account.canTrade===true,mode:'manual_spot_ioc',permissionsChecked:true,withdrawals:false,transfers:false,maxOrderUsdt:Number(Deno.env.get('MANUAL_ORDER_MAX_USDT')??100)}, {headers});
  }
  if(input.action==='recent')return Response.json(await rpc('bot_trade',{p_action:'recent',p_data:{user}}),{headers});
  if(input.action==='preview'){
   const intent=await preview(input),created=await rpc('bot_trade',{p_action:'create',p_data:{user,intent}});
   if(created.blocked)throw new TradeError('previous_order_unresolved',409);return Response.json(created,{headers});
  }
  const id=String(input.id);if(!/^[a-f0-9-]{36}$/.test(id))throw new TradeError('invalid_intent');
  if(input.action==='order_status'){
   const saved=await rpc('bot_trade',{p_action:'status',p_data:{id,user}});if(!saved)throw new TradeError('not_found',404);
   if(['unknown','submitting'].includes(saved.status)){
    try{const result=receipt(await signed('/api/v3/order',{symbol:saved.intent.symbol,origClientOrderId:clientId(id)}));
     await rpc('bot_trade',{p_action:'finish',p_data:{id,user,status:'confirmed',result}});return Response.json({status:'confirmed',result},{headers});
    }catch{throw new TradeError('check_binance_before_retry',409);}
   }return Response.json({status:saved.status,result:saved.result},{headers});
  }
  if(input.action!=='execute'||input.confirm!==true)throw new TradeError('manual_confirmation_required');
  const job=await rpc('bot_trade',{p_action:'claim',p_data:{id,user}});if(!job)throw new TradeError('preview_expired',409);
  if(!job.claimed)return Response.json({status:job.status,result:job.result},{headers});
  const i=job.intent;
  try{
   const result=receipt(await signed('/api/v3/order',{symbol:i.symbol,side:i.side,type:'LIMIT',timeInForce:'IOC',quantity:i.quantity,price:i.price,newOrderRespType:'FULL',newClientOrderId:clientId(id)},'POST'));
   await rpc('bot_trade',{p_action:'finish',p_data:{id,user,status:'confirmed',result}});
   try{await rpc('bot_ext',{p_action:'alert',p_data:{key:'manual_order:'+id,message:`Orden manual ${i.side==='BUY'?'de compra':'de venta'} ${i.asset}: estado ${result.status}; cantidad ejecutada ${result.executedQty}. Revisá el comprobante en la app o Binance.`,cooldown:1440}});}catch{/* receipt remains available */}
   return Response.json({status:'confirmed',result},{headers});
  }catch(e){
   // A network failure after submission is ambiguous. Never submit this intent again.
   const status=e instanceof TradeError&&e.status<500?'rejected':'unknown';
   await rpc('bot_trade',{p_action:'finish',p_data:{id,user,status,result:{error:status==='unknown'?'check_binance_before_retry':(e as TradeError).code}}});
   throw new TradeError(status==='unknown'?'check_binance_before_retry':(e as TradeError).code,status==='unknown'?409:400);
  }
 }catch(e){return Response.json({error:e instanceof TradeError?e.code:'temporarily_unavailable'},{status:e instanceof TradeError?e.status:503,headers});}
}
Deno.serve(handle);
