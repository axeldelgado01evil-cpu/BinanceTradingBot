// Historical technical-rule validation only. No account data or execution.
export type Bar={time:number;end:number;open:number;high:number;low:number;close:number;volume:number};
const weights:Record<string,number>={BTCUSDT:20,ETHUSDT:12.5,SOLUSDT:7.5};
function ema(v:number[],p:number){let n=v[0];return v.map((x,i)=>i?(n=x*2/(p+1)+n*(1-2/(p+1))):n);}
function rsi(v:number[]){let g=0,l=0;for(let i=1;i<v.length;i++){const d=v[i]-v[i-1];if(i<=14){g+=Math.max(d,0)/14;l+=Math.max(-d,0)/14;}else{g=(g*13+Math.max(d,0))/14;l=(l*13+Math.max(-d,0))/14;}}return l?100-100/(1+g/l):g?100:50;}
export function historicalSignal(four:Bar[],daily:Bar[],index:number,warmup=80){
  const slice=four.slice(Math.max(0,index-warmup+1),index+1),last=slice.at(-1)!;
  const days=daily.filter(d=>d.end<=last.end).slice(-60);
  if(slice.length<80||days.length<50)return null;
  const close=slice.map(b=>b.close),dclose=days.map(b=>b.close),avg=(v:number[])=>v.reduce((s,n)=>s+n,0)/v.length;
  const fast=ema(close,12),slow=ema(close,26),line=fast.map((n,i)=>n-slow[i]);
  const h=line.at(-1)!-ema(line,9).at(-1)!;
  const up=last.close>avg(close.slice(-20))&&dclose.at(-1)!>avg(dclose.slice(-50));
  const down=last.close<avg(close.slice(-20))&&dclose.at(-1)!<avg(dclose.slice(-50));
  const ratio=last.volume/avg(slice.slice(-21,-1).map(b=>b.volume)),strength=rsi(close);
  const atr=avg(slice.slice(-14).map((b,i)=>{const p=slice[slice.length-15+i].close;return Math.max(b.high-b.low,Math.abs(b.high-p),Math.abs(b.low-p));}));
  return {candidate:up&&strength>=45&&strength<=65&&h>0&&ratio>=1.1,exit:down&&h<0,
    support:Math.min(...slice.slice(-20).map(b=>b.low)),atr,rsi:strength,histogram:h};
}
export function runHistorical(data:Record<string,{four:Bar[];daily:Bar[]}>,start:number,end:number,fee=.001,slippage=.0005,warmup=80){
  const symbols=Object.keys(weights),base=data.BTCUSDT.four.filter(b=>b.time>=start&&b.end<=end);
  const maps=Object.fromEntries(symbols.map(s=>[s,new Map(data[s].four.map((b,i)=>[b.time,{b,i}]))]));
  let cash=100,peak=100,maxDrawdown=0,paused=false,entries=0,wins=0,losses=0,fees=0,missing=0;
  const positions:Record<string,{qty:number;cost:number;stop:number;target:number}>={},curve:{time:number;value:number}[]=[],closed:number[]=[];
  const benchmark:Record<string,number>={};let reserve=100,lastHold=100;
  function sell(s:string,p:number){const pos=positions[s],gross=pos.qty*p*(1-slippage),commission=gross*fee,result=gross-commission-pos.cost;
    cash+=gross-commission;fees+=commission;closed.push(result);if(result>0)wins++;else losses++;delete positions[s];}
  for(const bar of base){
    if(symbols.some(s=>!maps[s].has(bar.time))){missing++;continue;}
    const active=Object.fromEntries(symbols.map(s=>[s,maps[s].get(bar.time)!]));
    if(!Object.keys(benchmark).length)for(const s of symbols){benchmark[s]=weights[s]/(active[s].b.open*(1+slippage)*(1+fee));reserve-=weights[s];}
    // Signals use only the previous CLOSED candle; entries occur at the next open.
    const signals=Object.fromEntries(symbols.map(s=>[s,active[s].i>0?historicalSignal(data[s].four,data[s].daily,active[s].i-1,warmup):null]));
    for(const s of symbols){const p=positions[s],b=active[s].b;if(!p)continue;
      if(b.open<=p.stop||signals[s]?.exit)sell(s,b.open);else if(b.open>=p.target)sell(s,p.target);}
    const opening=cash+symbols.reduce((sum,s)=>sum+(positions[s]?.qty??0)*active[s].b.open,0);if(opening<=95)paused=true;
    if(!paused)for(const s of symbols){const signal=signals[s],b=active[s].b;if(positions[s]||!signal?.candidate)continue;
      const entry=b.open*(1+slippage),stop=Math.max(signal.support*.995,entry-2*signal.atr);
      if(stop>=entry||(entry-stop)/entry>.12)continue;
      const budget=Math.min(weights[s],Math.max(0,cash-20),entry/(entry-stop));if(budget<5)continue;
      const qty=budget/(entry*(1+fee));positions[s]={qty,cost:budget,stop,target:entry+2*(entry-stop)};cash-=budget;fees+=qty*entry*fee;entries++;}
    // When both levels occur inside one OHLC bar, assume the stop occurs first.
    for(const s of symbols){const p=positions[s],b=active[s].b;if(!p)continue;if(b.low<=p.stop)sell(s,p.stop);else if(b.high>=p.target)sell(s,p.target);}
    const value=cash+symbols.reduce((sum,s)=>sum+(positions[s]?.qty??0)*active[s].b.close,0);
    lastHold=reserve+symbols.reduce((sum,s)=>sum+(benchmark[s]??0)*active[s].b.close,0);if(value<=95)paused=true;
    peak=Math.max(peak,value);maxDrawdown=Math.max(maxDrawdown,(peak-value)/peak*100);curve.push({time:bar.end,value});
  }
  const final=curve.at(-1)?.value??100,hold=lastHold;
  const positive=closed.filter(n=>n>0).reduce((a,b)=>a+b,0),negative=-closed.filter(n=>n<0).reduce((a,b)=>a+b,0);
  return {start,end,fee,slippage,warmup,initial:100,final,returnPercent:final-100,benchmark:hold,benchmarkReturnPercent:hold-100,
    excessReturn:final-hold,maxDrawdown,entries,closedTrades:closed.length,wins,losses,winRate:closed.length?wins/closed.length*100:null,
    profitFactor:negative>0?positive/negative:null,fees,missingBars:missing,paused,openPositions:Object.keys(positions),
    evidence:closed.length<30?'insufficient_sample':'historical_only',curve:curve.filter((_,i)=>i%6===0||i===curve.length-1)};
}
export function historicalReport(data:Record<string,{four:Bar[];daily:Bar[]}>){
  const first=Math.max(...Object.values(data).map(d=>d.four[300]?.time??Infinity)),last=Math.min(...Object.values(data).map(d=>d.four.at(-1)!.end));
  if(!Number.isFinite(first)||last-first<90*86400000)throw new Error('At least 90 days after warmup are required');
  const a=first+(last-first)*.6,b=first+(last-first)*.8;
  const segments={development:runHistorical(data,first,a),validation:runHistorical(data,a,b),holdout:runHistorical(data,b,last)};
  const stress=runHistorical(data,b,last,.002,.002),warmup=runHistorical(data,b,last,.001,.0005,200);
  return {generated:Date.now(),version:'technical-v1',segments,stress,warmup,
    assumptions:['Reglas técnicas fijas; no optimización sobre el período final.','Sin reconstrucción histórica del contraste CoinMarketCap/CoinGecko ni de filtros de memecoins.',
      'Entrada al próximo open, stop antes que objetivo si ambos se tocan, comisiones y deslizamiento supuestos.',
      'Comparación con comprar y mantener las mismas asignaciones (20 BTC, 12.5 ETH, 7.5 SOL, 60 USDT de reserva).',
      'La simulación usa OHLC 4h; no reproduce precios intrabar exactos ni garantiza ejecución. Resultados pasados no garantizan futuros.']};
}
