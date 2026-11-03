import 'dotenv/config';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
const url = new URL(process.env.DATABASE_URL ?? '');
if (process.env.NODE_ENV !== 'development' || url.hostname !== '127.0.0.1' || !url.pathname.endsWith('_dev')) throw new Error('Native database fallback is for loopback development only');
const directory = resolve('.local/postgres');
const cluster = new EmbeddedPostgres({
  databaseDir: directory, user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), port: Number(url.port),
  persistent: true, createPostgresUser: false, authMethod: 'scram-sha-256', postgresFlags: ['-h', '127.0.0.1'],
  onLog: () => {}, onError: message => console.error(String(message)),
});
if (!existsSync(resolve(directory, 'PG_VERSION'))) await cluster.initialise();
await cluster.start();
const client = cluster.getPgClient();
try {
  await client.connect();
  for (const name of ['dayari_dev', 'dayari_test']) {
    const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (!existing.rowCount) await client.query(`CREATE DATABASE ${name}`);
  }
} finally { await client.end(); }
console.info('Native development PostgreSQL listening on 127.0.0.1; dev/test databases ready. Ctrl+C stops it and preserves data.');
const keepAlive = setInterval(() => {}, 60000);
let stopping = false;
async function stop() { if (stopping) return; stopping = true; clearInterval(keepAlive); await cluster.stop(); }
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
