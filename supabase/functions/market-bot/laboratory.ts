import {ext,reviewContract} from './enhancements.ts';
type Deps={json:(url:string,options?:RequestInit)=>Promise<any>;rpc:(name:string,args:Record<string,unknown>)=>Promise<any>};
const HOUR=3600000;
const number=(v:any)=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
export const validToken=(chain:string,address:string)=>chain==='solana'?/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address):['ethereum','base','bsc'].includes(chain)&&/^0x[0-9a-fA-F]{40}$/.test(address);
const canonical=(chain:string,address:string)=>chain==='solana'?address:address.toLowerCase();
const key=(chain:string,address:string)=>chain+':'+canonical(chain,address);
export function normalizePairs(pairs:any[],targets:any[],now=Date.now()){
 const pools:any[]=[];
 for(const p of pairs){
  const chain=String(p.chainId),address=String(p.baseToken?.address??'');
  if(!validToken(chain,address)||!targets.some(t=>key(t.chain,t.address)===key(chain,address)))continue;
  if(!['SOL','WSOL','USDT','USDC','WETH','WBNB'].includes(p.quoteToken?.symbol)||!/^[A-Za-z0-9]{20,90}$/.test(p.pairAddress??''))continue;
  const price=number(p.priceUsd);if(price===null||price<=0)continue;
  const created=number(p.pairCreatedAt),age=created!==null&&created>0&&created<=now?(now-created)/HOUR:null;
  const raw=String(p.baseToken?.symbol??''),symbol=/^[A-Za-z0-9._-]{1,15}$/.test(raw)?raw:address.slice(0,8);
  const liquidity=number(p.liquidity?.usd),volume=number(p.volume?.h24),h1=number(p.priceChange?.h1),day=number(p.priceChange?.h24),fdv=number(p.fdv);
  const buys=number(p.txns?.h1?.buys),sells=number(p.txns?.h1?.sells),flags:string[]=[];
  if(liquidity===null||liquidity<100000)flags.push('Liquidez menor a 100.000 USD o desconocida.');
  if(volume===null||volume<250000)flags.push('Volumen 24 h menor a 250.000 USD o desconocido.');
  if(age===null||age<24)flags.push('Pool de menos de 24 h o antigüedad desconocida.');
  if(buys===null||sells===null||buys<1||sells<1)flags.push('Sin actividad reciente de compra y venta comprobable.');
  if(day===null||Math.abs(day)>100)flags.push('Movimiento 24 h extremo o desconocido.');
  if(liquidity!==null&&liquidity>0&&volume!==null&&volume/liquidity>20)flags.push('Rotación volumen/liquidez elevada; no demuestra demanda orgánica.');
  if(fdv!==null&&liquidity!==null&&liquidity>0&&fdv/liquidity>50)flags.push('Valoración muy alta respecto a la liquidez.');
  pools.push({key:key(chain,address),chain,address:canonical(chain,address),pair:p.pairAddress,symbol,price,liquidity,volume,age,h1,day,buys,sells,fdv,boosted:Number(p.boosts?.active??0)>0,
    url:'https://dexscreener.com/'+chain+'/'+p.pairAddress,flags,basic:flags.length===0,checked:now});
 }
 return pools;
}
export function followObservations(previous:any[],pools:any[],now=Date.now()){
 const rows=previous.filter(o=>now-o.at<=7*24*HOUR).map(o=>({...o}));
 for(const o of rows){
  const p=pools.find(p=>p.chain===o.chain&&p.pair===o.pair);
  for(const [suffix,horizon,tolerance]of [['1h',HOUR,20*60000],['24h',24*HOUR,30*60000]] as const){
   const field='return'+suffix,missing='missing'+suffix,elapsed=now-o.at;
   if(o[field]!==undefined||o[missing])continue;
   if(elapsed>=horizon&&elapsed<=horizon+tolerance&&p&&p.price>0){o[field]=(p.price/o.entry-1)*100;o['observed'+suffix]=now;}
   else if(elapsed>horizon+tolerance)o[missing]=true;
  }
 }
 return rows;
}
export const observationStats=(rows:any[],suffix:string)=>{
 const done=rows.filter(o=>Number.isFinite(o['return'+suffix]));
 return {completed:done.length,mean:done.length?done.reduce((s,o)=>s+o['return'+suffix],0)/done.length:null,missing:rows.filter(o=>o['missing'+suffix]).length};
};
export async function refreshLaboratory(d:Deps,snapshot:any,now=Date.now()){
 const previous=await ext(d,'get',{key:'laboratory'});
 if(previous?.at&&now-previous.at<14*60000)return previous;
 const targets:any[]=[],sources:Record<string,string>={};
 try{
  const profiles=await d.json('https://api.dexscreener.com/token-profiles/latest/v1');
  if(!Array.isArray(profiles))throw Error('Invalid profiles');
  for(const p of profiles){const chain=String(p.chainId),address=String(p.tokenAddress);
   if(validToken(chain,address)&&!targets.some(t=>key(t.chain,t.address)===key(chain,address)))targets.push({chain,address:canonical(chain,address)});
   if(targets.length===18)break;
  }sources.profiles='ok';
 }catch{sources.profiles='no disponible';}
 const scanned=targets.length,observers=(previous?.observations??[]).filter((o:any)=>validToken(o.chain,o.address)&&now-o.at<=25*HOUR&&
   ((o.return1h===undefined&&!o.missing1h&&now-o.at>=HOUR)||(o.return24h===undefined&&!o.missing24h&&now-o.at>=24*HOUR))).slice(0,8);
 for(const o of observers)if(!targets.some(t=>key(t.chain,t.address)===key(o.chain,o.address)))targets.push({chain:o.chain,address:o.address});
 const responses=await Promise.allSettled([...new Set(targets.map(t=>t.chain))].map(async chain=>{
  const rows=await d.json('https://api.dexscreener.com/tokens/v1/'+chain+'/'+targets.filter(t=>t.chain===chain).map(t=>t.address).join(','));
  if(!Array.isArray(rows))throw Error('Invalid pools');sources[chain]='ok';return rows;
 }));
 const failed=responses.filter(r=>r.status==='rejected').length;
 const pools=normalizePairs(responses.flatMap(r=>r.status==='fulfilled'?r.value:[]),targets,now);
 const unique=new Map<string,any>();
 for(const p of pools)if(targets.slice(0,scanned).some(t=>key(t.chain,t.address)===p.key)&&(!unique.has(p.key)||(p.liquidity??0)>(unique.get(p.key).liquidity??0)))unique.set(p.key,p);
 const candidates=[...unique.values()].sort((a,b)=>Number(b.basic)-Number(a.basic)||(b.liquidity??0)-(a.liquidity??0)).slice(0,12);
 const cache=await ext(d,'get',{key:'security'})??{};
 const toReview=candidates.filter(c=>c.liquidity>=10000&&(!cache[c.key]||now-cache[c.key].checked>HOUR)).slice(0,2);
 for(const c of toReview){try{cache[c.key]=await reviewContract(c.chain,c.address,d);}catch{/* unknown remains unknown */}}
 for(const c of candidates){const review=cache[c.key];c.security=review&&now-review.checked<HOUR?review:{state:'unverified',reasons:['Revisión pendiente o desactualizada.'],checked:null};
  c.state=c.flags.length||c.security.state==='risk'?'riesgo':c.security.state!=='reviewed'?'incompleto':'observacion';
  c.signal=c.state==='observacion'&&c.h1!==null&&c.h1>=2&&c.h1<=15;
 }
 const observations=followObservations(previous?.observations??[],pools,now);
 for(const c of candidates)if(c.basic&&!observations.some(o=>o.key===c.key&&now-o.at<24*HOUR))observations.push({key:c.key,chain:c.chain,address:c.address,pair:c.pair,symbol:c.symbol,at:now,entry:c.price,riskAtStart:c.state});
 const kept=observations.slice(-180),h1=observationStats(kept,'1h'),h24=observationStats(kept,'24h');
 const reviewCount=candidates.filter(c=>c.security.checked).length,signals=candidates.filter(c=>c.signal);
 const core=(snapshot?.assets??[]).filter((a:any)=>['BTC','ETH','SOL'].includes(a.asset));
 const freshMarket=Number.isFinite(snapshot?.at)&&now-snapshot.at<30*60000;
 const lab={version:1,at:now,sourceOk:sources.profiles==='ok'&&failed===0,scanned,pools:pools.length,sources,failed,candidates,observations:kept,stats:{h1,h24,pending:kept.filter(o=>o.return24h===undefined&&!o.missing24h).length},
  modules:[
   {id:'radar',name:'Radar',state:sources.profiles==='ok'?'activo':'sin datos',detail:scanned+' perfiles recientes; '+candidates.length+' tokens con precio y pool compatible.'},
   {id:'liquidity',name:'Liquidez',state:!candidates.length?'sin datos':failed?'parcial':'activo',detail:candidates.filter(c=>c.basic).length+' cumplen los filtros de actividad, antigüedad y liquidez.'},
   {id:'security',name:'Contratos',state:!candidates.length?'sin datos':reviewCount<candidates.length?'parcial':'activo',detail:reviewCount+' revisiones vigentes. Hasta 2 nuevas por ciclo; desconocido no es seguro.'},
   {id:'market',name:'Contexto',state:freshMarket?'activo':'sin datos',detail:freshMarket?core.map((a:any)=>a.asset+': '+a.trend).join(' · '):'Esperando una lectura reciente de BTC, ETH y SOL.'},
   {id:'observer',name:'Seguimiento',state:h24.completed?'activo':'acumulando',detail:h1.completed+' observaciones de 1 h y '+h24.completed+' de 24 h. No son operaciones.'}
  ],scope:'Muestra de hasta 18 perfiles recientes de DEX Screener; no cubre todo el mercado. Son tokens, no necesariamente memecoins ni activos disponibles en Binance. Promociones y boosts no aportan puntos.',
  notice:'Módulos automáticos de análisis; no son cinco IAs ni ejecutan órdenes. Variaciones brutas observadas, sin comisiones ni deslizamiento: no son ganancias reales. Datos públicos; Binance continúa en solo lectura.'};
 await ext(d,'set',{key:'laboratory',value:lab});
 if(previous?.at&&lab.sourceOk)for(const c of signals.slice(0,1))if(!previous.candidates?.some((p:any)=>p.key===c.key&&p.signal))await ext(d,'alert',{key:'laboratory:'+c.key,message:'Laboratorio: '+c.symbol+' ('+c.chain+') presenta condiciones de observación: cambio 1 h '+c.h1+' %, liquidez '+Math.round(c.liquidity)+' USD. No es una orden ni una probabilidad de ganar. /laboratorio para revisar contrato y riesgos.',cooldown:360});
 return lab;
}
export function laboratoryText(lab:any,now=Date.now()){
 if(!lab)return 'El laboratorio se está preparando. Se actualiza con el informe cada 15 minutos. Probá /laboratorio después del próximo informe.';
 const stamp=new Intl.DateTimeFormat('es-UY',{timeZone:'America/Montevideo',dateStyle:'short',timeStyle:'short'}).format(new Date(lab.at));
 const lines=['🧪 Laboratorio · '+stamp+' · Uruguay',now-lab.at>30*60000?'Datos desactualizados; no los tomes como una lectura actual.':'',...lab.modules.map((m:any)=>m.name+' · '+m.state+': '+m.detail),''];
 for(const c of lab.candidates.slice(0,4))lines.push(c.symbol+' · '+c.chain+' · '+c.state+'\nLiquidez '+Math.round(c.liquidity??0)+' USD; 24 h '+(c.day??'sin datos')+' %.\n'+(c.flags[0]??c.security.reasons[0])+'\nContrato: '+c.address);
 lines.push('',lab.scope,'Historial: '+lab.stats.h24.completed+' observaciones completas de 24 h. /panel muestra la tabla y los resultados. Sin compras, ventas ni ganancias simuladas.');
 return lines.filter(Boolean).join('\n').slice(0,3800);
}
