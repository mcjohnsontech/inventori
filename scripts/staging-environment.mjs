/** Fail closed: these hosted helpers are for the separately approved staging app only. */
export function assertStaging(env = process.env) {
  if (env.DAYARI_DEPLOYMENT !== 'staging' || env.NODE_ENV !== 'production' || !env.DYNO)
    throw new Error('Run only inside the explicitly configured staging Heroku app');
  if (env.AUTHORITY_MODE !== 'SHOP') throw new Error('Staging simulates one isolated shop');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(env.SHOP_NODE_ID ?? '') ||
      env.SHOP_NODE_ID === '11111111-1111-4111-8111-111111111111')
    throw new Error('A new staging origin UUID is required');
  const database = new URL(env.DATABASE_URL ?? '');
  if (!['postgres:', 'postgresql:'].includes(database.protocol) ||
      ['localhost', '127.0.0.1', '::1', '[::1]', 'host.docker.internal'].includes(database.hostname) ||
      /(?:_dev|_test)$/.test(database.pathname))
    throw new Error('A separately provisioned hosted staging database is required');
  if (env.INVITATION_TRANSPORT !== 'disabled' || env.INVITATION_LIVE_ENABLED === '1')
    throw new Error('Live invitations are disabled for this staging deployment');
  return { originId: env.SHOP_NODE_ID };
}
