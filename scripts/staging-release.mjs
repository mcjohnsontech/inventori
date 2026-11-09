import { execFileSync } from 'node:child_process';
import { assertStaging } from './staging-environment.mjs';
assertStaging();
// Release runs after buildpack pruning: prisma and dotenv are runtime dependencies.
execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
  stdio: 'inherit', env: process.env,
});
