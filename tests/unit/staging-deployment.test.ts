import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('hosted staging helpers reject local databases, wrong authority, missing deployment markers and live mail', () => {
  const script = `import assert from 'node:assert/strict';
    import {assertStaging} from './scripts/staging-environment.mjs';
    const valid={DAYARI_DEPLOYMENT:'staging',NODE_ENV:'production',DYNO:'release.1',AUTHORITY_MODE:'SHOP',SHOP_NODE_ID:'88888888-8888-4888-8888-888888888888',DATABASE_URL:'postgresql://fixture:fixture@db.example.invalid/staging',INVITATION_TRANSPORT:'disabled'};
    assert.equal(assertStaging(valid).originId,valid.SHOP_NODE_ID);
    const live={...valid,INVITATION_TRANSPORT:'smtp',INVITATION_LIVE_ENABLED:'1',SMTP_SENDER_VERIFIED:'1',STAGING_EMAIL_APPROVED:'1'};
    assert.throws(()=>assertStaging(live));
    assert.equal(assertStaging(live,{allowVerifiedInvitations:true}).originId,valid.SHOP_NODE_ID);
    for(const invalid of [{STAGING_EMAIL_APPROVED:''},{SMTP_SENDER_VERIFIED:'0'},{INVITATION_LIVE_ENABLED:'0'},{INVITATION_TRANSPORT:'isolated'},{AUTHORITY_MODE:'CLOUD'},{DAYARI_DEPLOYMENT:'production'},{DATABASE_URL:'postgresql://fixture:fixture@127.0.0.1/dayari_dev'}]) assert.throws(()=>assertStaging({...live,...invalid},{allowVerifiedInvitations:true}));
    for(const invalid of [{DYNO:''},{DAYARI_DEPLOYMENT:'production'},{NODE_ENV:'development'},{AUTHORITY_MODE:'CLOUD'},{INVITATION_TRANSPORT:'smtp'},{INVITATION_LIVE_ENABLED:'1'},{SHOP_NODE_ID:'11111111-1111-4111-8111-111111111111'},{DATABASE_URL:'postgresql://fixture:fixture@127.0.0.1/dayari_dev'}]) assert.throws(()=>assertStaging({...valid,...invalid}));`;
  expect(() => execFileSync(process.execPath, ['--input-type=module', '-e', script], { stdio: 'pipe' })).not.toThrow();
});
it('Heroku release tools survive production pruning and do not seed on application startup', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  expect(pkg.dependencies.prisma).toBeTruthy();
  expect(pkg.dependencies.dotenv).toBeTruthy();
  expect(pkg.scripts['heroku-postbuild']).toBe('npm run build:api');
  expect(readFileSync('Procfile', 'utf8')).toContain('release: node scripts/staging-release.mjs');
  expect(readFileSync('apps/api/src/main.ts', 'utf8')).not.toContain('bootstrapStagingOwner');
  expect(readFileSync('scripts/staging-release.mjs', 'utf8')).toContain("invitationConfig()?.transport.mode !== 'smtp'");
  expect(readFileSync('scripts/bootstrap-staging.mjs', 'utf8')).not.toContain('allowVerifiedInvitations');
});
