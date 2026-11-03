import { expect, test } from '@playwright/test';

test('workspace navigation is usable across shop screen sizes', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/');
  await page.getByLabel('Email address').fill('e2e-admin@dayari.test');
  await page.getByLabel('Password', { exact: true }).fill(process.env.E2E_PASSWORD!);
  const signedIn = page.waitForResponse(response => response.url().endsWith('/api/sessions') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  expect((await signedIn).status()).toBe(200);
  await page.getByRole('button', { name: 'Catalogue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Product catalogue' })).toBeVisible();
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome, Test', exact: true })).toBeVisible();
  await expect(page.getByText('Registered products', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/admin-dashboard-1440.png' });
  await page.getByRole('button', { name: 'Catalogue', exact: true }).click();
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    if (width < 1024) await page.getByRole('button', { name: 'Open navigation' }).click();
    await page.getByRole('navigation', { name: 'Workspace' }).getByRole('button', { name: 'QR lookup', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'QR lookup', exact: true })).toBeVisible();
    await expect(page).toHaveURL(/#qr$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/admin-navigation-${width}.png` });
    if (width < 1024) await page.getByRole('button', { name: 'Open navigation' }).click();
    await page.getByRole('navigation', { name: 'Workspace' }).getByRole('button', { name: 'Catalogue', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Product catalogue' })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open navigation' })).toBeFocused();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Product catalogue' })).toBeVisible();
});
