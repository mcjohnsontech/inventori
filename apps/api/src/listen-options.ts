/** Heroku supplies PORT; explicit HOST preserves loopback-only local operation. */
export function listenOptions(env: NodeJS.ProcessEnv = process.env) {
  const host = env.HOST ?? '127.0.0.1';
  const value = env.PORT ?? '4000';
  const port = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(port) || port < 1 || port > 65535)
    throw new Error('PORT must be an integer from 1 to 65535');
  if (!['127.0.0.1', '0.0.0.0', '::1', '::'].includes(host))
    throw new Error('HOST must be an explicit supported bind address');
  if (env.DYNO && !['0.0.0.0', '::'].includes(host))
    throw new Error('Heroku requires HOST=0.0.0.0 (or ::)');
  return { host, port };
}
