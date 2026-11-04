// Public sources only; never reads account credentials or sends Telegram messages.
import {writeFile,mkdir} from 'node:fs/promises';
import {moduleURL} from '../tests/load-ts.mjs';
const {refreshLaboratory}=await import(await moduleURL(new URL('../supabase/functions/market-bot/laboratory.ts',import.meta.url)));
const records={};
const deps={json:async(url,options={})=>{const r=await fetch(url,{...options,signal:AbortSignal.timeout(14000)});if(!r.ok)throw Error('Public source unavailable');return r.json();},rpc:async(_,{p_action:a,p_data:d})=>{if(a==='get')return records[d.key];if(a==='set'){records[d.key]=d.value;return true;}if(a==='alert')return true;throw Error('Unsupported action');}};
const laboratory=await refreshLaboratory(deps,null);
await mkdir(new URL('../.cache/deploy/',import.meta.url),{recursive:true});
await writeFile(new URL('../.cache/deploy/laboratory-preview.json',import.meta.url),JSON.stringify({records:{laboratory},series:[],readOnly:true}));
console.log(JSON.stringify({scanned:laboratory.scanned,candidates:laboratory.candidates.length,sourceOk:laboratory.sourceOk,states:laboratory.candidates.map(c=>c.state),modules:laboratory.modules.map(m=>m.id)}));
