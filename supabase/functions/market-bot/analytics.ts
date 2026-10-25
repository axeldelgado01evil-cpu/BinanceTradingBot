// Pure calculations. No credentials, network access or order execution.
export type Fill={id:number;symbol:string;time:number;price:number;qty:number;quote:number;buy:boolean;fee:number;feeAsset:string;feeUsdt:number|null};
export type Holding={asset:string;amount:number;price:number|null};
const near=(a:number,b:number)=>Math.abs(a-b)<=Math.max(Math.abs(a),Math.abs(b),1e-10)*1e-7;
export function normalizeFill(row:any,symbol:string):Fill|null{
  const n=(x:unknown)=>Number(x),asset=symbol.slice(0,-4);
  if(!/^[A-Z0-9]{1,20}USDT$/.test(symbol)||!Number.isSafeInteger(n(row.id))||n(row.id)<0
    ||typeof row.isBuyer!=='boolean'||![row.price,row.qty,row.quoteQty,row.commission,row.time].every(x=>Number.isFinite(n(x)))
    ||n(row.price)<=0||n(row.qty)<=0||n(row.quoteQty)<=0||n(row.commission)<0||n(row.time)<=0)return null;
  const fee=n(row.commission),feeAsset=String(row.commissionAsset);
  return {id:n(row.id),symbol,time:n(row.time),price:n(row.price),qty:n(row.qty),quote:n(row.quoteQty),buy:row.isBuyer,
    fee,feeAsset,feeUsdt:fee===0?0:feeAsset==='USDT'?fee:feeAsset===asset?fee*n(row.price):null};
}
export function ledger(fills:Fill[],holdings:Holding[],completeSymbols:string[]){
  const seen=new Set<string>(),lots:Record<string,{qty:number;cost:number;realized:number;known:boolean;feesKnown:boolean;fees:number;count:number}>={};
  for(const f of [...fills].sort((a,b)=>a.time-b.time||a.id-b.id)){
    const key=f.symbol+':'+f.id;if(seen.has(key))continue;seen.add(key);
    const asset=f.symbol.slice(0,-4),l=lots[asset]??={qty:0,cost:0,realized:0,known:completeSymbols.includes(f.symbol),feesKnown:true,fees:0,count:0};
    l.count++;l.feesKnown&&=f.feeUsdt!==null;l.fees+=f.feeUsdt??0;
    if(f.buy){
      l.qty+=f.qty-(f.feeAsset===asset?f.fee:0);
      l.cost+=f.quote+(f.feeAsset===asset?0:f.feeUsdt??0);
    }else{
      const removed=f.qty+(f.feeAsset===asset?f.fee:0),proceeds=f.quote-(f.feeAsset===asset?0:f.feeUsdt??0);
      if(removed>l.qty&&!near(removed,l.qty)){l.known=false;l.qty=0;l.cost=0;continue;}
      const basis=l.qty>0?l.cost*Math.min(1,removed/l.qty):0;
      l.realized+=proceeds-basis;l.cost=Math.max(0,l.cost-basis);l.qty=Math.max(0,l.qty-removed);
    }
  }
  const assets=[...new Set([...holdings.filter(h=>h.asset!=='USDT').map(h=>h.asset),...Object.keys(lots)])];
  const rows=assets.map(asset=>{
    const h=holdings.find(h=>h.asset===asset)??{asset,amount:0,price:null},l=lots[asset];
    const matched=!!l&&near(h.amount,l.qty),known=!!l&&l.known&&l.feesKnown&&matched;
    return {asset,quantity:h.amount,value:h.amount===0?0:h.price===null?null:h.amount*h.price,
      averageCost:known&&l.qty>0?l.cost/l.qty:null,cost:known?l.cost:null,
      unrealized:known&&(h.amount===0||h.price!==null)?h.amount*(h.price??0)-l.cost:null,
      realized:known?l.realized:null,feesUsdt:l?.feesKnown?l.fees:null,trades:l?.count??0,
      coverage:known?'complete':!l?'no_history':!l.known?'incomplete_history':!l.feesKnown?'unknown_fee_conversion':'quantity_mismatch'};
  });
  const complete=rows.every(r=>r.coverage==='complete');
  return {method:'weighted_average',rows,complete,realized:complete?rows.reduce((s,r)=>s+(r.realized??0),0):null,
    unrealized:complete&&rows.every(r=>r.unrealized!==null)?rows.reduce((s,r)=>s+(r.unrealized??0),0):null,
    knownRealized:rows.reduce((s,r)=>s+(r.realized??0),0),unknownAssets:rows.filter(r=>r.coverage!=='complete').map(r=>r.asset),
    notice:'Promedio ponderado para seguimiento, no informe fiscal. Depósitos o historia incompleta no se cuentan como ganancias.'};
}
export type RiskLimits={concentration:number;drawdown:number;move:number;spread:number;cooldownMinutes:number};
export const DEFAULT_LIMITS:RiskLimits={concentration:60,drawdown:10,move:3,spread:0.5,cooldownMinutes:60};
export function portfolioRisk(holdings:Holding[],previous:{peak?:number;fingerprint?:string;complete?:boolean}|undefined,limits=DEFAULT_LIMITS){
  const priced=holdings.filter(h=>h.price!==null),total=priced.reduce((s,h)=>s+h.amount*h.price!,0);
  const fingerprint=holdings.map(h=>h.asset+':'+h.amount.toPrecision(12)).sort().join('|');
  // Cash flows change the baseline: do not treat a withdrawal as market drawdown.
  const same=previous?.fingerprint===fingerprint&&priced.length===holdings.length&&previous?.complete!==false,peak=same?Math.max(previous?.peak??total,total):total;
  const dd=peak>0?(peak-total)/peak*100:0;
  const weights=priced.map(h=>({asset:h.asset,value:h.amount*h.price!,weight:total>0?h.amount*h.price!/total*100:0})).sort((a,b)=>b.weight-a.weight);
  const notices:string[]=[];
  for(const p of weights)if(p.asset!=='USDT'&&p.weight>limits.concentration)notices.push(`${p.asset} concentra ${p.weight.toFixed(1)} % de la parte valorada (umbral ${limits.concentration} %).`);
  if(dd>=limits.drawdown)notices.push(`La cartera cayó ${dd.toFixed(1)} % desde el máximo con las mismas cantidades.`);
  if(priced.length!==holdings.length)notices.push('Hay activos sin precio: la exposición total no está completamente valorada.');
  return {total,peak,fingerprint,drawdown:dd,baselineReset:!!previous&&!same,weights,notices,complete:priced.length===holdings.length};
}
export function correlation(a:number[],b:number[]):number|null{
  if(a.length!==b.length||a.length<20)return null;
  const avg=(x:number[])=>x.reduce((s,v)=>s+v,0)/x.length,ma=avg(a),mb=avg(b);
  let xy=0,xx=0,yy=0;for(let i=0;i<a.length;i++){xy+=(a[i]-ma)*(b[i]-mb);xx+=(a[i]-ma)**2;yy+=(b[i]-mb)**2;}
  return xx>0&&yy>0?xy/Math.sqrt(xx*yy):null;
}
export type SecurityReview={state:'risk'|'unverified'|'reviewed';reasons:string[];top10:number|null;checked:number;lpLockedPercent?:number|null};
export function securityReview(data:any,chain:string,address:string,now=Date.now()):SecurityReview{
  const result=data?.result;
  const key=Object.keys(result??{}).find(k=>chain==='solana'?k===address:k.toLowerCase()===address.toLowerCase());
  const r=key?result[key]:null,reasons:string[]=[];let known=0,unknown=false;
  if(Number(data?.code)!==1||!r)return {state:'unverified',reasons:['Proveedor sin datos suficientes para este contrato.'],top10:null,checked:now};
  if(chain==='solana'){
    for(const [field,label] of [['mintable','Permiso de emitir más tokens'],['freezable','Permiso de congelar tokens'],['closable','Permiso de cerrar el programa'],['balance_mutable_authority','Permiso de modificar balances'],['transfer_fee_upgradable','Comisiones de transferencia modificables']] as const){
      const v=r[field]?.status;
      if(v==='1'||v===1)reasons.push(label);else if(v==='0'||v===0)known++;else unknown=true;
    }
    if(String(r.non_transferable)==='1')reasons.push('Token no transferible.');else if(String(r.non_transferable)!=='0')unknown=true;
    if(String(r.default_account_state)==='2')reasons.push('Cuentas nuevas congeladas por defecto.');
  }else{
    for(const [field,label] of [['is_honeypot','Restricción de venta detectada'],['cannot_sell_all','Restricción para vender toda la posición'],['is_mintable','Permiso de emitir más tokens'],['owner_change_balance','El propietario puede cambiar balances'],['transfer_pausable','Transferencias pausables']] as const){
      const v=r[field];if(v==='1')reasons.push(label);else if(v==='0')known++;else unknown=true;
    }
    if(r.is_open_source==='0'||r.is_proxy==='1'){unknown=true;reasons.push('Contrato cerrado o modificable: revisión incompleta.');}
    else if(r.is_open_source!=='1'||r.is_proxy!=='0')unknown=true;
    for(const field of ['buy_tax','sell_tax']){
      if(r[field]===undefined||r[field]===''||!Number.isFinite(Number(r[field])))unknown=true;
      else if(Number(r[field])>.1)reasons.push(`${field==='sell_tax'?'Venta':'Compra'} con tasa superior al 10 % según el proveedor.`);
    }
  }
  const holders=r.holders;
  const portions=Array.isArray(holders)?holders.map((h:any)=>Number(h.percent)).filter((v:number)=>Number.isFinite(v)&&v>=0&&v<=1).sort((a:number,b:number)=>b-a):[];
  const top10=portions.length>=10?portions.slice(0,10).reduce((s:number,v:number)=>s+v,0)*100:null;
  if(top10===null)unknown=true;else if(top10>50)reasons.push(`Los 10 mayores registros concentran ${top10.toFixed(1)} % (pueden incluir pools o contratos).`);
  const lp=Array.isArray(r.lp_holders)?r.lp_holders:[],validLp=lp.filter((h:any)=>Number.isFinite(Number(h.percent))&&Number(h.percent)>=0&&Number(h.percent)<=1);
  // Provider lock flag alone is not enough when all disclosed unlock dates have passed.
  const locked=validLp.filter((h:any)=>String(h.is_locked)==='1'&&(!Array.isArray(h.locked_detail)||h.locked_detail.length===0||h.locked_detail.some((l:any)=>Number(l.end_time??l.unlock_time)*1000>now)));
  const lpLockedPercent=validLp.length?locked.reduce((s:number,h:any)=>s+Number(h.percent)*100,0):null;
  if(lpLockedPercent===null)unknown=true;
  const extra=lpLockedPercent===null?' Bloqueo de liquidez: sin datos.':` LP marcada como bloqueada por el proveedor: ${lpLockedPercent.toFixed(1)} %; no garantiza liquidez futura.`;
  if(reasons.length)return {state:'risk',reasons:[...reasons,extra.trim()],top10,lpLockedPercent,checked:now};
  return {state:unknown||known===0?'unverified':'reviewed',reasons:[(unknown?'Quedan comprobaciones desconocidas.':'Sin las banderas consultadas; no equivale a una auditoría ni garantiza seguridad.')+extra],top10,lpLockedPercent,checked:now};
}
export function dueAlert(key:string,message:string,state:Record<string,number>,now=Date.now(),cooldownMinutes=60):{key:string;message:string}|null{
  if(now-(state[key]??0)<cooldownMinutes*60000)return null;
  return {key,message};
}
