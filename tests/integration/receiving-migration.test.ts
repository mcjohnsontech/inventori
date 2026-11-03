import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { expect, it } from 'vitest';
const url=process.env.TEST_DATABASE_URL;
if(!url||!new URL(url).pathname.endsWith('_test')||!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw new Error('Local *_test database required');
it('upgrades a pre-ledger database with both legacy and generated catalogue identities without rewriting them',async()=>{
 const client=new Client({connectionString:url});await client.connect();
 try{
  await client.query('BEGIN');const schema='upgrade_'+randomUUID().replaceAll('-','');await client.query(`CREATE SCHEMA "${schema}"`);await client.query(`SET LOCAL search_path TO "${schema}", public`);
  for(const name of ['202611020001_catalogue_foundation','202611020002_supplier_code_identity','202611020003_progressive_catalogue'])await client.query(await readFile(`prisma/migrations/${name}/migration.sql`,'utf8'));
  const origin=randomUUID(),product=randomUUID(),variant=randomUUID();await client.query(`INSERT INTO "OriginNode"(id,mode) VALUES ($1,'SHOP')`,[origin]);await client.query(`INSERT INTO "Product"(id,name,"originId") VALUES ($1,'Migration notebook',$2)`,[product,origin]);await client.query(`INSERT INTO "Variant"(id,"productId",name,"combinationKey","originId") VALUES ($1,$2,'Default','',$3)`,[variant,product,origin]);
  for(const [supplierCode,prefix,base] of [['CHILG','CHILG','CHILG03849'],['GEN','GENLG','GENLG00001']]){
   const supplier=randomUUID(),location=randomUUID(),source=randomUUID(),sourcing=randomUUID();
   await client.query(`INSERT INTO "Supplier"(id,name,code,"originId") VALUES ($1,$2,$3,$4)`,[supplier,supplierCode,supplierCode,origin]);
   await client.query(`INSERT INTO "SourceLocation"(id,name,"originId") VALUES ($1,'Lagos',$2)`,[location,origin]);
   await client.query(`INSERT INTO "SupplierSource"(id,"supplierId","locationId",name,code,"originId") VALUES ($1,$2,$3,'Lagos',$4,$5)`,[source,supplier,location,prefix,origin]);
   await client.query(`INSERT INTO "SupplierLocationPrefix"(id,"sourceId","registryId",code,"originId") VALUES ($1,$2,'33333333-3333-4333-8333-333333333333',$3,$4)`,[randomUUID(),source,prefix,origin]);
   await client.query(`INSERT INTO "ProductSourcing"(id,"sourceId","productId","baseCode","originId") VALUES ($1,$2,$3,$4,$5)`,[sourcing,source,product,base,origin]);
   await client.query(`INSERT INTO "SupplierVariantSku"(id,"sourcingId","variantId","productId",suffix,"fullCode","originId") VALUES ($1,$2,$3,$4,'STD',$5,$6)`,[randomUUID(),sourcing,variant,product,base+'-STD',origin]);
  }
  await client.query('SET CONSTRAINTS ALL IMMEDIATE');
  const snapshot=async()=>{const result:Record<string,unknown>={};for(const table of ['OriginNode','Supplier','SourceLocation','SupplierSource','Product','Variant','ProductSourcing','SupplierVariantSku','SupplierLocationPrefix'])result[table]=(await client.query(`SELECT * FROM "${table}" ORDER BY id`)).rows;return result;};
  const before=await snapshot();await client.query(await readFile('prisma/migrations/202611020004_receiving_ledger/migration.sql','utf8'));expect(await snapshot()).toEqual(before);
  expect((await client.query('SELECT count(*)::int AS count FROM "StockMovement"')).rows[0].count).toBe(0);
 }finally{await client.query('ROLLBACK');await client.end();}
});
