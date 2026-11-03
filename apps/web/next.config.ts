import type { NextConfig } from 'next';
const config: NextConfig = { devIndicators: false, poweredByHeader: false, distDir: process.env.DAYARI_E2E === '1' ? '.next-e2e' : '.next' };
export default config;
