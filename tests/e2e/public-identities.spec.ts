import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('Product and Lot Codes remain discoverable through catalogue, stock and restricted Production lookup',async({page})=>{
 test.setTimeout(120000);
 await page.goto('/');
 async function login(email:string){await page.getByLabel('Email address').fill(email);await page.getByLabel('Password',{exact:true}).fill(process.env.E2E_PASSWORD!);await page.getByRole('button',{name:'Sign in',exact:true}).click();if(!email.includes('production'))await page.getByRole('button',{name:'Catalogue',exact:true}).click();await expect(page.getByRole('button',{name:'QR lookup',exact:true})).toBeVisible();}
 await login('e2e-admin@dayari.test');
 async function post(path:string,body:unknown){const r=await page.request.post('/api/'+path,{headers:{Origin:'http://127.0.0.1:3101','Idempotency-Key':randomUUID()},data:body});expect(r.status(),await r.text()).toBe(201);return r.json();}
 const catalogue=await(await page.request.get('/api/catalogue')).json(),supplier=await post('catalogue/supplier-setups',{supplier:{name:`Identity browser ${randomUUID().slice(0,8)}`},location:{registryId:catalogue.locations.find((l:any)=>l.code==='LG').id}});
 const product=await post('catalogue/product-setups',{sourceId:supplier.source.id,product:{name:`Maple identity ${randomUUID().slice(0,8)}`},variants:[]});
 const receipt=await post('receipts',{sourceId:supplier.source.id,deliveredOn:'2020-01-01',invoiceReference:'PRIVATE-BROWSER-INVOICE',lines:[{skuId:product.skus[0].id,usableQuantity:3,damagedQuantity:1,damageReason:'PRIVATE damage on arrival'}]});
 const p=product.product.productCode,l=receipt.lines[0].lotCode;expect(p).toMatch(/^P.{5}$/);expect(l).toMatch(/^L.{5}$/);
 await page.reload();await expect(page.getByRole('heading',{name:'Product catalogue'})).toBeVisible();
 await page.getByLabel('Search catalogue',{exact:true}).fill(p);const row=page.getByRole('button').filter({has:page.getByRole('heading',{name:product.product.name,exact:true})});await expect(row).toContainText(p);
 let panel=page.getByRole('region',{name:'Exact code lookup'});
 await panel.getByLabel('Product or Lot Code',{exact:true}).fill(p.toLowerCase());await panel.getByRole('button',{name:'Find code'}).click();await expect(panel.getByRole('status')).toContainText(product.product.name);
 await page.getByRole('button',{name:'Receiving & stock',exact:true}).click();panel=page.getByRole('region',{name:'Exact code lookup'});await panel.getByLabel('Product or Lot Code',{exact:true}).fill(l);await panel.getByRole('button',{name:'Find code'}).click();await expect(panel.getByRole('status')).toContainText('Usable availability: 3');await expect(panel.getByRole('status')).toContainText('Damaged lot quantity: 1');
 await page.getByLabel('Search stock',{exact:true}).fill(l);await expect(page.getByRole('row').filter({hasText:l})).toContainText(p);
 await mkdir('test-results/phase-1',{recursive:true});await writeFile('test-results/phase-1/api-examples.json',JSON.stringify({isolatedFixturesOnly:true,productCode:p,lotCode:l,product:await(await page.request.get('/api/inventory/products/by-code/'+p)).json(),lot:await(await page.request.get('/api/inventory/lots/by-code/'+l)).json()},null,2));await panel.scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/phase-1/stock-code-desktop.png',fullPage:false});
 await page.getByRole('button',{name:'Sign out'}).click();await login('e2e-production@dayari.test');await page.getByRole('button',{name:'QR lookup',exact:true}).click();panel=page.getByRole('region',{name:'Exact code lookup'});
 await panel.getByLabel('Product or Lot Code',{exact:true}).fill(l);await panel.getByRole('button',{name:'Find code'}).click();await expect(panel.getByRole('status')).toContainText('Usable availability: 3');await expect(panel.getByRole('status')).not.toContainText('Damaged');await expect(panel).not.toContainText('PRIVATE');await expect(page.getByRole('button',{name:'Labels & printing',exact:true})).toHaveCount(0);
 const denied=await page.request.get(`/api/receipts/${receipt.id}`);expect(denied.status()).toBe(403);
 const result=await page.request.get(`/api/inventory/lots/by-code/${l}`);expect(result.status()).toBe(200);const body=await result.json();expect(body.damaged).toBeUndefined();expect(body.invoiceReference).toBeUndefined();expect(body.supplierName).toBeUndefined();
 await page.setViewportSize({width:390,height:844});await panel.scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/phase-1/production-code-mobile.png',fullPage:false});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await panel.getByLabel('Product or Lot Code',{exact:true}).fill('P00000');await panel.getByRole('button',{name:'Find code'}).click();await expect(panel.getByRole('alert')).toContainText('six-character');await expect(panel.getByRole('status')).toHaveCount(0);
 await page.route('**/api/inventory/**',r=>r.fulfill({status:503,contentType:'application/json',body:'{"message":"unavailable"}'}));await panel.getByLabel('Product or Lot Code',{exact:true}).fill(l);await panel.getByRole('button',{name:'Find code'}).click();await expect(panel.getByRole('alert')).toContainText('unavailable');await expect(panel.getByRole('status')).toHaveCount(0);
});
