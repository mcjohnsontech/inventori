import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { defineConfig } from '@playwright/test';
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !new URL(testUrl).pathname.endsWith('_test') || !['localhost', '127.0.0.1'].includes(new URL(testUrl).hostname)) throw new Error('E2E requires TEST_DATABASE_URL pointing to a local *_test database');
process.env.E2E_PASSWORD ??= randomBytes(24).toString('hex');
process.env.E2E_NODE_ID = '22222222-2222-4222-8222-222222222222';
export default defineConfig({
  testDir: 'tests/e2e', fullyParallel: false, workers: 1, timeout: 60000,
  globalSetup: './tests/e2e/setup.ts',
  use: { baseURL: 'http://127.0.0.1:3101', channel: process.env.PLAYWRIGHT_CHANNEL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: [
    { command: 'node apps/api/dist/main.js', url: 'http://127.0.0.1:4101/v1/health', reuseExistingServer: false, env: { DATABASE_URL: testUrl, SHOP_NODE_ID: process.env.E2E_NODE_ID, AUTHORITY_MODE: 'SHOP', PORT: '4101' } },
    { command: 'npm exec --workspace @dayari/web -- next dev --webpack --hostname 127.0.0.1 --port 3101', url: 'http://127.0.0.1:3101', reuseExistingServer: false, timeout: 120000, env: { API_URL: 'http://127.0.0.1:4101', APP_ORIGIN: 'http://127.0.0.1:3101', DAYARI_E2E: '1' } },
  ],
});
