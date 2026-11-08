import 'dotenv/config';
import { Client } from 'pg';
import { readFile, readdir } from 'node:fs/promises';

// Fresh, isolated schema validation only. Never falls back to DATABASE_URL.
if (!process.env.TEST_DATABASE_URL) throw Error('Explicit TEST_DATABASE_URL is required');
const url = new URL(process.env.TEST_DATABASE_URL);
if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !/^\/[a-zA-Z0-9_]+_test$/.test(url.pathname) || url.hash || url.search)
  throw Error('Only loopback isolated test configuration is permitted');
const name = `dayari_checkout_schema_${Date.now()}_test`;
const adminUrl = new URL(url); adminUrl.pathname = '/postgres';
const admin = new Client({ connectionString: adminUrl.toString() });
await admin.connect();
try {
  if ((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [name])).rowCount)
    throw Error('Refusing to overwrite an existing database');
  await admin.query(`CREATE DATABASE "${name}"`);
} finally { await admin.end(); }
url.pathname = '/' + name;
const db = new Client({ connectionString: url.toString() });
await db.connect();
try {
  const names = (await readdir('prisma/migrations')).filter(name => /^2026/.test(name)).sort();
  if (names.at(-1) !== '202611080021_exact_unit_checkout') throw Error('Run from the matching checkout milestone');
  for (const migration of names) await db.query(await readFile(`prisma/migrations/${migration}/migration.sql`, 'utf8'));
  const { rows } = await db.query(`SELECT
    (SELECT count(*) FROM "Checkout") AS checkouts,
    (SELECT count(*) FROM "StockMovement") AS movements,
    (SELECT count(*) FROM "StockUnit") AS units`);
  if (Object.values(rows[0]).some(value => value !== '0')) throw Error('Fresh migration fabricated inventory');
  console.info(`All ${names.length} migrations applied to fresh isolated ${name}; no inventory fabricated.`);
  console.info('Schema syntax smoke check only; populated preservation and transaction invariant tests remain required.');
} finally { await db.end(); }
