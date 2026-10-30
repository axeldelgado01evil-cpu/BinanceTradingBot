import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
let analytics=stripTypeScriptTypes(await readFile(new URL('../supabase/functions/market-bot/analytics.ts',import.meta.url),'utf8'));
const names=[...analytics.matchAll(/export\s+(?:function|const)\s+(\w+)/g)].map(m=>m[1]);analytics=analytics.replace(/\bexport\s+/g,'');
let panel=stripTypeScriptTypes(await readFile(new URL('../supabase/functions/portfolio-panel/index.ts',import.meta.url),'utf8'));
panel=panel.replace(/import\s*\{([^}]+)\}\s*from\s*['"][^'"]+['"];?/,(_,items)=>`const {${items}}=__analytics;`);
await mkdir(new URL('../.cache/deploy/',import.meta.url),{recursive:true});
await writeFile(new URL('../.cache/deploy/portfolio-panel.js',import.meta.url),`const __analytics=(()=>{${analytics}\nreturn {${names.join(',')}};})();\n${panel}`);
console.log('Bundled read-only live panel');
