import 'dotenv/config';
import { defineConfig } from 'vitest/config';
// Never inherit operational SMTP activation from a developer's private .env.
// Invitation suites explicitly inject isolated/fake transports; TLS tests use loopback.
export default defineConfig({ test: { include: ['tests/integration/**/*.test.ts'], env: { INVITATION_TRANSPORT: 'disabled', INVITATION_LIVE_ENABLED: '0', SMTP_SENDER_VERIFIED: '0' }, fileParallelism: false, testTimeout: 20000, hookTimeout: 30000 } });
