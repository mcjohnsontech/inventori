import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { choose } from './ui';

test('progressive setup retains drafts and reuses products across supplier prefixes', async ({ page }) => {
  // This end-to-end scenario includes two suppliers, product reuse, extension and discard.
  test.setTimeout(120000);
  await page.goto('/');
  expect((await page.request.post('/api/sessions', { headers: { Origin: 'https://untrusted.example' }, data: {} })).status()).toBe(403);
  await page.getByLabel('Email address').fill('e2e-admin@dayari.test');
  await page.getByLabel('Password', { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Catalogue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Product catalogue' })).toBeVisible();
  // Bound visual evidence to the viewport; retained database fixtures must not create unbounded full-page bitmaps.
  const dialog = page.getByRole('dialog');
  const next = () => dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  async function addSupplier(name: string) {
    await page.getByRole('button', { name: 'Add supplier', exact: true }).first().click();
    await expect(dialog.getByRole('combobox', { name: 'Supplier', exact: true })).toHaveCount(0);
    await dialog.getByRole('textbox', { name: 'Supplier name', exact: true }).fill(name);
    await next();
    await choose(dialog, 'Location registry', { label: 'Lagos (LG)' });
    await dialog.getByRole('textbox', { name: 'Specific source or area (optional)', exact: true }).fill('Lagos Island');
    await next();
    await expect(dialog.getByRole('heading', { name: 'Review prefix', exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(dialog.getByRole('textbox', { name: 'Specific source or area (optional)', exact: true })).toHaveValue('Lagos Island');
    await next();
    await page.screenshot({ path: 'test-results/supplier-prefix-review.png', fullPage: false });
    const response = page.waitForResponse(response => response.url().endsWith('/api/catalogue/supplier-setups') && response.request().method() === 'POST');
    await dialog.getByRole('button', { name: 'Save supplier location' }).click();
    const result = await (await response).json();
    await expect(dialog).toBeHidden();
    expect(result.prefix.code).toBe(`${result.supplier.code}LG`);
    return result;
  }
  async function startProduct(supplier: { supplier: { id: string }; source: { id: string } }) {
    await page.getByRole('button', { name: 'Add product', exact: true }).click();
    await choose(dialog, 'Supplier', supplier.supplier.id);
    await choose(dialog, 'Supplier location', supplier.source.id);
    await next();
  }
  async function saveProduct() {
    const response = page.waitForResponse(response => response.url().endsWith('/api/catalogue/product-setups') && response.request().method() === 'POST');
    await dialog.getByRole('button', { name: 'Save product', exact: true }).click();
    const result = await (await response).json();
    await expect(dialog).toBeHidden();
    return result;
  }
  const first = await addSupplier(`Chioma ${randomUUID().slice(0, 8)}`);
  await startProduct(first);
  await dialog.getByRole('textbox', { name: 'Product name', exact: true }).fill(`Progressive notebook ${randomUUID().slice(0, 8)}`);
  await next();
  await choose(dialog, 'Does this product have options?', 'yes');
  await dialog.getByRole('textbox', { name: 'Colour', exact: true }).fill('Red');
  await dialog.getByRole('textbox', { name: 'Variant suffix', exact: true }).fill('RED-A5');
  await dialog.getByRole('button', { name: 'Add variant row' }).click();
  await dialog.getByRole('textbox', { name: 'Colour', exact: true }).nth(1).fill('Brown');
  await dialog.getByRole('textbox', { name: 'Variant suffix', exact: true }).nth(1).fill('BRN-A5');
  await dialog.getByRole('textbox', { name: 'Another attribute', exact: true }).fill('Size');
  await dialog.getByRole('button', { name: 'Add attribute', exact: true }).click();
  for (const field of await dialog.getByRole('textbox', { name: 'Size', exact: true }).all()) await field.fill('A5');
  await next();
  await expect(dialog.getByRole('cell', { name: `${first.prefix.code}•••••-RED-A5`, exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: 'Colour', exact: true }).first()).toHaveValue('Red');
  await next();
  await page.screenshot({ path: 'test-results/product-setup-review-desktop.png', fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/product-setup-review-mobile.png', fullPage: false });
  expect((await dialog.boundingBox())!.width).toBeLessThanOrEqual(390);
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog,[role="dialog"]')))).toBe(true);
  const saved = await saveProduct();
  expect(saved.sourcing.baseCode.slice(first.prefix.code.length)).toMatch(/^\d{5}$/);
  expect(saved.skus).toHaveLength(2);
  await page.setViewportSize({ width: 1280, height: 900 });
  const second = await addSupplier(`Second ${randomUUID().slice(0, 8)}`);
  await startProduct(second);
  await choose(dialog, 'Product', saved.product.id);
  await next();
  for (const sku of saved.skus) {
    const variant = saved.product.variants.find((row: { id: string }) => row.id === sku.variantId);
    await dialog.getByRole('textbox', { name: `${variant.name} suffix`, exact: true }).fill(sku.suffix);
  }
  await next();
  const secondSaved = await saveProduct();
  expect(secondSaved.product.id).toBe(saved.product.id);
  expect(secondSaved.sourcing.baseCode).not.toBe(saved.sourcing.baseCode);
  await startProduct(first);
  await dialog.getByRole('textbox', { name: 'Product name', exact: true }).fill('Unsaved draft');
  await page.keyboard.press('Escape');
  await dialog.getByRole('button', { name: 'Keep editing' }).click();
  await expect(dialog.getByRole('textbox', { name: 'Product name', exact: true })).toHaveValue('Unsaved draft');
  await page.keyboard.press('Escape');
  await dialog.getByRole('button', { name: 'Discard draft' }).click();
  await expect(dialog).toBeHidden();
  const data = await (await page.request.get('/api/catalogue')).json();
  expect(data.products.some((row: { name: string }) => row.name === 'Unsaved draft')).toBe(false);
  await startProduct(first);
  await choose(dialog, 'Product', saved.product.id);
  await next();
  await dialog.getByRole('button', { name: 'Add new variant combinations', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Colour', exact: true }).fill('Green');
  await dialog.getByRole('textbox', { name: 'Size', exact: true }).fill('A5');
  await dialog.getByRole('textbox', { name: 'Variant suffix', exact: true }).fill('GRN-A5');
  await dialog.getByRole('button', { name: 'Add variant row' }).click();
  await dialog.getByRole('textbox', { name: 'Colour', exact: true }).nth(1).fill('Tan');
  await dialog.getByRole('textbox', { name: 'Size', exact: true }).nth(1).fill('A5');
  await dialog.getByRole('textbox', { name: 'Variant suffix', exact: true }).nth(1).fill('TAN-A5');
  await next();
  await dialog.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: 'Colour', exact: true }).first()).toHaveValue('Green');
  await page.keyboard.press('Escape');
  await dialog.getByRole('button', { name: 'Keep editing' }).click();
  await expect(dialog.getByRole('textbox', { name: 'Colour', exact: true }).nth(1)).toHaveValue('Tan');
  await next();
  const extended = await saveProduct();
  expect(extended.sourcing).toEqual(saved.sourcing);
  expect(extended.product.id).toBe(saved.product.id);
  expect(extended.skus).toHaveLength(2);
  const after = await (await page.request.get('/api/catalogue')).json();
  for (const sku of saved.skus) expect(after.skus.find((row: { id: string }) => row.id === sku.id).fullCode).toBe(sku.fullCode);
  await page.getByRole('button', { name: 'Suppliers', exact: true }).click();
  await page.getByLabel('Search catalogue', { exact: true }).fill(second.supplier.name);
  await page.getByRole('button', { name: `Set up location for ${second.supplier.name}`, exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'Set up supplier location', exact: true })).toBeVisible();
  await expect(dialog.getByRole('combobox', { name: 'Supplier', exact: true })).toHaveCount(0);
  await expect(dialog.getByText(second.supplier.name, { exact: true })).toBeVisible();
  await next();
  await expect(dialog.getByRole('combobox', { name: 'Location registry', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await dialog.getByRole('button', { name: 'Discard draft' }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to your shop' })).toBeVisible();
});


test('existing product with attributes and no combinations can create its first variants', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email address').fill('e2e-admin@dayari.test');
  await page.getByLabel('Password', { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Catalogue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Product catalogue' })).toBeVisible();
  async function create(operation: string, data: unknown) {
    const response = await page.request.post(`/api/catalogue/${operation}`, {
      headers: { Origin: 'http://127.0.0.1:3101', 'Idempotency-Key': randomUUID() }, data,
    });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  }
  const catalogue = await (await page.request.get('/api/catalogue')).json();
  const supplier = await create('supplier-setups', {
    supplier: { name: `Variant regression ${randomUUID().slice(0, 8)}` },
    location: { registryId: catalogue.locations.find((row: { code: string }) => row.code === 'LG').id },
  });
  const product = await create('products', { name: `Unconfigured variants ${randomUUID().slice(0, 8)}` });
  await create('attributes', { productId: product.id, name: 'Colour' });
  await create('attributes', { productId: product.id, name: 'Size' });
  await page.reload();
  await page.getByRole('button', { name: 'Add product', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const next = () => dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await choose(dialog, 'Supplier', supplier.supplier.id);
  await choose(dialog, 'Supplier location', supplier.source.id);
  await next();
  await choose(dialog, 'Product', product.id);
  await next();
  await expect(dialog.getByText('This product has attributes but no saved variant combinations yet.', { exact: false })).toBeVisible();
  await next();
  await expect(dialog.getByRole('heading', { name: 'Variants', exact: true })).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Colour', exact: true }).fill('Red');
  await dialog.getByRole('textbox', { name: 'Size', exact: true }).fill('A5');
  await dialog.getByRole('textbox', { name: 'Variant suffix', exact: true }).fill('RED-A5');
  await page.screenshot({ path: 'test-results/first-existing-product-variant.png' });
  await next();
  await expect(dialog.getByRole('cell', { name: 'Red / A5', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: 'Colour', exact: true })).toHaveValue('Red');
  await next();
  const response = page.waitForResponse(response => response.url().endsWith('/api/catalogue/product-setups') && response.request().method() === 'POST');
  await dialog.getByRole('button', { name: 'Save product', exact: true }).click();
  const saved = await (await response).json();
  await expect(dialog).toBeHidden();
  expect(saved.product.id).toBe(product.id);
  expect(saved.skus).toHaveLength(1);
  expect(saved.skus[0].suffix).toBe('RED-A5');
});
