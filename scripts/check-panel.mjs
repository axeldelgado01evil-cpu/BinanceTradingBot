// Read credential from hidden stdin; print only verification metadata, never financial values.
process.stdin.setRawMode?.(true);process.stdin.resume();process.stdout.write('Ready for hidden connection credential\n');
const key=await new Promise(resolve=>{let line='';const read=bytes=>{for(const c of bytes.toString()){if(c==='\n'||c==='\r'){process.stdin.off('data',read);process.stdin.setRawMode?.(false);process.stdin.pause();resolve(line);return;}if(c==='\u0003')process.exit(1);line+=c;}};process.stdin.on('data',read);});
const root='https://qqdyagzvjshhiiqkzfat.supabase.co/functions/v1/portfolio-panel';
const headers={Authorization:'Bearer '+key,'x-region':'sa-east-1'};
const response=await fetch(root,{headers,signal:AbortSignal.timeout(40000)});
if(!response.ok){console.log(JSON.stringify({status:response.status}));process.exitCode=1;}else{
 const d=await response.json();console.log(JSON.stringify({status:response.status,readOnly:d.readOnly,balanceAgeSeconds:d.live?.balanceAt?Math.round((Date.now()-d.live.balanceAt)/1000):null,liveUnavailable:d.live?.unavailable,sections:Object.keys(d.records??{}),historyPoints:d.series?.length??0}));
}
const denied=await fetch(root,{headers:{'x-region':'sa-east-1'}});console.log(JSON.stringify({missingKeyStatus:denied.status}));
