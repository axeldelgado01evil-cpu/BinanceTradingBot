// One-time import. Replace the deployment placeholders after committing the workflow.
// Keep gateway JWT verification enabled. No credential values are returned or logged.
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@6.2.13';
const ISSUER='https://token.actions.githubusercontent.com';
const JWKS=createRemoteJWKSet(new URL(ISSUER+'/.well-known/jwks'));
const AUDIENCE='https://qqdyagzvjshhiiqkzfat.supabase.co/import-bot-secrets';
const EXPECTED_SHA='__MIGRATION_SHA__';
const DEADLINE='__IMPORT_DEADLINE__';
const REPOSITORY='axeldelgado01evil-cpu/BinanceTradingBot';
Deno.serve(async(req:Request)=>{
  if(req.method!=='POST')return Response.json({error:'POST required'},{status:405});
  if(!Number.isFinite(Date.parse(DEADLINE))||Date.now()>Date.parse(DEADLINE))return Response.json({error:'import closed'},{status:410});
  try {
    const {payload}=await jwtVerify(req.headers.get('X-GitHub-Token')??'',JWKS,{
      issuer:ISSUER,audience:AUDIENCE,algorithms:['RS256'],maxTokenAge:'5 minutes',clockTolerance:5,
      requiredClaims:['exp','iat','nbf','sub','repository_id','workflow_sha'],
    });
    if(payload.repository!==REPOSITORY||payload.repository_id!=='1426455305'
      ||payload.ref!=='refs/heads/main'||payload.event_name!=='workflow_dispatch'
      ||payload.workflow_ref!==REPOSITORY+'/.github/workflows/migrate-supabase.yml@refs/heads/main'
      ||payload.workflow_sha!==EXPECTED_SHA||payload.sha!==EXPECTED_SHA
      ||payload.actor!=='axeldelgado01evil-cpu')return Response.json({error:'untrusted workflow'},{status:403});
    const bodyText=await req.text();
    if(bodyText.length>100000)return Response.json({error:'payload too large'},{status:413});
    const body=JSON.parse(bodyText),names=['TELEGRAM_BOT_TOKEN','TELEGRAM_CHAT_ID','BINANCE_API_KEY','BINANCE_API_SECRET'];
    if(Object.keys(body.config??{}).length!==4||names.some(n=>typeof body.config[n]!=='string'||!body.config[n].trim()||body.config[n].length>1024))
      return Response.json({error:'missing credentials'},{status:400});
    if(body.state?.version!==1||!Number.isFinite(body.state.cash)||!body.state.positions||!Array.isArray(body.state.trades))
      return Response.json({error:'invalid paper state'},{status:400});
    const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const response=await fetch(Deno.env.get('SUPABASE_URL')!+'/rest/v1/rpc/bot_import_once',{
      method:'POST',headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},
      body:JSON.stringify({p_config:body.config,p_state:body.state,p_cron_jwt:service}),signal:AbortSignal.timeout(15000),
    });
    if(!response.ok){await response.body?.cancel();return Response.json({error:'storage failed'},{status:500});}
    if(await response.json()!==true)return Response.json({error:'already imported'},{status:409});
    return Response.json({status:'imported',credentials:4,paper_state:true});
  }catch{return Response.json({error:'import rejected'},{status:403});}
});
