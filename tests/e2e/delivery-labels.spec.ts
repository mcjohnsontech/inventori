import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

const origin = 'http://127.0.0.1:3101';
async function post(page: Page, path: string, data: object) { const response = await page.request.post('/api/' + path, { headers: { Origin: origin, 'Idempotency-Key': randomUUID() }, data }); expect(response.status(), await response.text()).toBe(201); return response.json(); }

// Owner request 26 Nov 2026: Deliveries show items received and label status; printing from a
// delivery shows exactly that delivery's items.
test('a delivery shows its item count and label status, and prints exactly its own items', async ({ page }) => {
  test.setTimeout(150000);
  await page.goto('/'); await page.getByLabel('Email address').fill('e2e-manager@dayari.test'); await page.getByLabel('Password', { exact: true }).fill(process.env.E2E_PASSWORD!); await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible({ timeout: 30000 });
  const catalogue = await (await page.request.get('/api/catalogue')).json();
  const vendor = await post(page, 'receiving/supplier-setups', { supplier: { name: `Label flow ${randomUUID().slice(0, 8)}` }, location: { registryId: catalogue.locations[0].id } });
  const product = await post(page, 'receiving/product-setups', { sourceId: vendor.source.id, product: { name: `Label Flow ${randomUUID().slice(0, 8)}`, description: '' }, variants: [] });
  const receipt = await post(page, 'receipts', { sourceId: vendor.source.id, deliveredOn: '2020-01-01', lines: [{ skuId: product.skus[0].id, usableQuantity: 4, damagedQuantity: 1, damageReason: 'Torn cover on arrival' }] });
  // A second delivery, so a wrong (unfiltered) cart would be noticeable.
  await post(page, 'receipts', { sourceId: vendor.source.id, deliveredOn: '2020-01-01', lines: [{ skuId: product.skus[0].id, usableQuantity: 3, damagedQuantity: 0, damageReason: '' }] });

  await page.getByRole('navigation', { name: 'Workspace' }).getByRole('button', { name: 'Deliveries', exact: true }).click();
  const row = page.getByRole('button', { name: `View receipt ${receipt.batch.publicCode}`, exact: true });
  await expect(row).toContainText('5 items received'); await expect(row).toContainText('Labels not printed');
  await row.click();
  await page.getByRole('button', { name: /Print individual unit labels/ }).click();
  const banner = page.getByRole('region', { name: 'Selected delivery' });
  await expect(banner).toContainText(`Delivery ${receipt.batch.publicCode}: 5 items. 5 still need a label and are in the print cart.`);
  await expect(page.getByRole('button', { name: /Print cart/ })).toContainText('5');
  const units = (await (await page.request.get(`/api/receipts/${receipt.id}/units?page=1`)).json()).units.map((u: { unitCode: string }) => u.unitCode);
  for (const code of units) await expect(page.getByRole('region', { name: 'Choose items' })).toContainText(code);

  await page.getByRole('link', { name: 'Show all stock instead', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Selected delivery' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Print labels', exact: true })).toBeVisible();
});
