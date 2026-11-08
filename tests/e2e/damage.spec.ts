import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { choose } from './ui.js';

test('Production reports its own exact issued item and Manager reviews damaged stock without implicit recovery', async ({ page }) => {
  test.setTimeout(180000); await page.goto('/');
  const login = async (email: string) => {
    await page.getByLabel('Email address').fill(email); await page.getByLabel('Password', { exact: true }).fill(process.env.E2E_PASSWORD!);
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/sessions' && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click(); expect((await response).status()).toBe(200);
    await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  };
  await login('e2e-admin@dayari.test');
  const post = async (path: string, body: object) => {
    const result = await page.request.post('/api/' + path, { headers: { Origin: 'http://127.0.0.1:3101', 'Idempotency-Key': randomUUID() }, data: body });
    expect(result.ok(), await result.text()).toBe(true); return result.json();
  };
  const get = async (path: string) => { const result = await page.request.get('/api/' + path); expect(result.ok(), await result.text()).toBe(true); return result.json(); };
  const catalogue = await get('catalogue');
  const source = (await post('catalogue/supplier-setups', { supplier: { name: 'BAD browser ' + randomUUID().slice(0, 8) }, location: { registryId: catalogue.locations.find((row: any) => row.code === 'LG').id } })).source;
  const product = await post('catalogue/product-setups', { sourceId: source.id, product: { name: 'BAD browser notebook ' + randomUUID().slice(0, 8) }, variants: [] });
  const receipt = await post('receipts', { sourceId: source.id, deliveredOn: '2020-01-01', invoiceReference: 'PRIVATE-BAD-INVOICE', lines: [{ skuId: product.skus[0].id, usableQuantity: 3, damagedQuantity: 1, damageReason: 'Torn incoming packaging' }] });
  const units = (await get(`receipts/${receipt.id}/units`)).units.filter((unit: any) => unit.state === 'U');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await login('e2e-production@dayari.test');
  const checkout = await post('checkouts', { reason: { code: 'PRODUCTION_USE' }, orderReference: 'BAD browser order', lines: units.slice(0, 2).map((unit: any) => ({ unitId: unit.id })) });
  await page.getByRole('button', { name: 'Damage & BAD reports', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Damage & BAD reports', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Manager dispositions', exact: true })).toHaveCount(0);
  const add = async (code: string) => { await page.getByLabel('Scan individual QR or enter Unit Code', { exact: true }).fill(code); await page.getByRole('button', { name: 'Add item', exact: true }).click(); await expect(page.getByRole('button', { name: `Remove ${code}`, exact: true })).toBeVisible(); };
  await add(units[0].unitCode);
  await page.getByLabel('Damage cause', { exact: true }).fill('Cover torn'); await page.getByLabel('What happened', { exact: true }).fill('The cover tore during preparation of this item');
  await page.getByRole('button', { name: 'Review selected items', exact: true }).click(); await page.getByRole('button', { name: 'Back to items', exact: true }).click();
  await expect(page.getByLabel('Damage cause', { exact: true })).toHaveValue('Cover torn');
  page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('button', { name: 'Discard draft', exact: true }).click();
  const restored = page.waitForResponse(r => new URL(r.url()).pathname === '/api/damage-reports/preview' && r.request().method() === 'POST'); await page.reload(); expect((await restored).status()).toBe(200);
  await page.getByRole('button', { name: 'Review selected items', exact: true }).click();
  await mkdir('docs/images/completion/milestone-7', { recursive: true });
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 }); await page.evaluate(() => window.scrollTo(0, 0));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `docs/images/completion/milestone-7/bad-review-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 }); let lost = false; const keys: string[] = [];
  await page.route('**/api/damage-reports', async route => {
    if (route.request().method() !== 'POST') return route.continue(); keys.push(route.request().headers()['idempotency-key']!);
    if (lost) return route.continue(); const response = await route.fetch(); expect(response.ok()).toBe(true); lost = true; await route.abort('failed');
  });
  await page.getByRole('button', { name: 'Confirm BAD report for 1 item', exact: true }).click(); await expect(page.getByRole('button', { name: 'Retry saved damage command', exact: true })).toBeVisible();
  await page.reload(); await page.getByRole('button', { name: 'Retry saved damage command', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'BAD report recorded', exact: true })).toBeFocused(); expect(keys).toHaveLength(2); expect(keys[1]).toBe(keys[0]);
  const ownHistory = await get('damage-reports'), report = await get('damage-reports/' + ownHistory.rows[0].id);
  expect(report.lines[0].checkoutId).toBe(checkout.id); expect(report.lines[0].unit.unitId).toBe(units[0].id); expect(JSON.stringify(report)).not.toContain('PRIVATE-BAD-INVOICE');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await login('e2e-manager@dayari.test');
  const stock = await get(`stock?batchId=${receipt.batch.id}`); expect(stock.lots[0]).toMatchObject({ usable: '1', damaged: '2' });
  await page.getByRole('button', { name: 'Damage & BAD reports', exact: true }).click(); await page.getByRole('button', { name: 'Manager dispositions', exact: true }).click(); await add(units[0].unitCode);
  await choose(page, 'Disposition', 'REWORKED'); await page.getByLabel('Review evidence', { exact: true }).fill('Cover reworked but no recovery authorization exists');
  await page.getByRole('button', { name: 'Review selected items', exact: true }).click();
  const reviewed = page.waitForResponse(r => new URL(r.url()).pathname === '/api/damage-reviews' && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Confirm review for 1 item', exact: true }).click(); expect((await reviewed).status()).toBe(201);
  await expect(page.getByRole('heading', { name: 'Damage review recorded', exact: true })).toBeFocused();
  expect((await get(`stock?batchId=${receipt.batch.id}`)).lots).toEqual(stock.lots);
  const timeline = await get(`units/${units[0].id}/tracking`); expect(timeline.timeline.events.some((event: any) => event.kind === 'BAD_REPORTED')).toBe(true);
  expect(timeline.timeline.events.some((event: any) => event.kind === 'DAMAGE_REVIEWED' && event.damageOutcome === 'REWORKED')).toBe(true);
  await page.screenshot({ path: 'docs/images/completion/milestone-7/damage-review-accepted-1440.png', fullPage: true });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await login('e2e-production@dayari.test');
  const ownTimeline = await get(`units/${units[0].id}/tracking`); expect(ownTimeline.timeline.events.some((event: any) => event.kind === 'BAD_REPORTED')).toBe(true);
  expect(JSON.stringify(ownTimeline)).not.toContain('Cover reworked'); expect(ownTimeline.timeline.events.some((event: any) => event.kind === 'DAMAGE_REVIEWED')).toBe(false);
  expect((await page.request.get('/api/damage-reviews')).status()).toBe(403);
});
