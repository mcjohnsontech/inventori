import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma, type PrismaClient, type User } from '@prisma/client';
import { authorizationDecisionSchema, idempotencyKeySchema, type AuthorizationDecisionOptions, type AuthorizationDecisionView,
  type DecisionCandidate, type DecisionOutcome } from '@dayari/contracts';
import { requireCapability } from './permissions.js';
import { canonical, digest } from './security.js';
import { DamageService, type DamageSelection } from './damage.service.js';

/**
 * Local Admin approval of recovery and correction requests.
 * Owner decisions, 24 November 2026 (docs/decisions.md, docs/local-admin-approval-design.md):
 * an Admin at the shop approves or rejects someone else's pending request; approval writes new
 * compensating ledger events and never edits history. Migration 035 enforces the same rules.
 */
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
const COMMAND = 'inventory.authorization.decide', EVENT = 'inventory.authorization.decided';
type Request = { id: string; actorId: string; kind: 'RECOVERY' | 'CORRECTION'; lotId: string | null; state: 'U' | 'P' | 'D' | null;
  ledgerQuantity: bigint | null; projectionQuantity: bigint | null; observedQuantity: bigint | null; unitCount: number };

export class AuthorizationDecisionsService {
  readonly damage: DamageService;
  constructor(readonly db: PrismaClient, readonly originId: string, readonly mode: string) { this.damage = new DamageService(db, originId, mode); }

  private async ready(db: Pick<PrismaClient, '$queryRaw'> = this.db) {
    const [row] = await db.$queryRaw<{ ready: boolean }[]>`SELECT to_regclass('"AuthorizationDecision"') IS NOT NULL AS ready`;
    return Boolean(row?.ready);
  }
  private requestId(input: unknown) {
    const id = idempotencyKeySchema.safeParse(input);
    if (!id.success) throw new BadRequestException('That request could not be found.');
    return id.data;
  }
  private async request(db: Prisma.TransactionClient | PrismaClient, id: string, lock = false): Promise<Request> {
    const [row] = await db.$queryRaw<Request[]>(Prisma.sql`SELECT id,"actorId",kind,"lotId",state,"ledgerQuantity","projectionQuantity","observedQuantity","unitCount"
      FROM "AuthorizationRequest" WHERE id=${id}::uuid AND "originId"=${this.originId}::uuid ${lock ? Prisma.sql`FOR SHARE` : Prisma.empty}`);
    if (!row) throw new NotFoundException('That request could not be found.');
    return row;
  }
  /** What the Admin may choose, given what the request asked for. */
  private outcomes(r: Request): DecisionOutcome[] {
    if (r.kind === 'RECOVERY') return ['APPROVED', 'REJECTED'];
    const observed = r.observedQuantity!, ledger = r.ledgerQuantity!;
    if (observed < ledger) return ['APPROVED', 'REJECTED'];
    if (observed > ledger) return ['RECEIVE_AS_DELIVERY', 'REJECTED'];
    return ['REJECTED'];
  }
  private async current(db: Prisma.TransactionClient | PrismaClient, lotId: string, state: string) {
    const [row] = await db.$queryRaw<{ ledger: bigint; projection: bigint }[]>`SELECT
      COALESCE((SELECT sum(CASE WHEN m."toState"=${state} THEN m.quantity ELSE -m.quantity END) FROM "StockMovement" m WHERE m."lotId"=${lotId}::uuid AND (m."toState"=${state} OR m."fromState"=${state})),0)::bigint AS ledger,
      COALESCE((SELECT quantity FROM "StockBalance" WHERE "lotId"=${lotId}::uuid AND state=${state}),0)::bigint AS projection`;
    return row!;
  }
  private async view(decisionCommandId: string): Promise<AuthorizationDecisionView> {
    return (await this.db.commandResult.findUniqueOrThrow({ where: { id: decisionCommandId } })).response as unknown as AuthorizationDecisionView;
  }

  async options(user: User, idInput: unknown): Promise<AuthorizationDecisionOptions> {
    requireCapability(user, 'OPERATIONAL_STOCK');
    if (!await this.ready()) throw new ServiceUnavailableException('This shop’s database needs an update before requests can be approved. Ask the person who runs the shop server.');
    const requestId = this.requestId(idInput);
    return this.db.$transaction(async tx => {
      const r = await this.request(tx, requestId);
      const saved = await tx.authorizationDecision.findUnique({ where: { requestId } });
      const decision = saved ? await this.view(saved.commandId) : null;
      let stale = false, shortfall = 0, surplus = 0, candidates: DecisionCandidate[] = [];
      if (r.kind === 'RECOVERY') {
        const units = await tx.$queryRaw<(DecisionCandidate & { previousEventId: string; lastEventId: string })[]>`SELECT u.id AS "unitId",u."unitCode",p.name AS "productName",v.name AS "variantName",
          s.state,a."previousEventId",s."lastEventId",false AS "notInLatestCount",false AS unchanged
          FROM "AuthorizationRequestUnit" a JOIN "StockUnit" u ON u.id=a."unitId" JOIN "UnitState" s ON s."unitId"=u.id JOIN "StockLot" l ON l.id=u."lotId"
          JOIN "SupplierVariantSku" sku ON sku.id=l."skuId" JOIN "Product" p ON p.id=sku."productId" JOIN "Variant" v ON v.id=sku."variantId"
          WHERE a."requestId"=${requestId}::uuid ORDER BY u."unitCode"`;
        candidates = units.map(({ previousEventId, lastEventId, ...unit }) => ({ ...unit, unchanged: unit.state === 'D' && previousEventId === lastEventId }));
        stale = candidates.some(unit => !unit.unchanged);
      } else {
        const now = await this.current(tx, r.lotId!, r.state!);
        stale = now.ledger !== r.ledgerQuantity || now.projection !== r.projectionQuantity;
        if (r.observedQuantity! < r.ledgerQuantity!) shortfall = Number(r.ledgerQuantity! - r.observedQuantity!);
        if (r.observedQuantity! > r.ledgerQuantity!) surplus = Number(r.observedQuantity! - r.ledgerQuantity!);
        if (shortfall) {
          // Pre-tick items the latest count of this lot and state did not find.
          candidates = await tx.$queryRaw<DecisionCandidate[]>`WITH latest AS (
              SELECT ca.id FROM "CountResult" cr JOIN "CountAttempt" ca ON ca.id=cr."attemptId" JOIN "CountSession" cs ON cs.id=ca."sessionId"
              WHERE cs."originId"=${this.originId}::uuid AND cs."lotId"=${r.lotId}::uuid AND cs.state=${r.state} ORDER BY cr."recordedAt" DESC LIMIT 1)
            SELECT u.id AS "unitId",u."unitCode",p.name AS "productName",v.name AS "variantName",s.state,true AS unchanged,
              (EXISTS(SELECT 1 FROM latest) AND NOT EXISTS(SELECT 1 FROM "CountObservation" o JOIN latest ON latest.id=o."attemptId" WHERE o."unitId"=u.id)) AS "notInLatestCount"
            FROM "UnitState" s JOIN "StockUnit" u ON u.id=s."unitId" JOIN "StockLot" l ON l.id=u."lotId"
            JOIN "SupplierVariantSku" sku ON sku.id=l."skuId" JOIN "Product" p ON p.id=sku."productId" JOIN "Variant" v ON v.id=sku."variantId"
            WHERE s."originId"=${this.originId}::uuid AND s."lotId"=${r.lotId}::uuid AND s.state=${r.state} ORDER BY "notInLatestCount" DESC,u."unitCode" LIMIT 500`;
        }
      }
      const blockedReason = this.mode !== 'SHOP' ? 'Requests can only be decided on the shop server.'
        : user.role !== 'ADMIN' ? 'Only an Admin can approve or reject requests.'
        : r.actorId === user.id ? 'You made this request, so another Admin must decide it.'
        : decision ? 'This request has already been decided.' : null;
      return { requestId, kind: r.kind, decision, canDecide: !blockedReason, blockedReason, outcomes: this.outcomes(r), shortfall, surplus, stale, candidates };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async decide(user: User, idInput: unknown, keyInput: unknown, input: unknown): Promise<AuthorizationDecisionView> {
    requireCapability(user, 'OPERATIONAL_STOCK');
    if (user.role !== 'ADMIN') throw new ForbiddenException('Only an Admin can approve or reject requests.');
    if (this.mode !== 'SHOP') throw new ForbiddenException('Requests can only be decided on the shop server.');
    if (!await this.ready()) throw new ServiceUnavailableException('This shop’s database needs an update before requests can be approved. Ask the person who runs the shop server.');
    const requestId = this.requestId(idInput);
    const parsed = authorizationDecisionSchema.safeParse(input), key = idempotencyKeySchema.safeParse(keyInput);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues.map(issue => issue.message).join('. '));
    if (!key.success) throw new BadRequestException('This request is missing its safety key. Refresh the page and try again.');
    const body = parsed.data, requestHash = digest(canonical({ requestId, ...body }));
    for (let attempt = 0; ; attempt++) try {
      return await this.db.$transaction(async tx => {
        const [origin] = await tx.$queryRaw<{ mode: string }[]>`SELECT mode FROM "OriginNode" WHERE id=${this.originId}::uuid FOR UPDATE`;
        if (origin?.mode !== 'SHOP') throw new ForbiddenException('Requests can only be decided on the shop server.');
        await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id}::uuid FOR SHARE`;
        const actor = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
        if (actor.role !== 'ADMIN' || !actor.active || actor.authVersion !== user.authVersion
          || !await tx.shopMembership.findUnique({ where: { userId_originId: { userId: actor.id, originId: this.originId } } })) throw new ForbiddenException('Your account or shop access changed. Sign in again.');
        const prior = await tx.commandResult.findUnique({ where: { originId_actorId_commandType_key: { originId: this.originId, actorId: actor.id, commandType: COMMAND, key: key.data } } });
        if (prior) {
          if (prior.requestHash !== requestHash) throw new ConflictException('This decision was already sent with different details. Refresh the page and try again.');
          return prior.response as unknown as AuthorizationDecisionView;
        }
        const r = await this.request(tx, requestId, true);
        if (r.actorId === actor.id) throw new ForbiddenException('You made this request, so another Admin must decide it.');
        if (await tx.authorizationDecision.findUnique({ where: { requestId } })) throw new ConflictException('This request has already been decided. Nothing was saved.');
        if (!this.outcomes(r).includes(body.outcome)) throw new BadRequestException('That decision does not fit this request.');
        const approved = body.outcome === 'APPROVED';
        if (!approved && body.unitIds.length) throw new BadRequestException('Only an approval selects items.');

        let ids: string[] = [];
        if (approved && r.kind === 'RECOVERY') {
          if (body.unitIds.length) throw new BadRequestException('A recovery approval returns exactly the requested items; do not select others.');
          ids = (await tx.authorizationRequestUnit.findMany({ where: { requestId }, select: { unitId: true } })).map(row => row.unitId).sort();
        } else if (approved) {
          const shortfall = Number(r.ledgerQuantity! - r.observedQuantity!);
          if (body.unitIds.length !== shortfall) throw new BadRequestException(`Tick exactly ${shortfall} missing ${shortfall === 1 ? 'item' : 'items'}.`);
          ids = body.unitIds;
        }

        let rows: DamageSelection[] = [];
        if (ids.length) {
          const list = Prisma.join(ids.map(id => Prisma.sql`${id}::uuid`));
          await tx.$queryRaw(Prisma.sql`SELECT id FROM "StockUnit" WHERE "originId"=${this.originId}::uuid AND id IN (${list}) ORDER BY id FOR UPDATE`);
          await tx.$queryRaw(Prisma.sql`SELECT "unitId" FROM "UnitState" WHERE "originId"=${this.originId}::uuid AND "unitId" IN (${list}) ORDER BY "unitId" FOR UPDATE`);
          rows = await this.damage.selection(tx, actor, ids);
          if (rows.length !== ids.length) throw new NotFoundException('One or more items could not be found in this shop.');
          if (r.kind === 'RECOVERY') {
            const requested = new Map((await tx.authorizationRequestUnit.findMany({ where: { requestId } })).map(row => [row.unitId, row.previousEventId]));
            if (rows.some(row => row.state !== 'D' || requested.get(row.unitId) !== row.lastEventId))
              throw new ConflictException('Some of these items changed after the request was made. Nothing was saved.');
          } else if (rows.some(row => row.lotId !== r.lotId || row.state !== r.state))
            throw new ConflictException('Tick only items from this batch that are still in the counted state. Nothing was saved.');
          const lots = [...new Set(rows.map(row => row.lotId))].sort();
          await tx.$queryRaw(Prisma.sql`SELECT "lotId",state FROM "StockBalance" WHERE "lotId" IN (${Prisma.join(lots.map(id => Prisma.sql`${id}::uuid`))}) ORDER BY "lotId",state FOR UPDATE`);
          if (r.kind === 'CORRECTION') {
            const current = await this.current(tx, r.lotId!, r.state!);
            if (current.ledger !== r.ledgerQuantity || current.projection !== r.projectionQuantity)
              throw new ConflictException('Stock for this batch changed after the request was made. Count again and make a new request. Nothing was saved.');
          }
        }

        const now = new Date(), id = randomUUID(), commandId = randomUUID(), transactionId = approved ? randomUUID() : null;
        const node = await tx.originNode.update({ where: { id: this.originId }, data: { nextSequence: { increment: 1 } } });
        const common = { originId: this.originId, actorId: actor.id, actorRole: actor.role, commandId };
        const toState = r.kind === 'RECOVERY' ? 'U' : 'X';
        const lines = rows.map(row => ({ id: randomUUID(), unit: this.damage.identity(row), fromState: row.state as 'U' | 'P' | 'D', toState: toState as 'U' | 'X',
          previousEventId: row.lastEventId, version: row.version, movementId: randomUUID(), eventId: randomUUID() }));
        const manifest = lines.map(line => ({ id: line.id, unitId: line.unit.unitId })), canonicalManifest = canonical(manifest), manifestHash = digest(canonicalManifest);
        if (transactionId) await tx.stockTransaction.create({ data: { id: transactionId, ...common, batchId: null, type: r.kind === 'RECOVERY' ? 'RECOVERY' : 'CORRECTION', originSequence: node.nextSequence, recordedAt: now } });
        await tx.authorizationDecision.create({ data: { id, ...common, requestId, transactionId, recordedAt: now, outcome: body.outcome, note: body.note,
          unitCount: lines.length, manifest, canonicalManifest, manifestHash } });
        if (lines.length) {
          await tx.authorizationDecisionLine.createMany({ data: lines.map(line => ({ id: line.id, decisionId: id, originId: this.originId, unitId: line.unit.unitId,
            lotId: line.unit.lotId, batchId: line.unit.batchId, fromState: line.fromState, toState: line.toState, previousEventId: line.previousEventId,
            movementId: line.movementId, eventId: line.eventId, snapshot: json({ unit: line.unit, requestId }) })) });
          await tx.stockMovement.createMany({ data: lines.map(line => ({ id: line.movementId, transactionId: transactionId!, batchId: line.unit.batchId, lotId: line.unit.lotId,
            receiptLineId: null, decisionLineId: line.id, fromState: line.fromState, toState: line.toState, quantity: 1n })) });
          await tx.unitEvent.createMany({ data: lines.map(line => ({ id: line.eventId, ...common, unitId: line.unit.unitId, lotId: line.unit.lotId,
            ordinal: Number(line.version) + 1, kind: r.kind === 'RECOVERY' ? 'RECOVERED' : 'CORRECTION_REMOVED', fromState: line.fromState, toState: line.toState,
            previousEventId: line.previousEventId, movementId: line.movementId, decisionLineId: line.id, recordedAt: now,
            details: { decisionId: id, requestId, decisionLineId: line.id } })) });
          const updates = JSON.stringify(lines.map(line => ({ unitId: line.unit.unitId, eventId: line.eventId, fromState: line.fromState, toState: line.toState })));
          const changed = await tx.$executeRaw`UPDATE "UnitState" s SET state=x."toState",
              condition=CASE WHEN x."toState"='U' THEN 'USABLE' WHEN x."fromState"='D' THEN 'DAMAGED' ELSE 'USABLE' END,
              custody=CASE x."toState" WHEN 'X' THEN 'REMOVED' ELSE 'SHOP_STORAGE' END,
              "holderId"=NULL,version=s.version+1,"lastEventId"=x."eventId" FROM jsonb_to_recordset(${updates}::jsonb) AS x("unitId" uuid,"eventId" uuid,"fromState" text,"toState" text)
            WHERE s."unitId"=x."unitId" AND s.state=x."fromState" AND s."originId"=${this.originId}::uuid`;
          if (changed !== lines.length) throw new ConflictException('Some of these items changed while saving. Nothing was saved.');
          const deltas = new Map<string, { lotId: string; state: string; quantity: number }>();
          for (const line of lines) for (const [state, delta] of [[line.fromState, -1], [line.toState, 1]] as const) {
            const k = line.unit.lotId + ':' + state, saved = deltas.get(k) ?? { lotId: line.unit.lotId, state, quantity: 0 }; saved.quantity += delta; deltas.set(k, saved);
          }
          for (const delta of [...deltas.values()].sort((a, b) => (a.lotId + a.state).localeCompare(b.lotId + b.state))) {
            if (delta.quantity < 0) {
              const count = await tx.$executeRaw`UPDATE "StockBalance" SET quantity=quantity+${BigInt(delta.quantity)},version=version+1,"lastTransactionId"=${transactionId}::uuid
                WHERE "lotId"=${delta.lotId}::uuid AND state=${delta.state} AND quantity>=${BigInt(-delta.quantity)}`;
              if (count !== 1) throw new ConflictException('The stock totals don’t add up. Nothing was saved. Ask an Admin to check.');
            } else await tx.$executeRaw`INSERT INTO "StockBalance"("lotId",state,quantity,version,"lastTransactionId") VALUES(${delta.lotId}::uuid,${delta.state},${BigInt(delta.quantity)},1,${transactionId}::uuid)
              ON CONFLICT("lotId",state) DO UPDATE SET quantity="StockBalance".quantity+EXCLUDED.quantity,version="StockBalance".version+1,"lastTransactionId"=EXCLUDED."lastTransactionId"`;
          }
        }
        const response: AuthorizationDecisionView = { id, requestId, originId: this.originId, recordedAt: now.toISOString(), originSequence: node.nextSequence.toString(),
          outcome: body.outcome, note: body.note, transactionId, admin: { id: actor.id, name: actor.name }, manifestHash,
          units: lines.map(line => ({ unitId: line.unit.unitId, unitCode: line.unit.unitCode, productName: line.unit.productName, variantName: line.unit.variantName,
            fromState: line.fromState, toState: line.toState })) };
        const evidence = { decisionId: id, requestId, outcome: body.outcome, transactionId, manifestHash, unitCount: lines.length };
        await tx.auditEvent.create({ data: { ...common, action: EVENT, subjectId: id, snapshot: evidence } });
        await tx.outboxEvent.create({ data: { originId: this.originId, actorId: actor.id, commandId, originSequence: node.nextSequence, eventType: EVENT,
          aggregateId: id, payload: evidence, payloadHash: digest(canonical(evidence)) } });
        await tx.commandResult.create({ data: { id: commandId, originId: this.originId, actorId: actor.id, commandType: COMMAND, key: key.data, requestHash, response: json(response) } });
        return response;
      }, { timeout: 15000, maxWait: 10000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034' && attempt < 2) continue;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // A same-key retry that raced the first attempt returns the first result; anything else lost to another decision.
        const prior = await this.db.commandResult.findUnique({ where: { originId_actorId_commandType_key: { originId: this.originId, actorId: user.id, commandType: COMMAND, key: key.data } } });
        if (prior?.requestHash === requestHash) return prior.response as unknown as AuthorizationDecisionView;
        throw new ConflictException('This request has already been decided. Nothing was saved.');
      }
      throw error;
    }
  }
}
