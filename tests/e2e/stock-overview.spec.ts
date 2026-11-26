import {test,expect} from '@playwright/test';
import { choose } from './ui.js';
import {randomUUID} from 'node:crypto';
test('stock overview separates variants, aggregates supplier/batch stock and links exact lots',async({page})=>{
 test.setTimeout(180000);await page.goto('/');await page.getByLabel('Email address').fill('e2e-admin@dayari.test');await page.getByLabel('Password',{exact:true}).fill(process.env.E2E_PASSWORD!);const login=page.waitForResponse(r=>r.url().endsWith('/api/sessions')&&r.request().method()==='POST');await page.getByRole('button',{name:'Sign in',exact:true}).click();expect((await login).status()).toBe(200);
 async function post(path:string,data:unknown){const r=await page.request.post('/api/'+path,{headers:{Origin:'http://127.0.0.1:3101','Idempotency-Key':randomUUID()},data});expect(r.status(),await r.text()).toBe(201);return r.json();}
 const cat=await(await page.request.get('/api/catalogue')).json();const source=async()=>post('catalogue/supplier-setups',{supplier:{name:`Overview ${randomUUID().slice(0,8)}`},location:{registryId:cat.locations.find((x:{code:string})=>x.code==='LG').id}});const a=await source(),b=await source();const product=await post('catalogue/product-setups',{sourceId:a.source.id,product:{name:`Overview notebook ${randomUUID().slice(0,8)}`},variants:['Red','Brown','Green'].map(name=>({name,suffix:name.toUpperCase(),attributes:[{attribute:'Colour',value:name}]}))});
 const latest=await(await page.request.get('/api/catalogue')).json(),parent=latest.products.find((x:{id:string})=>x.id===product.product.id);const red=parent.variants.find((x:{name:string})=>x.name==='Red');const brown=parent.variants.find((x:{name:string})=>x.name==='Brown');const redSku=latest.skus.find((x:{variantId:string})=>x.variantId===red.id),brownSku=latest.skus.find((x:{variantId:string})=>x.variantId===brown.id);const sourced=await post('catalogue/product-setups',{sourceId:b.source.id,product:{id:parent.id},variants:[{variantId:red.id,suffix:'RED'}]});
 const first=await post('receipts',{sourceId:a.source.id,deliveredOn:'2020-01-01',lines:[{skuId:redSku.id,usableQuantity:3,damagedQuantity:1,damageReason:'Synthetic cover damage'},{skuId:brownSku.id,usableQuantity:0,damagedQuantity:2,damageReason:'Synthetic damaged arrivals'}]});await post('receipts',{sourceId:a.source.id,deliveredOn:'2020-01-02',lines:[{skuId:redSku.id,usableQuantity:5,damagedQuantity:0}]});await post('receipts',{sourceId:b.source.id,deliveredOn:'2020-01-03',lines:[{skuId:sourced.skus[0].id,usableQuantity:2,damagedQuantity:0}]});
 await page.reload();
 // Overview is a summary; detailed availability now lives in the stock sheet.
 const stock=await(await page.request.get('/api/stock')).json();
 const usable=stock.lots.reduce((total:bigint,lot:{usable:string})=>total+BigInt(lot.usable),0n);
 await expect(page.locator('[aria-label="Stock summary"] strong').first()).toHaveText(String(usable));
 await expect(page.getByRole('table',{name:'Product stock availability'})).toHaveCount(0);
 for(const width of [320,390,768,1024,1440]){
  await page.setViewportSize({width,height:900});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(width===320||width===1440)await page.screenshot({path:`test-results/slices/overview-${width}.png`});
 }
 await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Stock',exact:true}).click();
 await page.getByLabel('Search inventory',{exact:true}).fill(product.product.productCode);
 const grouped=page.locator('details').filter({has:page.locator('summary').filter({hasText:parent.name})});
 await expect(grouped).toHaveCount(1);await expect(grouped.locator('summary')).toContainText('10 usable');await expect(grouped.locator('summary')).toContainText('3 damaged');
 await grouped.locator('summary').click();
 const table=page.getByRole('table',{name:`Variants and lots for ${parent.name}`,exact:true});
 await expect(table.locator('tbody > tr')).toHaveCount(4);
 await expect(table).not.toContainText('Green'); // Registered, never received; no fabricated lot.
 const redRows=table.locator('tbody > tr').filter({hasText:'Red'}),brownRow=table.locator('tbody > tr').filter({hasText:'Brown'});
 await expect(redRows).toHaveCount(3);await expect(table).toContainText(redSku.fullCode);await expect(table).toContainText(sourced.skus[0].fullCode);
 await expect(brownRow.locator('[data-label=Usable]')).toHaveText('0');await expect(brownRow.locator('[data-label=Damaged]')).toHaveText('2');
 const firstLot=first.lines.find((x:{skuId:string})=>x.skuId===redSku.id);
 await table.getByRole('button',{name:`Details for lot ${firstLot.lotCode}`,exact:true}).click();
 const drawer=page.getByRole('dialog',{name:`${parent.name} · Red`,exact:true});await expect(drawer).toContainText('3 usable');await expect(drawer).toContainText('1 damaged');
 await drawer.getByRole('button',{name:'Close lot details',exact:true}).click();await expect(page.getByLabel('Search inventory',{exact:true})).toHaveValue(product.product.productCode);
 await choose(page,'Availability','out');await expect(table.locator('tbody > tr')).toHaveCount(1);await expect(table).toContainText('Brown');
 await choose(page,'Availability','all');await choose(page,'Supplier source',b.source.id);await expect(table.locator('tbody > tr')).toHaveCount(1);await expect(table).toContainText(sourced.skus[0].fullCode);
 await page.goto(`/#inventory/${parent.id}/${firstLot.lotId}`);await expect(drawer).toBeVisible();await page.reload();await expect(drawer).toBeVisible();await expect(drawer).toContainText('3 usable');
});
