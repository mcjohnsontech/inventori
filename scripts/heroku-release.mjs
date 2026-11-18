import { execFileSync } from 'node:child_process';
import { assertProduction } from './production-environment.mjs';

if (process.env.DAYARI_DEPLOYMENT === 'production') {
  assertProduction();
  const { invitationConfig } = await import('../apps/api/dist/invitation-mail.js');
  if (process.env.INVITATION_TRANSPORT === 'smtp' && invitationConfig()?.transport.mode !== 'smtp')
    throw new Error('Production SMTP configuration is incomplete');
  // This cutover authorizes no new schema changes. Fail instead of applying any.
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'status'], {
    stdio: 'inherit', env: process.env,
  });
} else {
  await import('./staging-release.mjs');
}
