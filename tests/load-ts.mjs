import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
export async function moduleURL(url){
 let code=stripTypeScriptTypes(await readFile(url,'utf8'));
 for(const match of [...code.matchAll(/from\s+['"](.+?\.ts)['"]/g)]){
   const child=await moduleURL(new URL(match[1],url));code=code.replace(match[0],`from '${child}'`);
 }
 return 'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
}
