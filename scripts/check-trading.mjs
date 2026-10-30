// Read-only production connection check. It never invokes preview or execute.
process.stdin.setRawMode?.(true);process.stdin.resume();process.stdout.write('Ready for hidden trading connection credential\n');
const key=await new Promise(resolve=>{let line='';const read=bytes=>{for(const c of bytes.toString()){if(c==='\n'||c==='\r'){process.stdin.off('data',read);process.stdin.setRawMode?.(false);process.stdin.pause();resolve(line);return;}if(c==='\u0003')process.exit(1);line+=c;}};process.stdin.on('data',read);});
const url='https://qqdyagzvjshhiiqkzfat.supabase.co/functions/v1/manual-trade';
const r=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+key,'x-region':'sa-east-1','x-panel-user-id':'connection-check','Content-Type':'application/json'},body:JSON.stringify({action:'status'}),signal:AbortSignal.timeout(40000)});
const result=await r.json().catch(()=>({}));
console.log(JSON.stringify({http:r.status,enabled:result.enabled,permissionsChecked:result.permissionsChecked,mode:result.mode,withdrawals:result.withdrawals,transfers:result.transfers,maxOrderUsdt:result.maxOrderUsdt,error:result.error}));
const denied=await fetch(url,{method:'POST',headers:{'x-region':'sa-east-1','Content-Type':'application/json'},body:JSON.stringify({action:'status'})});
console.log(JSON.stringify({missingKeyStatus:denied.status}));
if(!r.ok||!result.enabled||!result.permissionsChecked||denied.status!==401)process.exitCode=1;
