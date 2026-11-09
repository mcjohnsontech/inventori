import { assertStaging } from './staging-environment.mjs';
import { database } from '../apps/api/dist/database.js';
import { bootstrapStagingOwner } from '../apps/api/dist/staging-bootstrap.js';
const { originId } = assertStaging();
if (process.env.STAGING_BOOTSTRAP !== 'owner-approved-fresh-database')
  throw new Error('Explicit one-time staging bootstrap authorization is required');
const email = process.env.STAGING_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.STAGING_ADMIN_PASSWORD;
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length < 16)
  throw new Error('Configure the owner email and a private random initial password');
const db = database();
try {
  await bootstrapStagingOwner(db, { originId, email, password });
  console.info('Fresh staging owner provisioned; password change required. No inventory or sample stock created.');
} finally { await db.$disconnect(); }
