import { createApp } from './app.js';
import { database } from './database.js';
const originId = process.env.SHOP_NODE_ID;
if (!originId) throw new Error('SHOP_NODE_ID is required');
const db = database();
const app = await createApp(db, originId, process.env.AUTHORITY_MODE ?? 'SHOP');
app.enableShutdownHooks();
await app.listen(Number(process.env.PORT ?? 4000), '127.0.0.1');
console.info(`Dayari API listening locally on port ${process.env.PORT ?? 4000}`);
async function shutdown() { await app.close(); await db.$disconnect(); }
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
