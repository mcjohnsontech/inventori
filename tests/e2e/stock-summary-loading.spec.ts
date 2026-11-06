import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('overview never presents missing stock data as zero and recovers after a read failure', async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let fail = true;
  await page.route('**/api/stock', async route => {
    // Development Strict Mode may start and cancel more than one read.
    // Hold all initial reads, so a second request cannot bypass the fixture.
    await held;
    if (fail) {
      await route.fulfill({ status: 503, json: { message: 'Synthetic stock read failure' } });
    } else await route.continue();
  });
  await page.goto('/');
  await page.getByLabel('Email address').fill('e2e-admin@dayari.test');
  await page.getByLabel('Password', { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const summary = page.locator('[aria-label="Stock summary"]');
  await expect(summary).toHaveAttribute('aria-busy', 'true');
  await expect(summary.locator('strong')).toHaveText(['Loading…', 'Loading…', 'Loading…', 'Loading…']);
  release();
  await expect(page.getByRole('alert').filter({ hasText: 'Synthetic stock read failure' })).toBeVisible();
  await expect(summary.locator('strong')).toHaveText(['Unavailable', 'Unavailable', 'Unavailable', 'Unavailable']);
  fail = false;
  await page.getByRole('button', { name: 'Refresh stock', exact: true }).click();
  await expect(summary).toHaveAttribute('aria-busy', 'false');
  await expect(summary.locator('strong').first()).toHaveText(/^\d+$/);
  await mkdir('docs/images/completion/milestone-1', { recursive: true });
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `docs/images/completion/milestone-1/overview-${width}.png` });
  }
});
