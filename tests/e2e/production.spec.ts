import { openWorkspace } from './ui.js';
import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
test('Production discovers usable lots and opens contextual exact identity lookup',async({page})=>{
 test.setTimeout(120000);
 await page.goto('/');await page.getByLabel('Email address').fill('e2e-admin@dayari.test');await page.getByLabel('Password',{exact:true}).fill(process.env.E2E_PASSWORD!);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('navigation',{name:'Workspace'})).toBeVisible();
 const create=async(path:string,data:unknown)=>{const r=await page.request.post('/api/'+path,{headers:{Origin:'http://127.0.0.1:3101','Idempotency-Key':randomUUID()},data});expect(r.ok()).toBe(true);return r.json();};
 const catalogue=await (await page.request.get('/api/catalogue')).json();
 const source=(await create('catalogue/supplier-setups',{supplier:{name:`Production browser ${randomUUID()}`},location:{registryId:catalogue.locations.find((x:{code:string})=>x.code==='LG').id}})).source;
 const product=await create('catalogue/product-setups',{sourceId:source.id,product:{name:'Production browser notebook'},variants:[]});
 const accepted=await create('receipts',{sourceId:source.id,deliveredOn:'2020-01-01',lines:[{skuId:product.skus[0].id,usableQuantity:7,damagedQuantity:1,damageReason:'Synthetic receiving damage evidence'}]});
 await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.getByLabel('Email address').fill('e2e-production@dayari.test');await page.getByLabel('Password',{exact:true}).fill(process.env.E2E_PASSWORD!);await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Inventory',exact:true})).toBeVisible();
 const response=await page.request.get('/api/availability');expect(response.status()).toBe(200);const stock=await response.json();
 await expect(page.getByRole('button',{name:'Checkout items',exact:true})).toBeVisible();
 expect(stock.total).toBeGreaterThan(0);const lot=accepted.lines[0];await page.getByRole('searchbox',{name:'Search usable stock'}).fill(lot.lotCode);await page.getByRole('button',{name:/Production browser notebook/}).click();await expect(page.getByText(product.skus[0].fullCode,{exact:true})).toBeVisible();await page.getByRole('button',{name:`Look up ${lot.lotCode}`,exact:true}).click();await expect(page.getByLabel('Product or Lot Code')).toHaveValue(lot.lotCode);await page.getByRole('button',{name:'Find code',exact:true}).click();await expect(page.getByRole('status',{name:'Code lookup result'})).toContainText(product.skus[0].fullCode);await openWorkspace(page, 'Usable stock');
 await page.getByRole('searchbox',{name:'Search usable stock'}).fill('');await expect(page.getByRole('status',{name:'Loading workspace'})).toHaveCount(0);await expect(page.getByText('matching products',{exact:false})).toBeVisible();
 for(const width of [320,390,768,1024,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`test-results/production-${width}.png`});}
 await expect(page.getByText(/damaged/i)).toHaveCount(0);
 expect((await page.request.get('/api/label-print-jobs')).status()).toBe(403);
});
