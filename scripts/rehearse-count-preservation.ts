import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { Client } from 'pg';
import { database } from '../apps/api/src/database.js';
import { isolatedBackfillUrl } from '../apps/api/src/identity-backfill.js';
import { CountsService } from '../apps/api/src/counts.service.js';
const previous = JSON.parse(await readFile('artifacts/completion/completion-preservation.json', 'utf8')), url = isolatedBackfillUrl(process.env.TEST_DATABASE_URL);
if (!previous.syntheticOnly || !/^dayari_checkout_compat_[0-9]+_test$/.test(previous.database))
    throw Error('Retained synthetic fixture required');
url.pathname = '/' + previous.database;
const names = (await readdir('prisma/migrations')).filter(v => /^2026/.test(v)).sort();
if (names.at(-1) !== '202611090028_targeted_counts')
    throw Error('Matching milestone required');
const sql = new Client({ connectionString: url.toString() }), db = database(url.toString());
await sql.connect();
try {
    if (!(await sql.query(`SELECT to_regclass('"ProductionCompletion"') IS NOT NULL AND to_regclass('"CountSession"') IS NULL AS ready`)).rows[0].ready)
        throw Error('Fixture must be through 027; no reset or repeat install');
    const tables = (await sql.query<{
        tablename: string;
    }>("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
    async function capture(selected = tables) { const result: Record<string, string> = {}; for (const { tablename } of selected) {
        const q = '"' + tablename.replaceAll('"', '""') + '"';
        result[tablename] = (await sql.query(`SELECT encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,''),'UTF8')),'hex') hash FROM ${q} t`)).rows[0].hash;
    } return result; }
    const before = await capture();
    await sql.query(await readFile('prisma/migrations/202611090028_targeted_counts/migration.sql', 'utf8'));
    const after = await capture();
    if (JSON.stringify(before) !== JSON.stringify(after))
        throw Error('Prior fields changed');
    const manager = await db.user.findFirstOrThrow({ where: { role: 'MANAGER', active: true, membership: { isNot: null } } }), member = await db.shopMembership.findFirstOrThrow({ where: { userId: manager.id } }), service = new CountsService(db, member.originId, 'SHOP');
    const legacy = await db.lotSerialization.findFirstOrThrow({ where: { originId: member.originId, mode: 'LEGACY' } });
    const frozen = tables.filter(t => !['OriginNode', 'AuditEvent', 'OutboxEvent', 'CommandResult'].includes(t.tablename)), stockBefore = await capture(frozen);
    const root = await service.command(manager, 'CountSession', randomUUID(), { lotId: legacy.lotId, state: 'U', purpose: 'Synthetic historical quantity evidence rehearsal' }) as {
        id: string;
    };
    const a = await service.command(manager, 'CountAttempt', randomUUID(), { sessionId: root.id }) as {
        id: string;
        snapshot: {
            ledgerQuantity: string;
        };
    };
    const result = await service.command(manager, 'CountResult', randomUUID(), { attemptId: a.id, observedQuantity: a.snapshot.ledgerQuantity, unidentifiedExtras: '0', explanation: 'Synthetic historical count quantity matches authoritative ledger', evidence: 'Rehearsal evidence only; no real physical verification performed' }) as {
        status: string;
    };
    if (result.status !== 'MATCHED')
        throw Error('Legacy quantity evidence failed');
    const stockAfter = await capture(frozen);
    if (JSON.stringify(stockBefore) !== JSON.stringify(stockAfter))
        throw Error('Count changed historical inventory/evidence');
    await mkdir('artifacts/completion', { recursive: true });
    await writeFile('artifacts/completion/count-preservation.json', JSON.stringify({ syntheticOnly: true, database: previous.database, migration: names.at(-1), existingTables: tables.length, before, after, priorFieldsPreserved: true, stockBefore, stockAfter, legacyQuantityOnly: true, physicalVerificationPerformed: false }, null, 2));
    console.info(`Count migration preserved ${tables.length} prior-table fingerprints; synthetic legacy count created no units or stock changes.`);
}
finally {
    await db.$disconnect();
    await sql.end();
}
