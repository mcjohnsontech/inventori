import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { choose } from './ui.js';
test('Manager receives a multi-product delivery, retries a lost response and sees separate usable/damaged stock', async ({ page }) => {
 // This journey now also verifies unit pagination and five responsive screenshots.
 // Individual assertions and application transaction/request timeouts are unchanged.
 test.setTimeout(90_000);
 await page.goto('/');
 async function login(email: string) { await page.getByLabel('Email address').fill(email); await page.getByLabel('Password', { exact: true }).fill(process.env.E2E_PASSWORD!); await page.getByRole('button', { name: 'Sign in', exact: true }).click(); if (!email.includes('production')) await page.getByRole('button', { name: 'Catalogue', exact: true }).click(); await expect(page.getByRole('heading', { name: email.includes('production') ? 'Inventory' : 'Product catalogue' })).toBeVisible(); }
 await login('e2e-admin@dayari.test');
 async function create(operation: string, body: unknown) { const response=await page.request.post(`/api/catalogue/${operation}`,{headers:{Origin:'http://127.0.0.1:3101','Idempotency-Key':randomUUID()},data:body});expect(response.ok(),await response.text()).toBe(true);return response.json(); }
 const catalogue=await (await page.request.get('/api/catalogue')).json();
 const supplier=await create('supplier-setups',{supplier:{name:`Browser receiving ${randomUUID().slice(0,8)}`},location:{registryId:catalogue.locations.find((x:any)=>x.code==='LG').id}});
 const notebook=await create('product-setups',{sourceId:supplier.source.id,product:{name:`Receipt notebook ${randomUUID().slice(0,8)}`},variants:['Red','Brown'].map(name=>({name,suffix:name.toUpperCase(),attributes:[{attribute:'Colour',value:name}]}))});
 const pen=await create('product-setups',{sourceId:supplier.source.id,product:{name:`Receipt pen ${randomUUID().slice(0,8)}`},variants:[]});
 const skus=[...notebook.skus,...pen.skus];
 await page.getByRole('button',{name:'Sign out'}).click();await login('e2e-manager@dayari.test');
 await expect(page.getByRole('button',{name:'Add supplier',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Overview',exact:true}).click();await page.getByRole('button',{name:'Receive a delivery',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Receive delivery',exact:true});const next=()=>dialog.getByRole('button',{name:'Continue',exact:true}).click();
 await choose(dialog,'Receiving supplier',supplier.supplier.id);
 await expect(dialog.getByText('Saved location:',{exact:false})).toBeVisible();await expect(dialog.getByRole('combobox',{name:'Receiving source',exact:true})).toHaveCount(0);await next();
 for(const sku of skus) await dialog.locator('label').filter({hasText:sku.fullCode}).getByRole('checkbox').check();
 await next();
 const quantities=[[30,2],[20,0],[12,1]];
 for(const [index,sku] of skus.entries()){await dialog.getByRole('spinbutton',{name:`${sku.fullCode} usable quantity`,exact:true}).fill(String(quantities[index]![0]));await dialog.getByRole('spinbutton',{name:`${sku.fullCode} damaged quantity`,exact:true}).fill(String(quantities[index]![1]));if(quantities[index]![1])await dialog.getByRole('textbox',{name:`${sku.fullCode} damage explanation`,exact:true}).fill('Damaged packaging and goods on arrival');}
 await dialog.getByLabel('Delivery date',{exact:true}).fill('2020-01-01');await dialog.getByLabel('Invoice reference (optional)').fill('BROWSER-INVOICE');
 await next();await expect(dialog.getByText('62',{exact:true})).toBeVisible();await expect(dialog.getByText('65',{exact:true})).toBeVisible();
 await dialog.getByRole('button',{name:'Back',exact:true}).click();await expect(dialog.getByRole('spinbutton',{name:`${skus[0].fullCode} usable quantity`,exact:true})).toHaveValue('30');
 await page.keyboard.press('Escape');await dialog.getByRole('button',{name:'Keep editing',exact:true}).click();await next();
 await page.screenshot({path:'test-results/receiving-review-desktop.png'});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/receiving-review-mobile.png'});expect((await dialog.boundingBox())!.width).toBeLessThanOrEqual(390);
 let first=true;let acceptedId='';let sentKey='';
 await page.route('**/api/receipts',async route=>{if(route.request().method()!=='POST'){await route.continue();return;}const key=route.request().headers()['idempotency-key']!;if(first){first=false;sentKey=key;const response=await route.fetch();expect(response.status()).toBe(201);acceptedId=(await response.json()).id;await route.fulfill({status:503,json:{message:'Simulated lost response after commit'}});}else{expect(key).toBe(sentKey);await route.continue();}});
 await dialog.getByRole('button',{name:'Confirm receipt',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('Simulated lost response');
 await dialog.getByRole('button',{name:'Confirm receipt',exact:true}).click();await expect(dialog).toBeHidden();
 const details=page.getByRole('region',{name:'Accepted receipt',exact:true});await expect(details.getByRole('heading',{level:2,name:/^B-/})).toContainText('B-');await expect(details.getByText('62',{exact:true})).toBeVisible();await expect(details.getByText('65',{exact:true})).toBeVisible();
 const accepted=await (await page.request.get(`/api/receipts/${acceptedId}`)).json();expect(accepted.lines).toHaveLength(3);expect(accepted.totals).toEqual({usable:'62',damaged:'3',delivered:'65'});
 expect(accepted.serialization.unitCount).toBe('65');
 await details.getByText('View received Unit Codes',{exact:true}).click();
 const unitTable=details.getByRole('table',{name:'Received physical units'});
 await expect(unitTable.getByRole('row')).toHaveCount(21);
 const unitPage=await (await page.request.get(`/api/receipts/${acceptedId}/units`)).json();
 expect(unitPage.total).toBe(65);expect(new Set(unitPage.units.map((unit:any)=>unit.unitCode)).size).toBe(20);
 await expect(unitTable).toContainText(unitPage.units[0].unitCode);
 const unitPanel=unitTable.locator('..').locator('..');
 await unitPanel.getByRole('button',{name:'Next page',exact:true}).click();
 const nextUnitPage=await (await page.request.get(`/api/receipts/${acceptedId}/units?page=2`)).json();
 await expect(unitTable).toContainText(nextUnitPage.units[0].unitCode);
 await mkdir('test-results/consolidation/completion/milestone-2',{recursive:true});
 for(const width of [320,390,768,1024,1440]){await page.setViewportSize({width,height:900});await details.getByRole('heading',{name:'Individual physical units',exact:true}).evaluate(el=>el.scrollIntoView({block:'center'}));await page.screenshot({path:`test-results/consolidation/completion/milestone-2/received-units-${width}.png`});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);}
 const stock=await (await page.request.get(`/api/stock?sourceId=${supplier.source.id}`)).json();expect(stock.lots).toHaveLength(3);expect(stock.lots.find((x:any)=>x.skuId===skus[0].id)).toMatchObject({usable:'30',damaged:'2'});
 await expect(page.getByRole('region',{name:'Accepted batch balances'})).toContainText('30 usable');await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'test-results/receiving-accepted.png'});
 await page.getByRole('button',{name:'Back to receipt history',exact:true}).click();
 await page.getByLabel('Search receipts',{exact:true}).fill(accepted.batch.publicCode);
 await page.getByRole('button').filter({hasText:accepted.batch.publicCode}).filter({hasText:'View receipt'}).click();
 await expect(page.getByRole('region',{name:'Accepted receipt',exact:true})).toContainText(skus[0].fullCode);
 await page.getByRole('button',{name:'Inspect stock lots',exact:true}).first().click();
 await expect(page.getByRole('heading',{name:'Inventory',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Delivery lots',exact:true}).click();await page.getByRole('row').filter({hasText:accepted.lines[0].lotCode}).getByRole('button',{name:/Details/}).click();
 const provenance=page.getByRole('region',{name:'Lot provenance',exact:true});
 await expect(provenance).toContainText('External arrival → Usable');
 const receiptResponse=page.waitForResponse(r=>r.url().endsWith(`/api/receipts/${accepted.id}`)&&r.request().method()==='GET');await provenance.getByRole('button',{name:'View accepted receipt',exact:true}).click();expect((await receiptResponse).status()).toBe(200);
 await expect(page.getByRole('region',{name:'Accepted receipt',exact:true})).toContainText(accepted.batch.publicCode);
 await page.getByRole('button',{name:'Close receipt details',exact:true}).click();await page.getByRole('button',{name:'Sign out'}).click();await login('e2e-production@dayari.test');await expect(page.getByRole('button',{name:'Receiving',exact:true})).toHaveCount(0);expect((await page.request.get('/api/receiving/options')).status()).toBe(403);expect((await page.request.get('/api/stock')).status()).toBe(403);
});
