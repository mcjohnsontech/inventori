import { openWorkspace } from './ui.js';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { encodeUnitQr } from '@dayari/contracts';

test('unit tracking preserves browsing context, records retry-safe QR presentations and filters Production history', async ({ page }) => {
  test.setTimeout(180000);
  await page.goto('/');
  const login = async (email: string) => {
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(process.env.E2E_PASSWORD!);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  };
  await login('e2e-admin@dayari.test');
  const post = async (path: string, body: object) => {
    const response = await page.request.post('/api/' + path, { headers: { Origin: 'http://127.0.0.1:3101', 'Idempotency-Key': randomUUID() }, data: body });
    expect(response.ok(), await response.text()).toBe(true); return response.json();
  };
  const catalogue = await (await page.request.get('/api/catalogue')).json();
  const source = (await post('catalogue/supplier-setups', { supplier: { name: 'Private tracking supplier ' + randomUUID().slice(0,8) }, location: { registryId: catalogue.locations.find((location:any) => location.code === 'LG').id } })).source;
  const product = await post('catalogue/product-setups', { sourceId: source.id, product: { name: 'Tracking browser notebook ' + randomUUID().slice(0,8) }, variants: [] });
  const receipt = await post('receipts', { sourceId: source.id, deliveredOn: '2020-01-01', invoiceReference: 'PRIVATE-INVOICE', lines: [{ skuId: product.skus[0].id, usableQuantity: 2, damagedQuantity: 1, damageReason: 'PRIVATE damaged fixture' }] });
  const units = (await (await page.request.get(`/api/receipts/${receipt.id}/units`)).json()).units;
  const unit = units.find((unit:any) => unit.state === 'U'), damaged = units.find((unit:any) => unit.state === 'D');
  const job = await post('unit-label-jobs', { kind: 'INITIAL', unitIds: [unit.id], profileId: 'unit-a4-70x35-v2' });
  await post(`unit-label-jobs/${job.id}/artifact`, {});
  await post(`unit-label-jobs/${job.id}/handoffs`, { attemptId: randomUUID() });

  await page.getByRole('button', { name: 'Inventory', exact: true }).click();
  const search = page.getByLabel('Search inventory', { exact: true });
  await search.fill(unit.unitCode.toLowerCase());
  const match = page.getByRole('region', { name: 'Exact individual item match', exact: true });
  await expect(match).toContainText(unit.unitCode);
  const open = match.getByRole('button', { name: 'View unit history', exact: true }); await open.click();
  const drawer = page.getByRole('dialog', { name: `Unit ${unit.unitCode}`, exact: true });
  await expect(drawer.getByText('Device print dialog requested', { exact: true })).toBeVisible();
  await expect(drawer.getByText('Physical printing and attachment are not confirmed.', { exact: true })).toBeVisible();
  await mkdir('test-results/consolidation/completion/milestone-4', { recursive: true });
  for (const width of [320,390,768,1024,1440]) {
    await page.setViewportSize({ width, height: 900 });
    await drawer.evaluate(element => { element.scrollTop = 0; });
    expect(await drawer.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/consolidation/completion/milestone-4/unit-drawer-${width}.png` });
  }
  await page.keyboard.press('Escape'); await expect(drawer).toHaveCount(0);
  await expect(search).toHaveValue(unit.unitCode.toLowerCase()); await expect(open).toBeFocused();

  await page.goto('/#receipts/' + receipt.id);
  await page.getByText('View received Unit Codes', { exact: true }).click();
  await page.getByRole('button', { name: `Track unit ${unit.unitCode}`, exact: true }).click();
  await expect(drawer).toBeVisible(); await drawer.getByRole('button', { name: 'Close unit details', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Received physical units', exact: true })).toBeVisible();

  await openWorkspace(page, 'QR lookup');
  let first = true, key = '';
  await page.route('**/api/unit-observations', async route => {
    if (first) { first = false; key = route.request().headers()['idempotency-key']!; const response = await route.fetch(); expect(response.status()).toBe(201); return route.fulfill({ status:503, json:{message:'Synthetic response lost after QR history commit'} }); }
    expect(route.request().headers()['idempotency-key']).toBe(key); return route.continue();
  });
  await page.getByLabel('Scan or enter QR payload', { exact: true }).fill(encodeUnitQr(receipt.batch.originId, unit.id));
  await page.getByRole('button', { name: 'Resolve QR', exact: true }).click();
  const presentation = page.getByRole('region', { name: 'QR presentation evidence', exact: true });
  await expect(presentation).toContainText('history was not confirmed');
  await expect(page.getByRole('region', { name: 'Resolved individual unit', exact: true })).toContainText(unit.unitCode);
  await presentation.getByRole('button', { name: 'Retry scan record', exact: true }).click();
  await expect(presentation).toContainText('QR presentation recorded. No stock was changed.');
  await page.unroute('**/api/unit-observations');
  const accepted = await (await page.request.get(`/api/units/${unit.id}/tracking`)).json();
  expect(accepted.timeline.events.filter((event:any) => event.kind === 'QR_PRESENTED')).toHaveLength(1);

  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await login('e2e-production@dayari.test'); await openWorkspace(page, 'QR lookup');
  await page.getByLabel('Scan or enter QR payload', { exact: true }).fill(encodeUnitQr(receipt.batch.originId, unit.id));
  await page.getByRole('button', { name: 'Resolve QR', exact: true }).click(); await expect(presentation).toContainText('QR presentation recorded');
  await page.getByRole('button', { name: 'View unit history', exact: true }).click();
  await expect(drawer.getByRole('heading', { name: 'Your QR presentations', exact: true })).toBeVisible();
  await expect(drawer.getByText('QR identity presented', { exact: true })).toHaveCount(1);
  await expect(drawer).not.toContainText('Device print dialog requested'); await expect(drawer).not.toContainText('Private tracking supplier'); await expect(drawer).not.toContainText('PRIVATE');
  await drawer.getByRole('button', { name: 'Close unit details', exact: true }).click();
  await page.getByLabel('Individual Unit Code', { exact: true }).fill(damaged.unitCode);
  await page.getByRole('button', { name: 'Find unit', exact: true }).click();
  await page.getByRole('button', { name: 'View unit history', exact: true }).click();
  const restricted = page.getByRole('dialog', { name: `Unit ${damaged.unitCode}`, exact: true });
  await expect(restricted).toContainText('Unavailable for checkout'); await expect(restricted).not.toContainText('Damaged');
  await expect(restricted).not.toContainText('PRIVATE');
});
