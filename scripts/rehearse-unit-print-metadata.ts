import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { database } from '../apps/api/src/database.js';
import { isolatedBackfillUrl } from '../apps/api/src/identity-backfill.js';

const url = isolatedBackfillUrl(process.env.TEST_DATABASE_URL);
if (process.argv[2]) url.pathname = '/' + process.argv[2];
if (!/^\/dayari_cutover_[a-z0-9_]+_test$/.test(url.pathname))
  throw Error('Use an isolated retained cutover rehearsal fixture only');
const repositoryMigrations = (await readdir('prisma/migrations', { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
if (repositoryMigrations.at(-1) !== '202611070019_unit_label_manifests')
  throw Error('Run this rehearsal from its matching milestone commit; later migrations must not be applied silently');
const db = database(url.toString());
try {
  const applied = await db.$queryRawUnsafe<{ migration_name: string }[]>(
    'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name DESC LIMIT 1');
  if (applied[0]?.migration_name !== '202611070018_receipt_group_once')
    throw Error('This rehearsal requires the unchanged through-018 fixture');
  const tables = await db.$queryRawUnsafe<{ tablename: string }[]>(
    "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'_prisma_migrations' ORDER BY tablename");
  const capture = async () => {
    const hashes: Record<string, string> = {};
    for (const { tablename } of tables) {
      // pg_tables values are quoted as identifiers, never treated as SQL fragments.
      const quoted = '"' + tablename.replaceAll('"', '""') + '"';
      const [row] = await db.$queryRawUnsafe<{ hash: string }[]>(`SELECT encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,''),'UTF8')),'hex') AS hash FROM ${quoted} t`);
      hashes[tablename] = row!.hash;
    }
    return hashes;
  };
  const before = await capture();
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: url.toString() }, stdio: 'pipe',
  });
  const after = await capture();
  if (JSON.stringify(before) !== JSON.stringify(after)) throw Error('Existing records changed');
  const counts = await db.$queryRawUnsafe<Record<string, bigint>[]>(
    'SELECT (SELECT count(*) FROM "UnitLabelJob") jobs,(SELECT count(*) FROM "UnitLabelLine") lines,(SELECT count(*) FROM "UnitLabelArtifact") artifacts');
  if (Object.values(counts[0]!).some(value => value !== 0n)) throw Error('Migration fabricated print records');
  await mkdir('artifacts/completion', { recursive: true });
  await writeFile('artifacts/completion/unit-print-migration-preservation.json', JSON.stringify({
    syntheticOnly: true, database: url.pathname.slice(1), recordedAt: new Date().toISOString(),
    migration: '202611070019_unit_label_manifests', before, after, existingTablesUnchanged: true,
    fabricatedPrintRecords: false, limitations: ['Isolated retained fixture only; no operational upgrade'],
  }, null, 2));
  console.log('Migration 019 rehearsal preserved all ' + tables.length + ' existing table fingerprints.');
} finally { await db.$disconnect(); }
