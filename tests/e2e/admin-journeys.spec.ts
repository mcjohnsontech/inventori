import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { choose } from './ui.js';

async function login(page: Page) {
  await page.goto('/');
  await page.getByLabel('Email address').fill('e2e-admin@dayari.test');
  await page.getByLabel('Password', { exact: true }).fill(process.env.E2E_PASSWORD!);
  const response = page.waitForResponse(r => r.url().endsWith('/api/sessions') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Welcome, Test' })).toBeVisible();
}
async function navigate(page: Page, label: string, expectedStatus=200) {
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await menu.isVisible()) await menu.click();
  const reads:Record<string,string>={'Inventory':'/api/stock','Receiving':'/api/receiving/options','Receipts & activity':'/api/receipts','Labels & printing':'/api/receipts','Account & shop':'/api/account'};
  const response=reads[label]?page.waitForResponse(r=>new URL(r.url()).pathname===reads[label]&&r.request().method()==='GET'&&r.status()===expectedStatus):null;
  await page.getByRole('navigation', { name: 'Workspace' }).getByRole('button', { name: label, exact: true }).click();
  if(response){const result=await response;expect(result.status()).toBe(expectedStatus);await result.finished();}
}
async function post(page: Page, path: string, body: unknown) {
  const response = await page.request.post(`/api/${path}`, { headers: { Origin: 'http://127.0.0.1:3101', 'Idempotency-Key': randomUUID() }, data: body });
  expect(response.status(), await response.text()).toBe(201);
  return response.json();
}

test('Admin product extension, deep links and complete responsive workspaces use accepted data', async ({ page }) => {
  test.setTimeout(300000);
  await login(page);
  const catalogue = await (await page.request.get('/api/catalogue')).json();
  const supplier = await post(page, 'catalogue/supplier-setups', { supplier: { name: `Harper Studio ${randomUUID().slice(0, 6)}` }, location: { registryId: catalogue.locations.find((row: { code: string }) => row.code === 'LG').id } });
  const product = await post(page, 'catalogue/product-setups', { sourceId: supplier.source.id, product: { name: `Maple Notebook ${randomUUID().slice(0, 6)}`, description: 'A5 leatherbound notebook · shared product, distinct supplier SKUs' }, variants: ['Red', 'Brown'].map(name => ({ name, suffix: name.toUpperCase(), attributes: [{ attribute: 'Colour', value: name }] })) });
  const receipt = await post(page, 'receipts', { sourceId: supplier.source.id, deliveredOn: '2020-01-01', lines: [{ skuId: product.skus[0].id, usableQuantity: 3, damagedQuantity: 1, damageReason: 'Cover damaged during arrival' }, { skuId: product.skus[1].id, usableQuantity: 2, damagedQuantity: 0 }] });
  await page.reload();
  await navigate(page, 'Catalogue');
  await page.getByLabel('Search catalogue', { exact: true }).fill(product.product.productCode);
  await page.getByRole('button').filter({ has: page.getByRole('heading', { name: product.product.name, exact: true }) }).click();
  await expect(page).toHaveURL(new RegExp(`#catalogue/${product.product.id}$`));
  await page.reload();
  await expect(page.getByRole('heading', { name: product.product.name, exact: true })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 900 });
  await page.getByRole('button', { name: 'Add variants or source', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await choose(dialog, 'Supplier', supplier.supplier.id);
  await choose(dialog, 'Supplier location', supplier.source.id);
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(dialog.getByRole('combobox', { name: 'Product', exact: true })).toHaveAttribute('data-value', product.product.id);
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/admin/variant-selection-320.png' });
  await dialog.getByRole('button', { name: 'Add new variant combinations', exact: true }).click();
  await dialog.getByLabel('Colour', { exact: true }).fill('Green');
  const leavePrompt = page.waitForEvent('dialog');
  await page.evaluate(() => history.back());
  const confirmation = await leavePrompt;
  expect(confirmation.message()).toContain('unsaved draft');
  await confirmation.dismiss();
  await expect(dialog.getByLabel('Colour', { exact: true })).toHaveValue('Green');
  await dialog.getByLabel('Variant suffix', { exact: true }).fill('GREEN');
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.screenshot({ path: 'test-results/admin/variant-review-320.png' });
  const extended = page.waitForResponse(r => r.url().endsWith('/api/catalogue/product-setups') && r.request().method() === 'POST');
  await dialog.getByRole('button', { name: 'Save product', exact: true }).click();
  const result = await (await extended).json();
  expect(result.product.id).toBe(product.product.id);
  expect(result.sourcing.baseCode).toBe(product.sourcing.baseCode);
  await expect(dialog).toBeHidden();
  const after = await (await page.request.get('/api/catalogue')).json();
  for (const sku of product.skus) expect(after.skus.find((row: { id: string }) => row.id === sku.id).fullCode).toBe(sku.fullCode);
  const acceptedAgain = await (await page.request.get(`/api/receipts/${receipt.id}`)).json();
  expect(acceptedAgain).toEqual(receipt);
  await expect(page.getByRole('heading', { name: 'Green', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: 'test-results/admin/product-detail-1440.png' });
  await page.setViewportSize({ width: 320, height: 900 });
  await page.screenshot({ path: 'test-results/admin/product-detail-320.png' });
  await page.getByRole('button', { name: 'View stock lots', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`#inventory/${product.product.id}$`));
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Product', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /Filter stock/ }).click();
  await expect(page.getByRole('combobox', { name: 'Product', exact: true })).toHaveAttribute('data-value', product.product.id);
  // The back arrow is an aria-hidden icon now, so it is not part of the name.
  await page.getByRole('button', { name: `Back to ${product.product.name}`, exact: true }).click();
  await expect(page.getByRole('heading', { name: product.product.name, exact: true })).toBeVisible();

  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [key, label] of [['overview', 'Overview'], ['catalogue', 'Catalogue'], ['suppliers', 'Suppliers & sources'], ['inventory', 'Inventory'], ['receiving', 'Receiving'], ['receipts', 'Receipts & activity'], ['qr', 'QR lookup'], ['labels', 'Labels & printing'], ['settings', 'Account & shop']]) {
      await navigate(page, label!);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      if (key === 'overview') await expect(page.getByText('Lots containing damaged stock', { exact: true })).toBeVisible();
      if (key === 'catalogue') await page.getByLabel('Search catalogue', { exact: true }).fill(product.product.productCode);
      if (key === 'suppliers') await page.getByLabel('Search suppliers', { exact: true }).fill(supplier.supplier.name);
      if (key === 'inventory') {
        await expect(page.getByRole('combobox', { name: 'Product', exact: true })).toHaveCount(width < 640 ? 0 : 1);
        await page.getByLabel('Search inventory', { exact: true }).fill(receipt.lines[0].lotCode);
        await expect(page.getByRole('row').filter({ hasText: receipt.lines[0].lotCode })).toBeVisible();
      }
      if (key === 'receiving') await expect(page.getByText('Ready to receive', { exact: true })).toBeVisible();
      if (key === 'receipts') {
        await page.getByLabel('Search receipts', { exact: true }).fill(receipt.batch.publicCode);
        await page.getByRole('button').filter({ hasText: receipt.batch.publicCode }).filter({ hasText: 'View receipt' }).click();
        await expect(page.getByRole('region', { name: 'Accepted receipt', exact: true })).toContainText(receipt.lines[0].lotCode);
      }
      if (key === 'labels') {
        await page.getByLabel('Search label receipts', { exact: true }).fill(receipt.batch.publicCode);
        await choose(page, 'Accepted receipt', receipt.id);
        await expect(page.getByRole('heading', { name: '1. Print queue', exact: true })).toBeVisible();
        await expect(page.getByText(`Batch ${receipt.batch.publicCode}`, { exact: true })).toBeVisible();
      }
      if (key === 'settings') await expect(page.getByText('Africa/Lagos', { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${key} at ${width}px`).toBe(true);
      await page.screenshot({ path: `test-results/admin/${key}-${width}.png` });
    }
  }
  await navigate(page, 'QR lookup');
  const lookup = page.getByRole('region', { name: 'Exact code lookup' });
  await lookup.getByLabel('Product or Lot Code', { exact: true }).fill(receipt.lines[0].lotCode);
  await lookup.getByRole('button', { name: 'Find code', exact: true }).click();
  await expect(lookup.getByRole('status')).toContainText('Usable availability: 3');
  await lookup.getByLabel('Product or Lot Code', { exact: true }).fill('invalid');
  await expect(lookup.getByRole('status')).toHaveCount(0);
  await lookup.getByRole('button', { name: 'Find code', exact: true }).click();
  await expect(lookup.getByRole('alert')).toContainText('six-character');
});

test('read failures retry safely and changed code input cancels stale results', async ({ page }) => {
  test.setTimeout(120000);
  await login(page);
  const stockRoute = /\/api\/stock(?:\?|$)/;
  await page.route(stockRoute, route => route.fulfill({ status: 503, json: { message: 'Shop connection interrupted' } }));
  await navigate(page, 'Inventory',503);
  await expect(page.locator('#workspace-content').getByRole('alert')).toContainText('Shop connection interrupted');
  await page.unroute(stockRoute);
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.locator('#workspace-content').getByRole('alert')).toHaveCount(0);
  await navigate(page, 'Catalogue');
  const catalogue = await (await page.request.get('/api/catalogue')).json();
  const product = catalogue.products.find((row: { productCode?: string }) => row.productCode);
  expect(product).toBeTruthy();
  await navigate(page, 'QR lookup');
  const lookup = page.getByRole('region', { name: 'Exact code lookup' });
  let release!: () => void;
  let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**/api/inventory/products/by-code/${product.productCode}`, async route => {
    const response = await route.fetch(); started(); await held;
    await route.fulfill({ response }).catch(() => {}); // Client cancellation is the expected case.
  });
  await lookup.getByLabel('Product or Lot Code', { exact: true }).fill(product.productCode);
  await lookup.getByRole('button', { name: 'Find code', exact: true }).click();
  await ready;
  await lookup.getByLabel('Product or Lot Code', { exact: true }).fill('L23456');
  release();
  await expect(lookup.getByRole('button', { name: 'Find code', exact: true })).toBeEnabled();
  await expect(lookup.getByRole('status')).toHaveCount(0);
  // Real endpoint denial is still enforced independently of navigation.
  await navigate(page, 'Account & shop');
  const signedOut = page.waitForResponse(response => response.url().endsWith('/api/sessions/logout') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  // Sign-out is async: await the response, then confirm the signed-out screen.
  expect((await signedOut).status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Sign in to your shop', exact: true })).toBeVisible();
  expect((await page.request.get('/api/admin/shop')).status()).toBe(401);
});
