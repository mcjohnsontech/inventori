import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { database } from '../../apps/api/src/database.js';
import { createApp } from '../../apps/api/src/app.js';
import { IsolatedInvitationTransport, type InvitationConfig } from '../../apps/api/src/invitation-mail.js';
import { passwordHash } from '../../apps/api/src/security.js';
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test') || !['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Isolated local *_test database required');

// Owner decision 27 Nov 2026: creating an account emails the assigned password and a sign-in link.
describe('welcome email for a new staff account', () => {
  const db = database(url), password = randomUUID(), originId = randomUUID();
  const transport = new IsolatedInvitationTransport();
  let failing = false;
  const config: InvitationConfig = { publicUrl: 'https://shop.example/', key: randomBytes(32), transport: {
    mode: 'isolated', send: message => transport.send(message),
    sendWelcome: async message => { if (failing) throw new Error('private transport failure'); await transport.sendWelcome(message); },
  } };
  let app: Awaited<ReturnType<typeof createApp>>, plain: typeof app, token = '';
  const create = (target: typeof app, body: object, key = randomUUID()) => request(target.getHttpServer()).post('/v1/admin/users').set('Authorization', `Bearer ${token}`).set('Idempotency-Key', key).send(body);
  const account = (initialPassword: string = randomUUID()) => ({ name: 'New Starter', email: `${randomUUID()}@welcome.test`, role: 'PRODUCTION', initialPassword, currentPassword: password });
  beforeAll(async () => {
    await db.originNode.create({ data: { id: originId, mode: 'SHOP' } });
    app = await createApp(db, originId, 'SHOP', config); plain = await createApp(db, originId, 'SHOP', undefined);
    const admin = await db.user.create({ data: { email: `${randomUUID()}@welcome.test`, name: 'Admin', role: 'ADMIN', passwordHash: passwordHash(password), membership: { create: { originId } } } });
    token = (await request(app.getHttpServer()).post('/v1/sessions').send({ email: admin.email, password }).expect(200)).body.token;
  });
  afterAll(async () => { await app?.close(); await plain?.close(); await db.$disconnect(); });

  it('emails the assigned password and sign-in link once, and a retried request does not email again', async () => {
    const body = account('Start-123'), key = randomUUID();
    const created = (await create(app, body, key).expect(201)).body;
    expect(created).toMatchObject({ email: body.email, mustChangePassword: true, welcomeEmail: 'sent' });
    expect(transport.welcomes.filter(m => m.to === body.email)).toEqual([{ to: body.email, name: 'New Starter', password: 'Start-123', signInUrl: 'https://shop.example/' }]);
    const replay = (await create(app, body, key).expect(201)).body;
    expect(replay.id).toBe(created.id); expect(replay.welcomeEmail).toBeUndefined();
    expect(transport.welcomes.filter(m => m.to === body.email)).toHaveLength(1);
    // The password is not kept anywhere in saved evidence.
    const saved = await db.commandResult.findMany({ where: { actorId: created.id } });
    const audit = await db.auditEvent.findMany({ where: { subjectId: created.id } });
    expect(JSON.stringify([saved, audit])).not.toContain('Start-123');
  });

  it('keeps the account when the email fails, and reports it so the Admin can hand the password over', async () => {
    failing = true;
    try {
      const body = account();
      const created = (await create(app, body).expect(201)).body;
      expect(created.welcomeEmail).toBe('failed');
      expect(await db.user.findUnique({ where: { id: created.id } })).toMatchObject({ email: body.email, mustChangePassword: true });
    } finally { failing = false; }
  });

  it('reports email as not set up when the server has no mail settings', async () => {
    expect((await create(plain, account()).expect(201)).body.welcomeEmail).toBe('off');
  });

  it('the emailed password signs in once and must be changed first', async () => {
    const body = account('Temp-456');
    await create(app, body).expect(201);
    const session = (await request(app.getHttpServer()).post('/v1/sessions').send({ email: body.email, password: 'Temp-456' }).expect(200)).body;
    expect(session.user.mustChangePassword).toBe(true);
  });
});
