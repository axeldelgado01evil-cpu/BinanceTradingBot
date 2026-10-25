import {normalizeFill,ledger,portfolioRisk,DEFAULT_LIMITS,securityReview,type Holding,type Fill} from './analytics.ts';
type Deps={json:(url:string,options?:RequestInit)=>Promise<any>;rpc:(name:string,args:Record<string,unknown>)=>Promise<any>};
type Config=Record<string,string>;
export const ext=(d:Deps,action:string,data:Record<string,unknown>={})=>d.rpc('bot_ext',{p_action:action,p_data:data});
const PUBLIC='https://data-api.binance.vision';
const PATHS=new Set(['/api/v3/myTrades','/api/v3/account/commission','/sapi/v1/capital/deposit/hisrec','/sapi/v1/capital/withdraw/history','/sapi/v1/asset/transfer']);
export function readOnlyBinance(config:Config,d:Deps){
  let offset:number|undefined;
  return async(path:string,params:Record<string,string>={})=>{
    if(!PATHS.has(path))throw new Error('Read-only endpoint not allowed');
    if(offset===undefined){const clock=await d.json('https://api.binance.com/api/v3/time');offset=Number(clock.serverTime)-Date.now();}
    const query=new URLSearchParams({...params,timestamp:String(Math.round(Date.now()+offset)),recvWindow:'10000'}).toString();
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(config.BINANCE_API_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    const signature=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(query)))).map(v=>v.toString(16).padStart(2,'0')).join('');
    return d.json('https://api.binance.com'+path+'?'+query+'&signature='+signature,{method:'GET',headers:{'X-MBX-APIKEY':config.BINANCE_API_KEY}});
  };
}
export async function exchangeRules(d:Deps){
  const cached=await ext(d,'get',{key:'exchange_rules'});
  if(cached&&Date.now()-cached.at<86400000)return cached.symbols;
  const info=await d.json(PUBLIC+'/api/v3/exchangeInfo'),symbols:Record<string,any>={};
  for(const s of info.symbols??[])if(s.quoteAsset==='USDT'&&/^[A-Z0-9]{1,20}USDT$/.test(s.symbol)){
    const notional=s.filters?.find((f:any)=>f.filterType==='NOTIONAL'||f.filterType==='MIN_NOTIONAL');
    const lot=s.filters?.find((f:any)=>f.filterType==='LOT_SIZE');
    symbols[s.symbol]={asset:s.baseAsset,status:s.status,minNotional:Number(notional?.minNotional??0),minQty:Number(lot?.minQty??0),step:String(lot?.stepSize??'')};
  }
  await ext(d,'set',{key:'exchange_rules',value:{at:Date.now(),symbols}});return symbols;
}
export async function refreshPortfolio(holdings:Holding[],config:Config,d:Deps){
  const rules=await exchangeRules(d),sync=await ext(d,'get',{key:'history_sync'})??{},watch=await ext(d,'get',{key:'watchlist'})??['BTC','ETH','SOL'];
  const core=['BTCUSDT','ETHUSDT','SOLUSDT'],extra=[...new Set([...holdings.map(h=>h.asset),...watch].map(a=>a+'USDT').filter(s=>rules[s]&&!core.includes(s)))];
  const rotating=extra.length?extra[(sync.rotation??0)%extra.length]:null;
  const symbols=[...new Set([...core,...extra.slice(0,2),...(rotating?[rotating]:[])])].filter(s=>rules[s]);
  const read=readOnlyBinance(config,d);const errors:string[]=[];
  const previousFlows=await ext(d,'get',{key:'flows'});
  if(!previousFlows||Date.now()-previousFlows.at>3600000){
    const movements:any[]=[],unavailable:string[]=[];let truncated=false;
    const startTime=String(Date.now()-30*86400000),endTime=String(Date.now());
    await Promise.all([
      (async()=>{try{const rows=await read('/sapi/v1/capital/deposit/hisrec',{startTime,endTime,limit:'100'});
        if(!Array.isArray(rows))throw new Error('Invalid deposits');truncated||=rows.length>=100;
        for(const r of rows)if(Number(r.status)===1&&Number(r.walletType)===0)movements.push({id:'deposit:'+String(r.id),type:'deposit',asset:String(r.coin),amount:Number(r.amount),at:Number(r.completeTime||r.insertTime)});
      }catch{unavailable.push('depositos');}})(),
      (async()=>{try{const rows=await read('/sapi/v1/capital/withdraw/history',{startTime,endTime,limit:'100'});
        if(!Array.isArray(rows))throw new Error('Invalid withdrawals');truncated||=rows.length>=100;
        for(const r of rows)if(Number(r.status)===6&&Number(r.walletType)===0)movements.push({id:'withdraw:'+String(r.id),type:'withdrawal',asset:String(r.coin),amount:Number(r.amount),fee:Number(r.transactionFee??0),at:Date.parse(String(r.applyTime).replace(' ','T').replace(/Z?$/,'Z'))});
      }catch{unavailable.push('retiros');}})(),
      ...['FUNDING_MAIN','MAIN_FUNDING'].map(type=>(async()=>{try{
        const result=await read('/sapi/v1/asset/transfer',{type,startTime,endTime,size:'100',current:'1'});
        if(!Array.isArray(result.rows))throw new Error('Invalid transfers');truncated||=Number(result.total)>result.rows.length;
        for(const r of result.rows)if(r.status==='CONFIRMED')movements.push({id:'transfer:'+String(r.tranId),type:type==='FUNDING_MAIN'?'funding_in':'funding_out',asset:String(r.asset),amount:Number(r.amount),at:Number(r.timestamp)});
      }catch{unavailable.push(type);}})()),
    ]);
    await ext(d,'set',{key:'flows',value:{at:Date.now(),since:Number(startTime),movements:movements.filter(m=>/^[A-Z0-9]{1,20}$/.test(m.asset)&&Number.isFinite(m.at)&&m.amount>0).sort((a,b)=>b.at-a.at),unavailable,truncated,
      notice:'Movimientos informativos Spot/fondeo de los últimos 30 días. No son ganancias; no se reconstruye todo el flujo de otros productos ni el costo de cripto depositada.'}});
  }
  // Bounded incremental backfill: one page per followed symbol, never an unbounded scan.
  for(let start=0;start<symbols.length;start+=3)await Promise.all(symbols.slice(start,start+3).map(async symbol=>{
    try{
      const old=sync[symbol]??{next:0,complete:false},raw=await read('/api/v3/myTrades',{symbol,fromId:String(old.next),limit:'500'});
      if(!Array.isArray(raw))throw new Error('Invalid trades');
      const fills=raw.map(r=>normalizeFill(r,symbol)).filter(Boolean) as Fill[];
      await ext(d,'ingest',{fills});
      const next=raw.length?Math.max(...raw.map(r=>Number(r.id)))+1:old.next;
      if(!Number.isSafeInteger(next))throw new Error('Invalid trade cursor');
      const rejected=(old.rejected??0)+raw.length-fills.length;
      sync[symbol]={next,complete:raw.length<500&&rejected===0,at:Date.now(),rejected};
    }catch{errors.push(symbol);if(sync[symbol])sync[symbol].complete=false;}
  }));
  sync.rotation=(sync.rotation??0)+1;await ext(d,'set',{key:'history_sync',value:sync});
  const stored=await ext(d,'fills'),fills:Fill[]=stored?.rows??[];
  // Foreign-asset fees are valued using a historical minute candle, never today's price.
  const conversions=await ext(d,'get',{key:'fee_conversions'})??{};
  const repairs:Fill[]=[];
  for(const f of fills.filter(f=>f.feeUsdt===null&&/^[A-Z0-9]{1,20}$/.test(f.feeAsset)&&rules[f.feeAsset+'USDT']).slice(0,2)){
    const minute=Math.floor(f.time/60000)*60000,key=f.feeAsset+':'+minute;
    try{
      let conversion=conversions[key];
      if(!conversion){const rows=await d.json(PUBLIC+'/api/v3/klines?'+new URLSearchParams({symbol:f.feeAsset+'USDT',interval:'1m',startTime:String(minute),endTime:String(minute+59999),limit:'1'}));
        if(!rows[0]||Number(rows[0][6])>=Date.now())continue;conversion=Number(rows[0][4]);if(!(conversion>0))continue;conversions[key]=conversion;}
      f.feeUsdt=f.fee*conversion;(f as any).feeEstimated=true;repairs.push(f);
    }catch{/* no invented fee conversion */}
  }
  if(repairs.length){await ext(d,'repair_fees',{fills:repairs});await ext(d,'set',{key:'fee_conversions',value:Object.fromEntries(Object.entries(conversions).slice(-1000))});}
  const complete=stored?.truncated?[]:Object.keys(sync).filter(s=>sync[s]?.complete);
  const flows=await ext(d,'get',{key:'flows'});
  // Matching end quantities do not prove a cost basis after external asset movements.
  for(const move of flows?.movements??[])if(move.asset!=='USDT'){
    const i=complete.indexOf(move.asset+'USDT');if(i>=0)complete.splice(i,1);
  }
  const accounting={...ledger(fills,holdings,complete),at:Date.now(),scope:symbols,estimatedFeeConversions:fills.some((f:any)=>f.feeEstimated),errors,
    scopeNotice:'Resultados de pares USDT sincronizados; no es una declaración fiscal ni incluye todos los productos de Binance.'};
  const limits={...DEFAULT_LIMITS,...await ext(d,'get',{key:'limits'})},previous=await ext(d,'get',{key:'risk'}),risk={...portfolioRisk(holdings,previous,limits),at:Date.now()};
  const portfolio={at:Date.now(),total:risk.total,holdings,complete:risk.complete};
  await Promise.all([ext(d,'set',{key:'ledger',value:accounting}),ext(d,'set',{key:'risk',value:risk}),ext(d,'set',{key:'portfolio',value:portfolio})]);
  // Current commissions inform cost estimates; they are not assumed to be historical fee rates.
  const feeCache=await ext(d,'get',{key:'fees'});
  if(!feeCache||Date.now()-feeCache.at>86400000){
    const fees:any={at:Date.now(),symbols:{}};
    await Promise.all(core.map(async symbol=>{try{const r=await read('/api/v3/account/commission',{symbol});
      const rate=(side:string)=>['standardCommission','specialCommission','taxCommission'].reduce((v,k)=>v+Number(r[k]?.taker??0)+Number(r[k]?.[side]??0),0);
      fees.symbols[symbol]={...rules[symbol],buyTaker:rate('buyer'),sellTaker:rate('seller'),discount:r.discount??null};
    }catch{fees.symbols[symbol]={...rules[symbol],unknown:true};}}));
    await ext(d,'set',{key:'fees',value:fees});
  }
  for(const notice of risk.notices)await ext(d,'alert',{key:'portfolio:'+notice.split(' ')[0],message:notice,cooldown:limits.cooldownMinutes});
  return {accounting,risk,portfolio};
}
export async function reviewContract(chain:string,address:string,d:Deps){
  const chains:Record<string,string>={ethereum:'1',bsc:'56',base:'8453'};
  if(!(chain==='solana'?/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address):chains[chain]&&/^0x[0-9a-fA-F]{40}$/.test(address)))throw new Error('Invalid chain or contract');
  const cache=await ext(d,'get',{key:'security'})??{},key=chain+':'+address;
  if(cache[key]&&Date.now()-cache[key].checked<3600000)return cache[key];
  let review;
  try{const url=chain==='solana'?'https://api.gopluslabs.io/api/v1/solana/token_security?contract_addresses='+address
    :'https://api.gopluslabs.io/api/v1/token_security/'+chains[chain]+'?contract_addresses='+address;
    review=securityReview(await d.json(url),chain,address);
  }catch{review={state:'unverified',reasons:['Servicio no disponible; no se considera revisado.'],top10:null,checked:Date.now()};}
  cache[key]={...review,chain,address};await ext(d,'set',{key:'security',value:Object.fromEntries(Object.entries(cache).slice(-30))});return cache[key];
}
