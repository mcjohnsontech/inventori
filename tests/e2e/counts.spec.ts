import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { choose } from './ui.js';
test('Manager targeted counts preserve exact evidence, retry safely and resolve only explained matching recounts', async ({ page }) => {
    test.setTimeout(180000);
    await page.goto('/');
    async function login(email: string) { await page.getByLabel('Email address').fill(email); await page.getByLabel('Password', { exact: true }).fill(process.env.E2E_PASSWORD!); const loginResponse = page.waitForResponse(r => new URL(r.url()).pathname === '/api/sessions'); await page.getByRole('button', { name: 'Sign in', exact: true }).click(); expect((await loginResponse).status()).toBe(200); await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible(); }
    async function post(path: string, data: object) { const r = await page.request.post('/api/' + path, { headers: { Origin: 'http://127.0.0.1:3101', 'Idempotency-Key': randomUUID() }, data }); expect(r.ok(), await r.text()).toBe(true); return r.json(); }
    async function get(path: string) { const r = await page.request.get('/api/' + path); expect(r.ok(), await r.text()).toBe(true); return r.json(); }
    await login('e2e-admin@dayari.test');
    const name = 'Count browser ' + randomUUID().slice(0, 8), catalogue = await get('catalogue');
    const source = (await post('catalogue/supplier-setups', { supplier: { name }, location: { registryId: catalogue.locations.find((r: any) => r.code === 'LG').id } })).source;
    const product = await post('catalogue/product-setups', { sourceId: source.id, product: { name: name + ' notebook' }, variants: [] });
    const receipt = await post('receipts', { sourceId: source.id, deliveredOn: '2020-01-01', lines: [{ skuId: product.skus[0].id, usableQuantity: 2, damagedQuantity: 0 }] });
    const units = (await get('receipts/' + receipt.id + '/units')).units;
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await login('e2e-manager@dayari.test');
    await page.goto('/#counts');
    await expect(page.getByRole('heading', { name: 'Targeted physical counts', exact: true })).toBeVisible();
    await page.getByRole('button',{name:'Count stock',exact:true}).click();
    await choose(page, 'Delivery lot', { label: `${name} notebook / Default / ${product.skus[0].fullCode} / ${receipt.lines[0].lotCode}` });
    await page.getByLabel('Count purpose', { exact: true }).fill('Selected physical sample for browser acceptance');
    await page.getByRole('button', { name: 'Start targeted count', exact: true }).click();
    await page.getByRole('button', { name: 'Begin count attempt', exact: true }).click();
    await page.getByLabel('Count explanation',{exact:true}).fill('Preserve this count draft when reopening its history row');
    await page.getByRole('button',{name:'Close task',exact:true}).click();
    await page.getByRole('table',{name:'Targeted count history',exact:true}).getByRole('row').filter({hasText:receipt.lines[0].lotCode}).getByRole('button',{name:'Open count',exact:true}).click();
    await expect(page.getByLabel('Count explanation',{exact:true})).toHaveValue('Preserve this count draft when reopening its history row');
    await page.route('**/api/count-observations', async (route) => { await route.fetch(); await route.abort('failed'); }, { times: 1 });
    const failed = page.waitForEvent('requestfailed', r => r.url().endsWith('/api/count-observations'));
    await page.getByLabel('Scan QR or enter Unit Code', { exact: true }).fill(units[0].unitCode);
    await page.getByRole('button', { name: 'Record observed item', exact: true }).click();
    await failed;
    await page.getByRole('button', { name: 'Retry saved count request', exact: true }).click();
    await expect(page.getByRole('table', { name: 'Observed count items' })).toContainText(units[0].unitCode);
    await page.getByLabel('Unidentified extra items', { exact: true }).fill('1');
    await page.getByLabel('Count explanation', { exact: true }).fill('One label was initially overlooked in this synthetic count');
    await page.getByLabel('Supporting evidence', { exact: true }).fill('Synthetic evidence only; no operational count or physical stock changed');
    page.on('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Confirm count evidence', exact: true }).click();
    await expect(page.getByText('NATIVE / MISMATCH', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Start explicit recount', exact: true }).click();
    for (const unit of units) {
        await page.getByLabel('Scan QR or enter Unit Code', { exact: true }).fill(unit.unitCode);
        await page.getByRole('button', { name: 'Record observed item', exact: true }).click();
        await expect(page.getByRole('table', { name: 'Observed count items' })).toContainText(unit.unitCode);
    }
    await page.getByLabel('Count explanation', { exact: true }).fill('Both saved labels explicitly observed during matching recount');
    await page.getByLabel('Supporting evidence', { exact: true }).fill('Synthetic recount acceptance evidence retained');
    await page.getByRole('button', { name: 'Confirm count evidence', exact: true }).click();
    await expect(page.getByText('NATIVE / MATCHED', { exact: true })).toBeVisible();
    page.removeAllListeners('dialog');
    page.once('dialog', dialog => dialog.accept('Earlier label was overlooked; matching recount confirms mistaken finding'));
    await page.getByRole('button', { name: 'Resolve mistaken finding with matching recount', exact: true }).click();
    await expect(page.getByText(/Mistaken finding resolved by matching recount:/)).toBeVisible();
    await mkdir('test-results/consolidation/completion/milestone-8b', { recursive: true });
    for (const width of [320, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.evaluate(()=>window.scrollTo(0,0));await page.getByRole('heading',{name:'Physical stock count',exact:true}).focus();await page.screenshot({ path: `test-results/consolidation/completion/milestone-8b/count-${width}.png`, fullPage: true });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button',{name:'Close task',exact:true}).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await login('e2e-production@dayari.test');
    expect((await page.request.get('/api/counts')).status()).toBe(403);
    await page.goto('/#counts');
    await expect(page.getByRole('button', { name: 'Start targeted count', exact: true })).toHaveCount(0);
});
