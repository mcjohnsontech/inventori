import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { database } from '../apps/api/src/database.js';
import { applyIdentityBackfill, isolatedBackfillUrl, planIdentityBackfill } from '../apps/api/src/identity-backfill.js';

const args=process.argv.slice(2);
function arg(name:string){const i=args.indexOf(name);return i<0?undefined:args[i+1];}
const allowed=new Set(['--apply','--plan','--out','--origin','--actor','--kind','--limit','--after']);
for(let i=0;i<args.length;i++){if(!allowed.has(args[i]!))throw Error('Unknown option');if(args[i]!=='--apply')i++;}
const url=isolatedBackfillUrl(process.env.IDENTITY_BACKFILL_DATABASE_URL);
const target=`${url.protocol}//${url.host}${url.pathname}`;
const db=database(url.toString());
try{
 if(args.includes('--apply')){
  if(!arg('--plan'))throw Error('Apply requires an explicitly saved dry-run --plan file');
  const bytes=await readFile(arg('--plan')!);if(bytes.length>100000)throw Error('Plan too large');
  console.info(JSON.stringify(await applyIdentityBackfill(db,target,JSON.parse(bytes.toString('utf8'))),null,2));
 }else{
  if(!arg('--out')||!arg('--origin')||!arg('--actor')||!['PRODUCT','LOT'].includes(arg('--kind')??''))throw Error('Dry run: --origin UUID --actor UUID --kind PRODUCT|LOT --out plan.json [--limit 100] [--after UUID]');
  const plan=await planIdentityBackfill(db,target,arg('--origin')!,arg('--actor')!,arg('--kind')! as 'PRODUCT'|'LOT',Number(arg('--limit')??100),arg('--after')??null);
  await writeFile(arg('--out')!,JSON.stringify(plan,null,2),{flag:'wx'});
  console.info(JSON.stringify({dryRun:true,subjects:plan.ids.length,nextCursor:plan.nextCursor,planFile:arg('--out'),message:'No codes reserved or data written. Review this isolated fixture plan before --apply.'}));
 }
}finally{await db.$disconnect();}
