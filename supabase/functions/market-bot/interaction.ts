import {ext,exchangeRules,reviewContract} from './enhancements.ts';
import {DEFAULT_LIMITS,correlation} from './analytics.ts';
type Deps={json:(url:string,options?:RequestInit)=>Promise<any>;rpc:(name:string,args:Record<string,unknown>)=>Promise<any>};
export const PANEL='https://cripto-alertas-axel-panel.ablegoat69.chatgpt.site';
const n=(v:any)=>typeof v==='number'&&Number.isFinite(v)?new Intl.NumberFormat('es-UY',{maximumFractionDigits:2}).format(v):'sin datos';
const when=(v:number)=>v?new Intl.DateTimeFormat('es-UY',{timeZone:'America/Montevideo',dateStyle:'short',timeStyle:'short'}).format(new Date(v)):'sin lectura';
export const HELP='Consultas de mercado: escribí tu pregunta.\n/cartera · saldos Spot\n/rendimiento · costos y ganancias conocidas\n/riesgo · exposición y comisiones\n/evaluacion · pruebas de las reglas\n/estado · fuentes y funcionamiento\n/seguir ADA · agregar a observación\n/dejar ADA · quitar de observación\n/alertas · umbrales y configuración\n/contrato solana DIRECCION · revisar riesgos\n/panel · enlace privado de 15 minutos\n/olvidar · borrar contexto de conversación\n\nInformes cada 15 min; revisión de precios cada 2 min, sujeta al servidor. Hora de Uruguay. Solo lectura: no compra ni vende. Groq recibe datos públicos y tus preguntas, nunca saldos ni claves.';
export const validationText=(v:any)=>{
  const h=v?.segments?.holdout;
  return h?`Evaluación técnica histórica · ${when(v.generated)}\nPeríodo final reservado: ${n(h.returnPercent)} %; comprar y mantener la misma distribución: ${n(h.benchmarkReturnPercent)} %.\nCaída máxima: ${n(h.maxDrawdown)} %. ${h.closedTrades} operaciones cerradas.\nCostos supuestos: comisión ${n(h.fee*100)} % y deslizamiento ${n(h.slippage*100)} % por lado.\nEstas reglas NO demostraron una ventaja en el período final. Solo se evalúa el componente técnico: no se reconstruye el contraste histórico CMC/CoinGecko. No es una probabilidad de ganar. Ver sensibilidad y períodos en /panel.`:'Todavía no se cargó la evaluación histórica. Las señales no están validadas.';
};
export const performanceText=(l:any)=>!l?'Todavía no hay historial procesado. Esperá al próximo informe.':[
  `Resultados Spot · ${when(l.at)} (Uruguay)`,
  ...l.rows.slice(0,8).map((r:any)=>`${r.asset}: costo medio ${n(r.averageCost)}; resultado vendido ${n(r.realized)}; sin vender ${n(r.unrealized)} USDT.${r.coverage==='complete'?'':' Historial/costo incompleto: no se inventa ganancia.'}`),
  l.rows.length?'':'No hay posiciones ni operaciones en los pares sincronizados.',
  l.complete?`Total de esos pares: vendido ${n(l.realized)}; sin vender ${n(l.unrealized)} USDT.`:'Cobertura parcial: los importes desconocidos no se suman como ganancias.',
  l.estimatedFeeConversions?'Algunas comisiones se estiman con la vela histórica de 1 minuto.':'',l.scopeNotice,
].filter(Boolean).join('\n');
export async function localCommand(question:string,d:Deps,panelEnabled=false):Promise<string|null>{
  const [command,...args]=question.trim().split(/\s+/),cmd=command.toLowerCase().replace(/@\w+$/,'');
  const get=(key:string)=>ext(d,'get',{key});
  if(['/start','/help','/ayuda'].includes(cmd))return HELP;
  if(cmd==='/olvidar'){await ext(d,'forget');return 'Borré el contexto breve de tus preguntas. Las próximas consultas empiezan sin esa memoria.';}
  if(cmd==='/rendimiento')return performanceText(await get('ledger'));
  if(cmd==='/evaluacion'){
    const [v,f]=await Promise.all([get('validation'),get('forward_evaluation')]);
    return validationText(v)+`\nSeguimiento nuevo: ${f?.completed??0} señales con observación posterior de 24 h. ${(f?.completed??0)<30?'Muestra todavía insuficiente.':'Es seguimiento observacional, no prueba de ganancias reales.'}`;
  }
  if(cmd==='/estado'){
    const h=await get('health');return h?`Estado · Uruguay\nInforme enviado: ${when(h.reportSent)}\nÚltimo análisis: ${when(h.marketAt)}\nBinance: ${h.accountOk?'lectura disponible':'lectura pendiente/no disponible'}\nFuentes: ${Object.entries(h.sources??{}).map(([k,v])=>k+': '+v).join(' · ')}\nIA: ${h.aiOk?'último informe con explicación':'sin explicación en el último informe'}\nAlertas de precios: revisión cada 2 min; sin garantía de entrega inmediata.\nSupabase y Groq con cuotas gratuitas; sin habilitar pagos.`:'Aún no hay diagnóstico guardado.';
  }
  if(cmd==='/riesgo'){
    const [r,f,c]=await Promise.all([get('risk'),get('fees'),get('correlations')]);
    return r?`Riesgo Spot · ${when(r.at)}\n${r.weights.map((p:any)=>p.asset+': '+n(p.weight)+' %').join(' · ')}\nCaída desde máximo con cantidades iguales: ${n(r.drawdown)} %.${r.baselineReset?' Base reiniciada por cambio de cantidades/cobertura.':''}\n${r.notices.join('\n')||'No se superaron los umbrales configurados.'}\nCorrelación de retornos diarios (30 días): ${Object.entries(c?.pairs??{}).map(([k,v])=>k+' '+n(v)).join(' · ')||'todavía sin datos'}. Cercana a 1 significa que suelen moverse juntas.\n${Object.entries(f?.symbols??{}).map(([s,v]:[string,any])=>`${s}: mínimo ${n(v.minNotional)} USDT; compra/venta taker ${v.unknown?'desconocida':n(v.buyTaker*100)+' / '+n(v.sellTaker*100)+' %'}`).join('\n')}\nComisiones actuales sin asumir descuentos BNB; no son precios de ejecución ni pérdidas máximas garantizadas.`:'Esperando la primera lectura de cartera.';
  }
  if(cmd==='/seguir'||cmd==='/dejar'){
    const asset=args[0]?.toUpperCase();if(!asset||!/^[A-Z0-9]{1,20}$/.test(asset))return 'Usá /seguir ADA o /dejar ADA.';
    const list:string[]=await get('watchlist')??['BTC','ETH','SOL'];
    if(cmd==='/seguir'){
      const rules=await exchangeRules(d);if(rules[asset+'USDT']?.status!=='TRADING')return 'No encontré un par Spot USDT activo con ese símbolo en Binance.';
      if(!list.includes(asset)&&list.length>=8)return 'Podés seguir hasta 8 monedas. Quitá una con /dejar SIMBOLO.';
    }
    const next=cmd==='/seguir'?[...new Set([...list,asset])]:list.filter(a=>a!==asset);
    await ext(d,'set',{key:'watchlist',value:next});return 'Observación: '+(next.join(', ')||'sin extras')+'. Se actualiza en el próximo informe. BTC, ETH y SOL siguen en el análisis central.';
  }
  if(cmd==='/alertas'){
    const limits={...DEFAULT_LIMITS,...await get('limits')};
    const names:Record<string,string>={movimiento:'move',spread:'spread',concentracion:'concentration',caida:'drawdown',espera:'cooldownMinutes'};
    if(args.length){const field=names[args[0].toLowerCase()],value=Number(args[1]?.replace(',','.'));
      const ranges:Record<string,number[]>={move:[1,30],spread:[.1,5],concentration:[20,100],drawdown:[1,50],cooldownMinutes:[5,1440]};
      if(!field||!Number.isFinite(value)||value<ranges[field][0]||value>ranges[field][1])return 'Ejemplos: /alertas movimiento 3 (1–30 %) · spread 0.5 (0.1–5 %) · concentracion 60 (20–100 %) · caida 10 (1–50 %) · espera 60 (5–1440 min).';
      limits[field]=field==='cooldownMinutes'?Math.round(value):value;await ext(d,'set',{key:'limits',value:limits});
    }
    return `Umbrales: movimiento ${limits.move} % en ventanas de ~15 min; spread ${limits.spread} %; concentración ${limits.concentration} %; caída ${limits.drawdown} % con cantidades iguales. Repetición por tipo/activo: cada ${limits.cooldownMinutes} min como máximo.\nRevisión de precios cada 2 min. Saldos de la última lectura de 15 min. /alertas movimiento 4 cambia un umbral. No ejecuta stops ni operaciones.`;
  }
  if(cmd==='/contrato'){
    try{const r=await reviewContract(args[0]?.toLowerCase(),args[1],d);return `GoPlus · ${r.chain}\n${r.address}\n${r.state==='risk'?'Banderas de riesgo':r.state==='reviewed'?'Sin las banderas consultadas':'Revisión incompleta'}\n${r.reasons.join('\n')}\nDiez mayores registros: ${n(r.top10)} % (pueden incluir pools).\n${when(r.checked)}. No es una auditoría ni garantiza que puedas vender.`;}catch{return 'Usá /contrato ethereum 0x...; redes: ethereum, bsc, base o solana. Copiá el contrato exacto de una fuente oficial.';}
  }
  if(cmd==='/panel'){
    if(!panelEnabled)return 'El panel está preparado; falta activar su acceso privado. El resto de las funciones ya funciona desde Telegram.';
    const token=Array.from(crypto.getRandomValues(new Uint8Array(32))).map(v=>v.toString(16).padStart(2,'0')).join('');
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(v=>v.toString(16).padStart(2,'0')).join('');
    await ext(d,'panel_issue',{hash});return `Tu panel privado (15 minutos):\n${PANEL}/#session=${token}\nNo compartas este enlace: permite consultar tus saldos e historial mientras esté vigente. No permite operar.`;
  }
  if(cmd.startsWith('/'))return 'Comando no reconocido. /ayuda muestra las opciones.';
  return null;
}
export function privateQuestion(q:string){return /\b(mi[s]?\s+(saldo[s]?|fondo[s]?|cuenta|cartera|cripto[s]?|ganancia[s]?|compra[s]?|inversion(?:es)?)|saldo|cartera|portafolio|deposit[eé]|reti[rro]|invert[ií]|gan[eé]|perd[ií])\b|cu[aá]nto tengo|\d+[.,]?\d*\s*(usd[t]?|d[oó]lares|pesos)/i.test(q);}
export function safeMemory(rows:any[]){return (Array.isArray(rows)?rows:[]).filter(r=>typeof r.question==='string'&&typeof r.answer==='string'&&!privateQuestion(r.question)&&!/[A-Za-z0-9_-]{32,}/.test(r.question+r.answer)).slice(-2).map(r=>({question:r.question.slice(0,250),answer:r.answer.slice(0,250)}));}
export function monitorEvents(old:any,current:any[],snapshot:any,limits:any,now=Date.now()){
  const events:{key:string;message:string}[]=[];
  for(const t of current){const symbol=t.symbol,asset=symbol.slice(0,-4),p=Number(t.price??((Number(t.bidPrice)+Number(t.askPrice))/2));if(!(p>0))continue;
    const before=old?.prices?.[symbol],elapsed=now-Number(old?.at);
    if(before>0&&elapsed>=60000&&elapsed<=1800000){const change=(p/before-1)*100;if(Math.abs(change)>=limits.move)events.push({key:'move:'+symbol,message:`${asset}: ${change.toFixed(2)} % en ~${Math.round(elapsed/60000)} min. Movimiento observado; no es una orden.`});}
    const bid=Number(t.bidPrice),ask=Number(t.askPrice),spread=(ask-bid)/p*100;
    if(bid>0&&ask>=bid&&spread>=limits.spread)events.push({key:'spread:'+symbol,message:`${asset}: spread observado ${spread.toFixed(2)} %. Comprar y vender puede costar más; los precios cambian.`});
    const levels=snapshot?.assets?.find((a:any)=>a.asset===asset);
    if(before>0&&elapsed<=1800000&&levels&&now-snapshot.at<=1800000){
      if(before>=levels.support&&p<levels.support)events.push({key:'support:'+symbol,message:`${asset} cruzó por debajo del soporte de la última lectura (${n(levels.support)} USDT).`});
      if(before<=levels.resistance&&p>levels.resistance)events.push({key:'resistance:'+symbol,message:`${asset} cruzó por encima de la resistencia de la última lectura (${n(levels.resistance)} USDT). Falta confirmar volumen y continuidad.`});
    }
  }return events;
}
export async function monitorTick(d:Deps,snapshot:any,now=Date.now()){
  const state=await ext(d,'get',{key:'monitor'})??{};if(now-(state.checked??0)<110000)return;
  const limits={...DEFAULT_LIMITS,...await ext(d,'get',{key:'limits'})};
  const watch:string[]=await ext(d,'get',{key:'watchlist'})??[];
  const symbols=[...new Set(['BTCUSDT','ETHUSDT','SOLUSDT',...watch.map(a=>a+'USDT')])].slice(0,11);
  try{
    const rows=await d.json('https://data-api.binance.vision/api/v3/ticker/bookTicker?symbols='+encodeURIComponent(JSON.stringify(symbols)));
    const recent=Array.isArray(rows)?rows:[],prices=Object.fromEntries(recent.map((t:any)=>[t.symbol,(Number(t.bidPrice)+Number(t.askPrice))/2]));
    for(const e of monitorEvents(state,recent,snapshot,limits,now))await ext(d,'alert',{...e,cooldown:limits.cooldownMinutes});
    // Fixed ~15-minute comparison baseline, not a cumulative moving baseline.
    await ext(d,'set',{key:'monitor',value:!state.at||now-state.at>=900000?{...state,at:now,checked:now,prices}:{...state,checked:now}});
  }catch{await ext(d,'alert',{key:'price_source',message:'No pude actualizar los precios en la revisión intermedia. Los datos anteriores pueden estar desactualizados.',cooldown:60});}
  const h=await ext(d,'get',{key:'health'});
  if(h?.reportSent&&now-h.reportSent>2100000)await ext(d,'alert',{key:'missing_report',message:'El último informe tiene más de 35 minutos. Hay una demora o falla; no uses datos antiguos para operar.',cooldown:60});
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Montevideo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date(now));
  const part=(type:string)=>parts.find(p=>p.type===type)?.value,date=part('year')+'-'+part('month')+'-'+part('day');
  if(part('hour')==='09'&&state.daily!==date){
    const l=await ext(d,'get',{key:'ledger'}),f=await ext(d,'get',{key:'forward_evaluation'});
    await ext(d,'alert',{key:'daily:'+date,message:`Resumen diario · Uruguay\n${l?.complete?'Resultado de pares cubiertos: vendido '+n(l.realized)+'; sin vender '+n(l.unrealized)+' USDT.':'Resultado de cartera: cobertura aún parcial o sin compras.'}\nSeguimiento de señales: ${f?.completed??0} observaciones completas. Las reglas técnicas siguen sin ventaja histórica demostrada. /rendimiento /riesgo /evaluacion`,cooldown:1440});
    const latest=await ext(d,'get',{key:'monitor'});await ext(d,'set',{key:'monitor',value:{...latest,daily:date}});
  }
}
export async function recordMarket(snapshot:any,d:Deps){
  const [portfolio,previous]=await Promise.all([ext(d,'get',{key:'portfolio'}),ext(d,'get',{key:'forward_evaluation'})]);
  await ext(d,'set',{key:'markets',value:snapshot});
  await ext(d,'sample',{at:snapshot.at,market:snapshot,...(portfolio&&snapshot.at-portfolio.at<300000?{portfolio}:{})});
  const observations:any[]=previous?.observations??[];
  for(const o of observations)if(o.return24h===undefined&&snapshot.at-o.at>=86400000){
    const p=snapshot.assets.find((a:any)=>a.asset===o.asset);
    if(p&&snapshot.at-o.at<=88200000){o.return24h=(p.usdt/o.entry-1)*100;o.observedAt=snapshot.at;}else o.missing=true;
  }
  for(const a of snapshot.assets)if(a.signal&&!observations.some(o=>o.asset===a.asset&&snapshot.at-o.at<86400000))observations.push({asset:a.asset,at:snapshot.at,entry:a.usdt});
  const kept=observations.filter(o=>snapshot.at-o.at<90*86400000).slice(-1000),done=kept.filter(o=>Number.isFinite(o.return24h));
  await ext(d,'set',{key:'forward_evaluation',value:{at:snapshot.at,observations:kept,completed:done.length,missing:kept.filter(o=>o.missing).length,mean24h:done.length?done.reduce((s,o)=>s+o.return24h,0)/done.length:null,notice:'Variación bruta 24 h después de señales, máximo una por activo/día. No son operaciones, no incluye comisiones, muestra observacional.'}});
  const history=await ext(d,'history'),core=['BTC','ETH','SOL'],returns:Record<string,number[]>={BTC:[],ETH:[],SOL:[]};
  const days=new Map<string,any>();
  for(const row of history){const values=Object.fromEntries((row.value?.assets??[]).filter((a:any)=>core.includes(a.asset)).map((a:any)=>[a.asset,a.usdt]));
    if(core.every(a=>values[a]>0))days.set(new Date(row.at).toISOString().slice(0,10),values);}
  const ordered=[...days.entries()].sort(([a],[b])=>a.localeCompare(b)).slice(-31);
  for(let i=1;i<ordered.length;i++)if(Date.parse(ordered[i][0])-Date.parse(ordered[i-1][0])===86400000)for(const a of core)returns[a].push(ordered[i][1][a]/ordered[i-1][1][a]-1);
  const cached=await ext(d,'get',{key:'correlations'});
  if(!cached||snapshot.at-cached.at>86400000){
    // Seed with aligned public closed daily candles; new account need not wait a month.
    try{
      const daily=await Promise.all(core.map(a=>d.json('https://data-api.binance.vision/api/v3/klines?symbol='+a+'USDT&interval=1d&limit=32')));
      const maps=daily.map(rows=>new Map(rows.filter((r:any)=>Number(r[6])<snapshot.at).map((r:any)=>[Number(r[0]),Number(r[4])])));
      const times=[...maps[0].keys()].filter(t=>maps.every(m=>m.has(t))).sort((a:any,b:any)=>a-b) as number[];
      for(const a of core)returns[a]=[];
      for(let i=1;i<times.length;i++)if(times[i]-times[i-1]===86400000)core.forEach((a,j)=>returns[a].push(Number(maps[j].get(times[i]))/Number(maps[j].get(times[i-1]))-1));
    }catch{/* use only actual stored observations */}
    await ext(d,'set',{key:'correlations',value:{at:snapshot.at,samples:returns.BTC.length,pairs:{'BTC/ETH':correlation(returns.BTC,returns.ETH),'BTC/SOL':correlation(returns.BTC,returns.SOL),'ETH/SOL':correlation(returns.ETH,returns.SOL)}}});
  }
}
