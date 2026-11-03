import 'dotenv/config';
import pg from 'pg';
const dev = new URL(process.env.DATABASE_URL ?? '');
if (!['localhost', '127.0.0.1'].includes(dev.hostname) || !dev.pathname.endsWith('_dev')) throw new Error('Requires a local *_dev connection; refuses remote or production databases');
const admin = new pg.Client({ connectionString: dev.toString() });
try {
  await admin.connect();
  const result = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', ['dayari_test']);
  if (!result.rowCount) await admin.query('CREATE DATABASE dayari_test');
  console.info('Isolated dayari_test database ready. No existing databases or records were dropped.');
} finally { await admin.end(); }
