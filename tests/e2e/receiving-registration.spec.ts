import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { choose } from './ui.js';

test('Manager registers products inside receiving while preserving the delivery draft', async ({ page }) => {
  test.setTimeout(120000);
  const login = async (email: string) => { await page.goto('/'); await page.getByLabel('Email address').fill(email); await page.getByLabel('Password',{exact:true}).fill(process.env.E2E_PASSWORD!); await page.getByRole('button',{name:'Sign in',exact:true}).click(); await expect(page.getByRole('heading',{name:/Welcome/})).toBeVisible({timeout:30000}); };
  await login('e2e-admin@dayari.test');
  const catalogue = await (await page.request.get('/api/catalogue')).json();
  const response = await page.request.post('/api/catalogue/supplier-setups',{headers:{Origin:'http://127.0.0.1:3101','Idempotency-Key':randomUUID()},data:{supplier:{name:`Inline ${randomUUID().slice(0,8)}`},location:{registryId:catalogue.locations.find((item:any)=>item.code==='LG').id}}});
  expect(response.status()).toBe(201); const supplier = await response.json();
  await expect(page.locator('[aria-label="Stock summary"] button')).toHaveCount(0);
  await expect(page.locator('[data-page-header] p')).toHaveCount(0);
  await page.getByRole('button',{name:'Sign out'}).click();await login('e2e-manager@dayari.test');
  await page.getByRole('button',{name:'Receive a delivery',exact:true}).click();
  let dialog=page.getByRole('dialog');
  await choose(dialog,'Receiving supplier',supplier.supplier.id);
  await expect(dialog.getByRole('combobox',{name:'Receiving source',exact:true})).toHaveCount(0);
  await expect(dialog.getByText(/Saved location:/)).toBeVisible();
  await dialog.getByRole('button',{name:'Continue',exact:true}).click();
  await dialog.getByRole('button',{name:'Register a new product',exact:true}).click();
  const name=`Inline milk ${randomUUID().slice(0,8)}`;
  await dialog.getByLabel('Product name',{exact:true}).fill(name);
  await dialog.getByRole('button',{name:'Continue',exact:true}).click();
  await dialog.getByRole('button',{name:'Continue',exact:true}).click();
  const saved=page.waitForResponse(r=>r.url().endsWith('/api/receiving/product-setups')&&r.request().method()==='POST');await dialog.getByRole('button',{name:'Save product',exact:true}).click();expect((await saved).status()).toBe(201);const product=await (await saved).json();
  await expect(dialog.getByRole('heading',{name:'Receive delivery',exact:true})).toBeVisible();
  await expect(dialog.locator('label').filter({hasText:product.skus[0].fullCode}).getByRole('checkbox')).toBeChecked();
  await dialog.getByRole('button',{name:'Continue',exact:true}).click();
  await dialog.getByLabel(`${product.skus[0].fullCode} usable quantity`,{exact:true}).fill('7');
  await dialog.getByLabel('Invoice reference (optional)',{exact:true}).fill('DRAFT-KEPT');
  await expect(dialog.locator('.bg-usable-tint,.bg-damaged-tint')).toHaveCount(0);
  await dialog.getByRole('button',{name:'Back',exact:true}).click();
  await dialog.getByRole('button',{name:'Register a new product',exact:true}).click();
  await dialog.getByLabel('Product name',{exact:true}).fill('Discarded catalogue draft');
  await dialog.getByRole('button',{name:'Close setup',exact:true}).click();
  await dialog.getByRole('button',{name:'Discard draft',exact:true}).click();
  await dialog.getByRole('button',{name:'Continue',exact:true}).click();
  await expect(dialog.getByLabel(`${product.skus[0].fullCode} usable quantity`,{exact:true})).toHaveValue('7');
  await expect(dialog.getByLabel('Invoice reference (optional)',{exact:true})).toHaveValue('DRAFT-KEPT');
  await mkdir('docs/images/page-receiving-ux',{recursive:true});
  for (const width of [1440,1024,768,390,320]) { await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);if(width===1440||width===390)await page.screenshot({path:`docs/images/page-receiving-ux/receiving-${width}.png`}); }
  await page.setViewportSize({width:1440,height:900});
  await dialog.getByRole('button',{name:'Continue',exact:true}).click();await expect(dialog).toContainText('Usable: 7');
  await dialog.getByRole('button',{name:'Confirm receipt',exact:true}).click();await expect(dialog).toBeHidden();
  await expect(page.getByRole('region',{name:'Accepted receipt',exact:true})).toContainText(product.skus[0].fullCode);
  await page.getByRole('button',{name:'Inventory',exact:true}).click();
  await page.getByLabel('Search inventory',{exact:true}).fill(name);
  await expect(page.getByRole('region',{name:'Exact code lookup'})).toBeVisible();
  const regions=await page.locator('[aria-label="Exact code lookup"]').boundingBox();const sheet=await page.getByLabel('Search inventory',{exact:true}).boundingBox();expect(regions!.y).toBeLessThan(sheet!.y);
  await page.screenshot({path:'docs/images/page-receiving-ux/inventory-desktop.png'});
});

test('compact supplier lists and catalogue grids paginate with title-only headers and top identity lookup', async ({ page }) => {
  await page.route('**/api/catalogue', async route => {
    const response=await route.fetch();const data=await response.json();
    const prototype=data.suppliers.find((row:any)=>row.sources.length);
    data.suppliers=Array.from({length:25},(_,index)=>({...prototype,id:randomUUID(),name:`Paged supplier ${String(index+1).padStart(2,'0')}`,sources:prototype.sources.slice(0,1)}));
    const product=data.products[0];data.products=Array.from({length:25},(_,index)=>({...product,id:randomUUID(),name:`Paged product ${String(index+1).padStart(2,'0')}`,variants:[],attributes:[]}));data.skus=[];data.sourcings=[];
    await route.fulfill({response,json:data});
  });
  await page.goto('/');await page.getByLabel('Email address').fill('e2e-admin@dayari.test');await page.getByLabel('Password',{exact:true}).fill(process.env.E2E_PASSWORD!);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('heading',{name:/Welcome/})).toBeVisible({timeout:30000});
  await page.getByRole('button',{name:'Catalogue',exact:true}).click();await expect(page.getByRole('button',{name:/View product/})).toHaveCount(18);
  await page.getByRole('button',{name:'Next page',exact:true}).click();await expect(page.getByText('Paged product 25',{exact:true})).toBeVisible();await expect(page.getByText('Paged product 01',{exact:true})).toHaveCount(0);
  await page.getByLabel('Search catalogue',{exact:true}).fill('product 01');await expect(page.getByText('Paged product 01',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Next page',exact:true})).toHaveCount(0);
  await page.getByLabel('Search catalogue',{exact:true}).fill('');
  await page.getByRole('button',{name:'Suppliers',exact:true}).click();await page.getByRole('button',{name:'Supplier directory',exact:true}).click();await expect(page.getByRole('heading',{name:/Paged supplier/})).toHaveCount(12);
  await page.getByRole('button',{name:'Next page',exact:true}).click();await expect(page.getByRole('heading',{name:'Paged supplier 13',exact:true})).toBeVisible();
  await page.getByLabel('Search suppliers',{exact:true}).fill('supplier 25');await expect(page.getByRole('heading',{name:'Paged supplier 25',exact:true})).toBeVisible();
  await expect(page.locator('[data-page-header] p')).toHaveCount(0);expect(await page.locator('[data-page-header]').evaluate(element=>getComputedStyle(element).borderLeftWidth)).toBe('0px');
  await page.getByLabel('Search suppliers',{exact:true}).fill('');
  await mkdir('docs/images/page-receiving-ux',{recursive:true});
  for(const width of [1440,1024,768,390,320]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);if(width===1440||width===390)await page.screenshot({path:`docs/images/page-receiving-ux/suppliers-${width}.png`});}
});
