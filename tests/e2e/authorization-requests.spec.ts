import { openWorkspace } from './ui.js';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { choose } from './ui.js';

test('Manager records pending recovery/correction evidence with retry, while Admin reviews and Production is denied', async ({ page }) => {
  test.setTimeout(180000); await page.goto('/');
  const login = async (email: string) => {
    await page.getByLabel('Email address').fill(email); await page.getByLabel('Password', { exact: true }).fill(process.env.E2E_PASSWORD!);
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/sessions' && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click(); expect((await response).status()).toBe(200); await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  };
  await login('e2e-admin@dayari.test');
  const post = async (path: string, body: object) => {
    const result = await page.request.post('/api/' + path, { headers: { Origin: 'http://127.0.0.1:3101', 'Idempotency-Key': randomUUID() }, data: body });
    expect(result.ok(), await result.text()).toBe(true); return result.json();
  };
  const get = async (path: string) => { const result = await page.request.get('/api/' + path); expect(result.ok(), await result.text()).toBe(true); return result.json(); };
  const catalogue = await get('catalogue'), unique = randomUUID().slice(0, 8);
  const source = (await post('catalogue/supplier-setups', { supplier: { name: 'Request browser ' + unique }, location: { registryId: catalogue.locations.find((row: any) => row.code === 'LG').id } })).source;
  const product = await post('catalogue/product-setups', { sourceId: source.id, product: { name: 'Request browser notebook ' + unique }, variants: [] });
  const receipt = await post('receipts', { sourceId: source.id, deliveredOn: '2020-01-01', lines: [{ skuId: product.skus[0].id, usableQuantity: 3, damagedQuantity: 2, damageReason: 'Damaged incoming packaging' }] });
  const stockBefore = (await get(`stock?batchId=${receipt.batch.id}`)).lots, lot = stockBefore[0];
  const unit = (await get(`receipts/${receipt.id}/units`)).units.find((row: any) => row.state === 'D');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await login('e2e-manager@dayari.test');
  await openWorkspace(page, 'Recovery & corrections');await page.getByRole('button',{name:'New recovery / correction request',exact:true}).click();
  await page.getByLabel('Recovery Unit Code or individual QR', { exact: true }).fill(unit.unitCode); await page.getByRole('button', { name: 'Add unit', exact: true }).click();
  await expect(page.getByRole('button', { name: `Remove ${unit.unitCode}`, exact: true })).toBeVisible();
  await page.getByLabel('Request explanation', { exact: true }).fill('Inspect repaired cover for possible recovery');
  await page.getByLabel('Supporting evidence', { exact: true }).fill('Original damaged intake and repair observations recorded');
  await page.getByRole('button', { name: 'Review request', exact: true }).click(); await page.getByRole('button', { name: 'Back to request', exact: true }).click();
  await expect(page.getByLabel('Request explanation', { exact: true })).toHaveValue('Inspect repaired cover for possible recovery');
  page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('button', { name: 'Discard request draft', exact: true }).click();
  const restored = page.waitForResponse(r => new URL(r.url()).pathname === '/api/authorization-requests/preview' && r.request().method() === 'POST'); await page.reload(); expect((await restored).status()).toBe(200);
  await page.getByRole('button', { name: 'Review request', exact: true }).click();
  let lost = false; const keys: string[] = [];
  await page.route('**/api/authorization-requests', async route => {
    if (route.request().method() !== 'POST') return route.continue(); keys.push(route.request().headers()['idempotency-key']!);
    if (lost) return route.continue(); const result = await route.fetch(); expect(result.ok()).toBe(true); lost = true; await route.abort('failed');
  });
  await page.getByRole('button', { name: 'Record pending request', exact: true }).click(); await expect(page.getByRole('button', { name: 'Retry saved pending request', exact: true })).toBeVisible();
  await page.reload(); await page.getByRole('button', { name: 'Retry saved pending request', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Request recorded — pending authorization', exact: true })).toBeFocused(); expect(keys).toHaveLength(2); expect(keys[1]).toBe(keys[0]);
  expect((await get(`stock?batchId=${receipt.batch.id}`)).lots).toEqual(stockBefore);
  await page.unroute('**/api/authorization-requests');
  await page.getByRole('button', { name: 'Start another request', exact: true }).click(); await choose(page, 'New request kind', 'CORRECTION');
  await page.getByRole('searchbox', { name: 'Find a correction lot', exact: true }).fill(lot.lotCode);
  await page.getByRole('button', { name: 'Choose lot', exact: true }).click();
  await page.getByLabel('Reported observed quantity', { exact: true }).fill('2');
  await page.getByLabel('Request explanation', { exact: true }).fill('One item was not found during shelf observation');
  await page.getByLabel('Supporting evidence', { exact: true }).fill('Observed two usable items against the recorded three; investigation remains open');
  await page.getByRole('button', { name: 'Review request', exact: true }).click();
  await expect(page.getByText('Reviewed ledger 3 · projection 3 · reported observation 2', { exact: true })).toBeVisible();
  await mkdir('test-results/consolidation/completion/milestone-7', { recursive: true });
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 }); await page.evaluate(() => window.scrollTo(0, 0)); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/consolidation/completion/milestone-7/pending-request-review-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  const accepted = page.waitForResponse(r => new URL(r.url()).pathname === '/api/authorization-requests' && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Record pending request', exact: true }).click(); const response = await accepted; expect(response.status()).toBe(201); const result = await response.json();
  await expect(page.getByRole('heading', { name: 'Request recorded — pending authorization', exact: true })).toBeFocused();
  expect(result).toMatchObject({ requestedDelta: '-1', observedQuantity: '2', stockChanged: false, status: 'PENDING_CLOUD_AUTHORIZATION' });
  expect((await get(`stock?batchId=${receipt.batch.id}`)).lots).toEqual(stockBefore); expect((await get(`receipts/${receipt.id}/units`)).total).toBe(5);
  await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: 'test-results/consolidation/completion/milestone-7/pending-request-accepted-1440.png', fullPage: true });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await login('e2e-admin@dayari.test');
  await openWorkspace(page, 'Recovery & corrections');
  await expect(page.getByLabel('New request kind', { exact: true })).toHaveCount(0); await expect(page.getByRole('button', { name: /approve|execute|authorize/i })).toHaveCount(0);
  await choose(page, 'Request type', 'CORRECTION'); await page.getByRole('button', { name: 'View request', exact: true }).first().click();
  await expect(page.getByRole('dialog', { name: 'Pending request evidence', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog').getByText('Requested difference — not applied', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close request details', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await login('e2e-production@dayari.test');
  await expect(page.getByRole('button', { name: 'Recovery & corrections', exact: true })).toHaveCount(0); expect((await page.request.get('/api/authorization-requests')).status()).toBe(403);
});
