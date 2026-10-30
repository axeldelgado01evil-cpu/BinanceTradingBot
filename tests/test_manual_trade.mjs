import assert from 'node:assert/strict';
import {moduleURL} from './load-ts.mjs';
globalThis.Deno={serve:()=>{}};
globalThis.fetch=()=>{throw Error('Retired endpoint must not call Binance or the database');};
const {handle}=await import(await moduleURL(new URL('../supabase/functions/manual-trade/index.ts',import.meta.url)));
for(const method of ['GET','POST','DELETE']){
 const r=handle(new Request('https://example/manual-trade',{method}));
 assert.equal(r.status,410);assert.equal((await r.json()).enabled,false);
}
console.log('Retired trading endpoint: all requests disabled, no outbound calls');
