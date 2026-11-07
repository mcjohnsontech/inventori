import { randomInt, randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { Prisma, type User } from '@prisma/client';
import { unitAlphabet } from '@dayari/contracts';
import { canonical, digest } from './security.js';

type Tx = Prisma.TransactionClient;
export const drawUnitCode = () => Array.from({ length: 6 }, () => unitAlphabet[randomInt(unitAlphabet.length)]!).join('');

export async function hasUnitSchema(tx: Tx) {
  const [row] = await tx.$queryRaw<{ ready: boolean }[]>`SELECT to_regclass('"StockUnit"') IS NOT NULL AND to_regclass('"SerializationCutover"') IS NOT NULL AS ready`;
  return Boolean(row?.ready);
}

export type UnitIntake = {
  originId: string; lotId: string; receiptLineId: string; movementId: string;
  state: 'U' | 'D'; quantity: number; commandId: string; actor: User; now: Date; pageOrdinal: number;
};
export function receiveUnits(tx: Tx, input: UnitIntake, draw = drawUnitCode, chunkSize = 500) {
  return receiveUnitGroups(tx,[input],draw,chunkSize);
}
/** Bulk allocation retries only code conflicts; the surrounding receipt owns all commits. */
export async function receiveUnitGroups(tx: Tx, inputs: UnitIntake[], draw = drawUnitCode, chunkSize = 500) {
  if (!inputs.length) return 0;
  const command = inputs[0]!;
  if (inputs.some(input => input.originId!==command.originId || input.commandId!==command.commandId)) throw new Error('Unit chunks require one receipt command');
  const intake = inputs.flatMap(input => Array.from({length:input.quantity},()=>input));
  if (!Number.isInteger(chunkSize) || chunkSize < 1 || chunkSize > 500) throw new Error('Invalid unit insertion chunk size');
  let pageOrdinal = command.pageOrdinal;
  for (let offset = 0; offset < intake.length; offset += chunkSize) {
    const identities = intake.slice(offset,offset+chunkSize).map(input => ({ id: randomUUID(), eventId: randomUUID(), input }));
    let pending = identities;
    const saved = new Map<string, string>();
    for (let round = 0; pending.length && round < 32; round += 1) {
      const candidates = pending.map(unit => ({ ...unit, code: draw() }));
      const values = JSON.stringify(candidates.map(unit => { const input=unit.input; return { id:unit.id, originId:input.originId, lotId:input.lotId, receiptLineId:input.receiptLineId, unitCode:unit.code, initialState:input.state, initialMovementId:input.movementId, registrationCommandId:input.commandId, actorId:input.actor.id, actorRole:input.actor.role, recordedAt:input.now }; }));
      const accepted = await tx.$queryRaw<{ id: string; unitCode: string }[]>(Prisma.sql`
        INSERT INTO "StockUnit"(id,"originId","lotId","receiptLineId","unitCode","initialState","initialMovementId","registrationCommandId","actorId","actorRole","recordedAt")
        SELECT id,"originId","lotId","receiptLineId","unitCode","initialState","initialMovementId","registrationCommandId","actorId","actorRole","recordedAt"
        FROM jsonb_populate_recordset(NULL::"StockUnit",${values}::jsonb)
        ON CONFLICT ("originId","unitCode") DO NOTHING RETURNING id,"unitCode"`);
      for (const unit of accepted) saved.set(unit.id, unit.unitCode);
      pending = pending.filter(unit => !saved.has(unit.id));
    }
    if (pending.length) throw new ConflictException('UNIT_CODE_ALLOCATION_BUSY: retry the same receipt; no units or stock were committed');
    const events = JSON.stringify(identities.map(unit => { const input=unit.input; return { id: unit.eventId, unitId: unit.id, lotId: input.lotId, originId: input.originId, ordinal: 1, kind: 'RECEIVED', fromState: 'E', toState: input.state, actorId: input.actor.id, actorRole: input.actor.role, commandId: input.commandId, movementId: input.movementId, recordedAt: input.now, details: { registrationKind: 'RECEIPT' } }; }));
    await tx.$executeRaw`INSERT INTO "UnitEvent" SELECT * FROM jsonb_populate_recordset(NULL::"UnitEvent",${events}::jsonb)`;
    const states = JSON.stringify(identities.map(unit => { const input=unit.input; return { unitId: unit.id, lotId: input.lotId, originId: input.originId, state: input.state, condition: input.state === 'U' ? 'USABLE' : 'DAMAGED', custody: 'SHOP_STORAGE', version: 1, lastEventId: unit.eventId }; }));
    await tx.$executeRaw`INSERT INTO "UnitState" SELECT * FROM jsonb_populate_recordset(NULL::"UnitState",${states}::jsonb)`;
    const members = identities.map(unit => ({ id: unit.id, eventId: unit.eventId, unitCode: saved.get(unit.id)!, lotId: unit.input.lotId, state: unit.input.state }));
    const canonicalPayload = canonical(members);
    await tx.unitCommandManifestPage.create({ data: { id: randomUUID(), commandId: command.commandId, originId: command.originId, ordinal: pageOrdinal++, members, canonicalPayload, payloadHash: digest(canonicalPayload) } });
  }
  return pageOrdinal;
}
