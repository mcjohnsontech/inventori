/** Explicit release authorization for the retained Heroku production origin. */
export function assertProduction(env = process.env) {
  if (env.DAYARI_DEPLOYMENT !== 'production' || env.NODE_ENV !== 'production' ||
      !/^release\./.test(env.DYNO ?? '') || env.PRODUCTION_RELEASE_APPROVED !== '1')
    throw new Error('An explicitly approved Heroku production release is required');
  if (env.AUTHORITY_MODE !== 'SHOP' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(env.SHOP_NODE_ID ?? '') ||
      env.SHOP_NODE_ID === '11111111-1111-4111-8111-111111111111')
    throw new Error('Production must retain its explicitly configured shop origin');
  const database = new URL(env.DATABASE_URL ?? '');
  if (!['postgres:', 'postgresql:'].includes(database.protocol) ||
      ['localhost', '127.0.0.1', '::1', '[::1]', 'host.docker.internal'].includes(database.hostname) ||
      database.hostname.endsWith('.render.com') || /(?:_dev|_test)$/.test(database.pathname))
    throw new Error('Production requires its separate retained Heroku database');
  if (env.APP_PUBLIC_URL !== 'https://infentri.dayari.ng')
    throw new Error('The approved production invitation origin is required');
  if (env.INVITATION_TRANSPORT !== 'disabled' &&
      !(env.INVITATION_TRANSPORT === 'smtp' && env.INVITATION_LIVE_ENABLED === '1' &&
        env.SMTP_SENDER_VERIFIED === '1'))
    throw new Error('Production invitations must be disabled or verified SMTP');
  return { originId: env.SHOP_NODE_ID };
}
