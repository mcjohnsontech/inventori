import { createApp } from './app.js';
import { database } from './database.js';
import { assertAccountSchema } from './schema-readiness.js';
import { listenOptions } from './listen-options.js';
const { host, port } = listenOptions();
const originId = process.env.SHOP_NODE_ID;
if (!originId) throw new Error('SHOP_NODE_ID is required');
const db = database();
try { await assertAccountSchema(db); } catch(error) { await db.$disconnect(); throw error; }
const app = await createApp(db, originId, process.env.AUTHORITY_MODE ?? 'SHOP');
app.enableShutdownHooks();
await app.listen(port, host);
console.info(`Dayari API listening on ${host}:${port}`);
async function shutdown() { await app.close(); await db.$disconnect(); }
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
