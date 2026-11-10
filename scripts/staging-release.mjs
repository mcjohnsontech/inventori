import { execFileSync } from 'node:child_process';
import { assertStaging } from './staging-environment.mjs';
import { invitationConfig } from '../apps/api/dist/invitation-mail.js';
assertStaging(process.env, { allowVerifiedInvitations: true });
if (process.env.INVITATION_TRANSPORT === 'smtp' && invitationConfig()?.transport.mode !== 'smtp')
  throw new Error('Approved staging SMTP configuration is incomplete');
// Release runs after buildpack pruning: prisma and dotenv are runtime dependencies.
execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
  stdio: 'inherit', env: process.env,
});
