// No credential required: the retired endpoint must reject every operation.
const r=await fetch('https://qqdyagzvjshhiiqkzfat.supabase.co/functions/v1/manual-trade',{method:'POST',headers:{'x-region':'sa-east-1','Content-Type':'application/json'},body:JSON.stringify({action:'status'}),signal:AbortSignal.timeout(20000)});
const d=await r.json();console.log(JSON.stringify({http:r.status,enabled:d.enabled,error:d.error}));
if(r.status!==410||d.enabled!==false||d.error!=='trading_removed')process.exitCode=1;
