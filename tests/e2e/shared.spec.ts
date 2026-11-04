import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
test('shared reports, help, profile and missing pages stay functional and scoped',async({page})=>{
 test.setTimeout(120000);
 await page.goto('/');await page.getByLabel('Email address').fill('e2e-admin@dayari.test');await page.getByLabel('Password',{exact:true}).fill(process.env.E2E_PASSWORD!);const signedIn=page.waitForResponse(r=>r.url().endsWith('/api/sessions')&&r.request().method()==='POST');await page.getByRole('button',{name:'Sign in',exact:true}).click();expect((await signedIn).status()).toBe(200);await expect(page.getByRole('navigation',{name:'Workspace'})).toBeVisible();
 const create=async(path:string,data:unknown)=>{const r=await page.request.post('/api/'+path,{headers:{Origin:'http://127.0.0.1:3101','Idempotency-Key':randomUUID()},data});expect(r.ok(),await r.text()).toBe(true);return r.json();};
 const cat=await (await page.request.get('/api/catalogue')).json();
 const source=(await create('catalogue/supplier-setups',{supplier:{name:`Shared browser ${randomUUID()}`},location:{registryId:cat.locations.find((x:{code:string})=>x.code==='LG').id}})).source;
 const product=await create('catalogue/product-setups',{sourceId:source.id,product:{name:'Shared report notebook'},variants:[]});
 const receipt=await create('receipts',{sourceId:source.id,deliveredOn:'2020-01-01',lines:[{skuId:product.skus[0].id,usableQuantity:9,damagedQuantity:1,damageReason:'Synthetic damaged cover on delivery'}]});
 const job=await create('label-print-jobs',{kind:'INITIAL',receiptId:receipt.id,profileId:'a4-70x35-v1'});
 await page.getByRole('button',{name:'Reports & history',exact:true}).click();await page.getByRole('searchbox',{name:'Search report'}).fill(product.skus[0].fullCode);await expect(page.getByText('9 usable',{exact:true})).toBeVisible();await expect(page.getByText('1 damaged',{exact:true})).toBeVisible();
 for(const width of [320,390,768,1024,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`test-results/reports-${width}.png`});}
 await page.getByRole('button',{name:'Recent receipts',exact:true}).click();await page.getByRole('searchbox',{name:'Search report'}).fill(receipt.batch.publicCode);await page.getByRole('button').filter({hasText:receipt.batch.publicCode}).click();await expect(page.getByRole('region',{name:'Accepted receipt',exact:true})).toContainText(receipt.batch.publicCode);
 await page.getByRole('button',{name:'Reports & history',exact:true}).click();await page.getByRole('button',{name:'Print history',exact:true}).click();await page.getByRole('searchbox',{name:'Search report'}).fill(job.id);await page.getByRole('button',{name:'Inspect print evidence'}).click();await expect(page).toHaveURL(new RegExp('#labels/'+job.id));await expect(page.getByRole('heading',{name:'1. Print queue',exact:true})).toBeVisible();await expect(page.getByText('Batch '+receipt.batch.publicCode,{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Account & shop',exact:true}).click();await expect(page.getByRole('heading',{name:'Profile & sessions'})).toBeVisible();await expect(page.getByRole('heading',{name:'Change password'})).toBeVisible();
 await page.getByRole('button',{name:'Help & guide',exact:true}).click();await expect(page.getByRole('heading',{name:'Help & operating guide'})).toBeVisible();await page.getByRole('button',{name:'Open receiving',exact:true}).click();await expect(page.getByRole('heading',{name:'Receiving',exact:true})).toBeVisible();
 await page.goto('/#not-a-workspace');await expect(page.getByRole('heading',{name:'Workspace not found'})).toBeVisible();await page.getByRole('button',{name:'Return to your workspace'}).click();
 const notFound=await page.goto('/not-a-page');expect(notFound?.status()).toBe(404);await expect(page.getByRole('heading',{name:'Page not found'})).toBeVisible();
});
