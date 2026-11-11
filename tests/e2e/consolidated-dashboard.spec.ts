import {expect,test} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';

test('consolidated workspaces preserve role boundaries, legacy routes and modal drafts',async({page})=>{
 test.setTimeout(240000);
 async function login(role:string){await page.goto('/');await page.getByLabel('Email address').fill(`e2e-${role}@dayari.test`);await page.getByLabel('Password',{exact:true}).fill(process.env.E2E_PASSWORD!);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('navigation',{name:'Workspace'})).toBeVisible();}
 await login('admin');const nav=page.getByRole('navigation',{name:'Workspace'});
 await expect(nav.getByRole('button')).toHaveCount(8);await expect(nav.getByRole('button',{name:'Usable stock',exact:true})).toHaveCount(0);await expect(page.getByRole('region',{name:'Product availability',exact:true})).toHaveCount(0);
 await nav.getByRole('button',{name:'Inventory',exact:true}).click();await expect(page.getByRole('button',{name:'Products',exact:true})).toBeVisible();
 await page.getByLabel('Search inventory',{exact:true}).fill('keep-context');await page.getByRole('button',{name:'Count history',exact:true}).click();await expect(page.getByRole('heading',{name:'Targeted physical counts'})).toBeVisible();await page.getByRole('button',{name:'Stock',exact:true}).click();await expect(page.getByLabel('Search inventory',{exact:true})).toHaveValue('keep-context');
 await nav.getByRole('button',{name:'Receiving',exact:true}).click();await expect(page.getByRole('heading',{name:'Receiving',exact:true})).toBeVisible();
 await nav.getByRole('button',{name:'Catalogue',exact:true}).click();await page.getByRole('navigation',{name:'catalogue views'}).getByRole('button',{name:'Suppliers',exact:true}).click();await expect(page.getByRole('heading',{name:'Suppliers & sources'})).toBeVisible();
 await nav.getByRole('button',{name:'Users & settings',exact:true}).click();await page.getByRole('button',{name:'Staff & invitations',exact:true}).click();await expect(page.getByRole('heading',{name:'Users & access',exact:true})).toBeVisible();
 await page.goto('/#qr');await expect(page.getByRole('heading',{name:'QR lookup',exact:true})).toBeVisible();await expect(nav.getByRole('button',{name:'Production',exact:true})).toHaveAttribute('aria-current','page');
 await page.getByRole('button',{name:'Sign out',exact:true}).click();await login('manager');
 await nav.getByRole('button',{name:'Inventory',exact:true}).click();await page.getByRole('button',{name:'Count history',exact:true}).click();await page.getByRole('button',{name:'Count stock',exact:true}).click();let dialog=page.getByRole('dialog');await expect(dialog.getByRole('heading',{name:'Physical stock count',exact:true})).toBeVisible();await dialog.getByLabel('Count purpose',{exact:true}).fill('Preserve this physical count draft');await dialog.getByRole('button',{name:'Close task',exact:true}).click();await page.getByRole('button',{name:'Count stock',exact:true}).click();await expect(dialog.getByLabel('Count purpose',{exact:true})).toHaveValue('Preserve this physical count draft');await dialog.getByRole('button',{name:'Close task',exact:true}).click();
 await mkdir('docs/images/consolidated-dashboard',{recursive:true});
 for(const width of [1440,1024,768,390,320]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);if(width===1440||width===390)await page.screenshot({path:`docs/images/consolidated-dashboard/count-history-${width}.png`});}
 await page.setViewportSize({width:1440,height:900});await page.getByRole('button',{name:'Sign out',exact:true}).click();await login('production');
 await expect(nav.getByRole('button')).toHaveCount(3);await expect(nav.getByRole('button',{name:'Inventory',exact:true})).toBeVisible();await expect(page.getByLabel('Search usable stock',{exact:true})).toBeVisible();expect((await page.request.get('/api/stock')).status()).toBe(403);expect((await page.request.get('/api/catalogue')).status()).toBe(403);
 await page.goto('/#counts');await expect(page.getByRole('heading',{name:'Access restricted',exact:true})).toBeVisible();
});

test('parent products stay grouped and receipt/product drawers preserve browsing context',async({page})=>{
 test.setTimeout(180000);await page.goto('/');await page.getByLabel('Email address').fill('e2e-admin@dayari.test');await page.getByLabel('Password',{exact:true}).fill(process.env.E2E_PASSWORD!);await page.getByRole('button',{name:'Sign in',exact:true}).click();const nav=page.getByRole('navigation',{name:'Workspace'});await expect(nav).toBeVisible();
 async function post(path:string,data:object){const response=await page.request.post('/api/'+path,{headers:{Origin:'http://127.0.0.1:3101','Idempotency-Key':randomUUID()},data});expect(response.ok(),await response.text()).toBe(true);return response.json();}
 const catalogue=await(await page.request.get('/api/catalogue')).json(),name='Grouped notebook '+randomUUID().slice(0,8);
 const supplier=await post('catalogue/supplier-setups',{supplier:{name},location:{registryId:catalogue.locations.find((l:any)=>l.code==='LG').id}});
 const product=await post('catalogue/product-setups',{sourceId:supplier.source.id,product:{name},variants:['Red','Brown'].map(value=>({name:value,suffix:value.toUpperCase(),attributes:[{attribute:'Colour',value}]}))});
 const receipt=await post('receipts',{sourceId:supplier.source.id,deliveredOn:'2020-01-01',lines:product.skus.map((sku:any)=>({skuId:sku.id,usableQuantity:2,damagedQuantity:0}))});
 await page.reload();await nav.getByRole('button',{name:'Inventory',exact:true}).click();await page.getByLabel('Search inventory',{exact:true}).fill(name);
 const productRow=page.locator('details').filter({has:page.locator('summary').filter({hasText:name})});await expect(productRow).toHaveCount(1);await productRow.locator('summary').click();for(const sku of product.skus)await expect(productRow).toContainText(sku.fullCode);
 await mkdir('docs/images/consolidated-dashboard',{recursive:true});await page.screenshot({path:'docs/images/consolidated-dashboard/grouped-inventory-1440.png'});
 await nav.getByRole('button',{name:'Receiving',exact:true}).click();await page.getByLabel('Search receipts',{exact:true}).fill(receipt.batch.publicCode);await page.getByRole('button').filter({hasText:receipt.batch.publicCode}).filter({hasText:'View receipt'}).click();await expect(page.getByRole('dialog',{name:'Accepted receipt',exact:true})).toContainText(product.skus[0].fullCode);await page.getByRole('button',{name:'Close receipt details',exact:true}).click();await expect(page.getByLabel('Search receipts',{exact:true})).toHaveValue(receipt.batch.publicCode);
 await nav.getByRole('button',{name:'Catalogue',exact:true}).click();await page.getByLabel('Search catalogue',{exact:true}).fill(name);await page.getByRole('button').filter({has:page.getByRole('heading',{name,exact:true})}).click();await expect(page.getByRole('dialog',{name,exact:true})).toContainText(product.product.productCode);await page.getByRole('button',{name:'Close product details',exact:true}).click();await expect(page.getByLabel('Search catalogue',{exact:true})).toHaveValue(name);
});
