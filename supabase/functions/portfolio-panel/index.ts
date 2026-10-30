import {ledger,portfolioRisk,DEFAULT_LIMITS} from '../market-bot/analytics.ts';
// Custom read-only capability. Binance requests below are strictly GET account reads.
export const ORIGIN='https://cripto-alertas-axel-panel.ablegoat69.chatgpt.site';
export async function handle(req:Request){
  const origin=req.headers.get('origin');
  const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Vary':'Origin',...(origin===ORIGIN?{'Access-Control-Allow-Origin':ORIGIN}:{})};
  if(req.method==='OPTIONS')return new Response(null,{status:origin===ORIGIN?204:403,headers:{...headers,'Access-Control-Allow-Methods':'GET','Access-Control-Allow-Headers':'Authorization','Access-Control-Max-Age':'600'}});
  if(origin&&origin!==ORIGIN)return Response.json({error:'forbidden_origin'},{status:403,headers});
  if(req.method!=='GET')return Response.json({error:'read_only'},{status:405,headers});
  const url=new URL(req.url);
  // Health contains only booleans/timestamps, never values, holdings or secrets.
  if(url.pathname.endsWith('/health')){
    try{const h=await rpc('bot_ext',{p_action:'get',p_data:{key:'health'}});
      const at=Number(h?.reportSent??0),healthy=at>0&&Date.now()-at<2700000;
      return Response.json({healthy,lastReport:at,version:h?.version??'unknown'}, {status:healthy?200:503,headers});
    }catch{return Response.json({healthy:false},{status:503,headers});}
  }
  const token=req.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if(!token)return Response.json({error:'session_required'},{status:401,headers});
  const days=Number(url.searchParams.get('days')??30);if(![7,30,90].includes(days))return Response.json({error:'invalid_range'},{status:400,headers});
  try{
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(v=>v.toString(16).padStart(2,'0')).join('');
    const data=await rpc('bot_panel',{p_hash:hash,p_days:days});
    if(!data)return Response.json({error:'session_expired'},{status:401,headers});
    let failed=false;
    const cached=data.records.panel_live;
    if(!cached||Date.now()-cached.at>=60000){
      try{
        const config=await rpc('bot_live_claim',{});
        if(config){
          const live=await liveAccount(config,data.records);
          await rpc('bot_ext',{p_action:'set',p_data:{key:'panel_live',value:live}});data.records.panel_live=live;
        }
      }catch{failed=true;}
    }
    const latest=data.records.panel_live;
    if(latest&&Date.now()-latest.at<180000){data.records.portfolio=latest.portfolio;data.records.ledger=latest.ledger;data.records.risk=latest.risk;}
    delete data.records.panel_live;
    data.live={balanceAt:data.records.portfolio?.at??null,balanceRefreshSeconds:60,unavailable:failed};
    return Response.json(data,{headers});
  }catch{return Response.json({error:'temporarily_unavailable'},{status:503,headers});}
}
async function get(url:string,headers:Record<string,string>={}){
  const r=await fetch(url,{method:'GET',headers,signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error('Read unavailable');return r.json();
}
async function liveAccount(config:Record<string,string>,records:any){
  const clock=await get('https://api.binance.com/api/v3/time');
  const query=new URLSearchParams({timestamp:String(clock.serverTime),recvWindow:'10000'}).toString();
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(config.BINANCE_API_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(query)))).map(v=>v.toString(16).padStart(2,'0')).join('');
  const [account,quotes,stored,sync,flows]=await Promise.all([
    get('https://api.binance.com/api/v3/account?'+query+'&signature='+signature,{'X-MBX-APIKEY':config.BINANCE_API_KEY}),
    get('https://data-api.binance.vision/api/v3/ticker/price'),
    rpc('bot_ext',{p_action:'fills'}),rpc('bot_ext',{p_action:'get',p_data:{key:'history_sync'}}),rpc('bot_ext',{p_action:'get',p_data:{key:'flows'}}),
  ]);
  if(!Array.isArray(account.balances)||!Array.isArray(quotes))throw new Error('Invalid account');
  const prices=Object.fromEntries(quotes.map((q:any)=>[q.symbol,Number(q.price)]));
  const holdings=account.balances.map((b:any)=>({asset:String(b.asset),amount:Number(b.free)+Number(b.locked),price:b.asset==='USDT'?1:prices[b.asset+'USDT']??null})).filter((b:any)=>b.amount>0&&Number.isFinite(b.amount)&&/^[A-Z0-9]{1,20}$/.test(b.asset));
  const moved=new Set((flows?.movements??[]).map((m:any)=>m.asset+'USDT'));
  const complete=stored?.truncated?[]:Object.keys(sync??{}).filter(s=>sync[s]?.complete&&!moved.has(s));
  const accounting={...ledger(stored?.rows??[],holdings,complete),at:Date.now(),scopeNotice:'Pares USDT con historial sincronizado. Compras nuevas pueden quedar pendientes hasta el siguiente informe; no incluye Earn ni Futures.',estimatedFeeConversions:(stored?.rows??[]).some((f:any)=>f.feeEstimated)};
  const previous=records.panel_live?.risk??records.risk;
  const risk={...portfolioRisk(holdings,previous,{...DEFAULT_LIMITS,...records.limits}),at:Date.now()};
  const at=Date.now();return {at,portfolio:{at,total:risk.total,holdings,complete:risk.complete},ledger:accounting,risk};
}
async function rpc(name:string,args:Record<string,unknown>){
  const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const response=await fetch(Deno.env.get('SUPABASE_URL')+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error('Backend unavailable');return response.json();
}
Deno.serve(handle);
