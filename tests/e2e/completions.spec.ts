import { openWorkspace } from './ui.js';
import {randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {expect,test} from '@playwright/test';
test('Manager completes exact selected production items with draft and lost-response retry; Admin completes a separate selected subset',async({page})=>{
 test.setTimeout(180000);await page.goto('/');
 async function login(email:string){await page.getByLabel('Email address').fill(email);await page.getByLabel('Password',{exact:true}).fill(process.env.E2E_PASSWORD!);const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/sessions'&&r.request().method()==='POST');await page.getByRole('button',{name:'Sign in',exact:true}).click();expect((await response).status()).toBe(200);await expect(page.getByRole('button',{name:'Sign out',exact:true})).toBeVisible();}
 async function post(path:string,body:object){const r=await page.request.post('/api/'+path,{headers:{Origin:'http://127.0.0.1:3101','Idempotency-Key':randomUUID()},data:body});expect(r.ok(),await r.text()).toBe(true);return r.json();}
 async function get(path:string){const r=await page.request.get('/api/'+path);expect(r.ok(),await r.text()).toBe(true);return r.json();}
 await login('e2e-admin@dayari.test');const catalogue=await get('catalogue'),unique=randomUUID().slice(0,8),order='Completion browser '+unique;
 const source=(await post('catalogue/supplier-setups',{supplier:{name:order},location:{registryId:catalogue.locations.find((x:any)=>x.code==='LG').id}})).source;
 const product=await post('catalogue/product-setups',{sourceId:source.id,product:{name:order+' notebook'},variants:[]});const receipt=await post('receipts',{sourceId:source.id,deliveredOn:'2020-01-01',lines:[{skuId:product.skus[0].id,usableQuantity:3,damagedQuantity:0}]});
 const units=(await get('receipts/'+receipt.id+'/units')).units;const before=(await get('stock?batchId='+receipt.batch.id)).lots;
 await page.getByRole('button',{name:'Sign out',exact:true}).click();await login('e2e-production@dayari.test');const checkout=await post('checkouts',{reason:{code:'PRODUCTION_USE'},orderReference:order,lines:units.slice(0,2).map((u:any)=>({unitId:u.id}))});
 expect((await page.request.get('/api/completion-options')).status()).toBe(403);await page.getByRole('button',{name:'Sign out',exact:true}).click();await login('e2e-manager@dayari.test');await openWorkspace(page, 'Production completion');await page.getByRole('button',{name:'Complete production items',exact:true}).click();
 await page.getByLabel('Completion Unit Code or individual QR',{exact:true}).fill(units[0].unitCode);const addPreview=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/completions/preview'&&r.request().method()==='POST');await page.getByRole('button',{name:'Add unit',exact:true}).click();expect((await addPreview).status()).toBe(200);await page.getByRole('button',{name:'Review completion',exact:true}).click();await expect(page.getByRole('button',{name:'Remove '+units[0].unitCode,exact:true})).toBeVisible();await page.getByRole('button',{name:'Back to selection',exact:true}).click();
 page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'Discard completion draft',exact:true}).click();const restored=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/completions/preview'&&r.request().method()==='POST');await page.reload();expect((await restored).status()).toBe(200);await page.getByRole('button',{name:'Review completion',exact:true}).click();
 await mkdir('test-results/consolidation/completion/milestone-8',{recursive:true});for(const width of [320,390,768,1024,1440]){await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`test-results/consolidation/completion/milestone-8/completion-review-${width}.png`,fullPage:true});}
 let key:string|undefined;let accepted:any;await page.route('**/api/completions',async route=>{if(route.request().method()!=='POST')return route.continue();key=route.request().headers()['idempotency-key'];const response=await route.fetch();expect(response.status()).toBe(201);accepted=await response.json();await route.abort('failed');},{times:1});
 const lostResponse=page.waitForEvent('requestfailed',{predicate:r=>new URL(r.url()).pathname==='/api/completions'&&r.method()==='POST'});await page.getByRole('button',{name:'Confirm selected completion',exact:true}).click();await lostResponse;await expect(page.getByRole('button',{name:'Retry saved completion',exact:true})).toBeVisible();await page.route('**/api/completions',async route=>{if(route.request().method()==='POST')expect(route.request().headers()['idempotency-key']).toBe(key);await route.continue();},{times:1});const replayResponse=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/completions'&&r.request().method()==='POST');await page.getByRole('button',{name:'Retry saved completion',exact:true}).click();expect((await replayResponse).status()).toBe(201);await expect(page.getByRole('heading',{name:'Production completion recorded',exact:true})).toBeFocused();expect(accepted.lines[0].checkoutId).toBe(checkout.id);
 const after=(await get('stock?batchId='+receipt.batch.id)).lots;expect(before[0].usable).toBe('3');expect(after[0].usable).toBe('1');expect((await get('units/'+units[0].id)).state).toBe('C');expect((await get('units/'+units[1].id)).state).toBe('P');
 await page.screenshot({path:'test-results/consolidation/completion/milestone-8/completion-accepted-1440.png',fullPage:true});await page.getByRole('button',{name:'Sign out',exact:true}).click();await login('e2e-admin@dayari.test');await openWorkspace(page, 'Production completion');await expect(page.getByRole('heading',{name:'Completion history',exact:true})).toBeVisible();
 const employeeSearch=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/completion-sessions'&&new URL(r.url()).searchParams.get('query')===checkout.actor.name);
 await page.getByLabel('Find In Production items',{exact:true}).fill(checkout.actor.name);expect((await employeeSearch).status()).toBe(200);
 await page.getByRole('button',{name:'Open session '+checkout.id.slice(0,8),exact:true}).click();
 await page.getByRole('button',{name:'Select '+units[1].unitCode,exact:true}).click();
 await page.getByRole('button',{name:'Review 1 selected items',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Complete selected production units',exact:true})).toContainText(units[1].unitCode);
 await expect(page.getByRole('dialog',{name:'Complete selected production units',exact:true})).toContainText('Checkout '+checkout.id.slice(0,8));
 await page.getByRole('button',{name:'Close completion review',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Open checkout sessions',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Review 1 selected items',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Complete selected production units',exact:true})).toContainText(units[1].unitCode);
 await page.getByRole('button',{name:'Confirm selected completion',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Production completion recorded',exact:true})).toBeVisible();
 expect((await get('units/'+units[1].id)).state).toBe('C');expect((await get('units/'+units[2].id)).state).toBe('U');
 expect((await get('stock?batchId='+receipt.batch.id)).lots[0].usable).toBe('1');

});
