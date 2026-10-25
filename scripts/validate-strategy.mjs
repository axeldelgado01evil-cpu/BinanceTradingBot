import {readFile,writeFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
const src=stripTypeScriptTypes(await readFile(new URL('../supabase/functions/market-bot/backtest.ts',import.meta.url),'utf8'));
const {historicalReport}=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
const data=JSON.parse(await readFile(new URL('../.cache/validation/candles.json',import.meta.url),'utf8'));
const report=historicalReport(data);
await writeFile(new URL('../.cache/validation/report.json',import.meta.url),JSON.stringify(report));
console.log(JSON.stringify(Object.fromEntries(Object.entries(report.segments).map(([k,v])=>[k,{trades:v.closedTrades,return:v.returnPercent,benchmark:v.benchmarkReturnPercent,drawdown:v.maxDrawdown,evidence:v.evidence}]))));
