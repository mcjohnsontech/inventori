import type { NextConfig } from 'next';
const config: NextConfig = { devIndicators: false, logging: { incomingRequests: { ignore: [/\/accept-invitation/] } }, async headers(){return [{source:'/accept-invitation',headers:[{key:'Referrer-Policy',value:'no-referrer'},{key:'Cache-Control',value:'no-store'}]}];}, poweredByHeader: false, distDir: process.env.DAYARI_E2E === '1' ? '.next-e2e' : '.next' };
export default config;
