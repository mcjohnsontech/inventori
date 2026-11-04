import 'dotenv/config';
import { database } from '../apps/api/src/database.js';
import { passwordHash } from '../apps/api/src/security.js';
if (process.env.NODE_ENV !== 'development' || process.env.ALLOW_DEV_SEED !== 'yes') throw new Error('Development-only seed: NODE_ENV=development and ALLOW_DEV_SEED=yes required');
const password = process.env.DEV_ADMIN_PASSWORD;
const originId = process.env.SHOP_NODE_ID;
const email = process.env.DEV_ADMIN_EMAIL;
const url = new URL(process.env.DATABASE_URL ?? '');
if (!['localhost', '127.0.0.1'].includes(url.hostname) || !url.pathname.endsWith('_dev')) throw new Error('Seed requires a local *_dev database');
if (!password || password.length < 16 || password.includes('REPLACE_') || !originId || !email) throw new Error('Set a unique development admin password (16+ characters), email and node ID');
const db = database();
try {
  await db.$transaction(async tx => {
    await tx.originNode.upsert({ where: { id: originId }, create: { id: originId, mode: 'SHOP' }, update: {} });
    await tx.user.upsert({ where: { email: email.toLowerCase() }, create: { email: email.toLowerCase(), name: 'Development Admin', role: 'ADMIN', passwordHash: passwordHash(password), membership:{create:{originId}} }, update: {} });
  });
  console.info('Development shop and Admin provisioned. Existing users/passwords were not changed.');
} finally { await db.$disconnect(); }
