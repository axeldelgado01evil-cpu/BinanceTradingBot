// Public gateway, custom short-lived capability. No account/order API calls here.
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
    return Response.json(data,{headers});
  }catch{return Response.json({error:'temporarily_unavailable'},{status:503,headers});}
}
async function rpc(name:string,args:Record<string,unknown>){
  const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const response=await fetch(Deno.env.get('SUPABASE_URL')+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error('Backend unavailable');return response.json();
}
Deno.serve(handle);
