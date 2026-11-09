import { z } from 'zod';
import type { AppRole } from './permissions.js';
import type { UnitIdentityLookup } from './unit-labels.js';

export const unitObservationSchema = z.object({
  payload: z.string().max(100),
  method: z.enum(['CAMERA', 'QR_INPUT']),
}).strict();
export const unitTrackingQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
}).strict();
export type UnitHistoryItem = {
  id: string;
  kind: 'RECOVERY_REQUESTED' | 'BAD_REPORTED' | 'DAMAGE_REMOVED' | 'DAMAGE_REVIEWED' | 'REASON_RECONCILED' | 'ISSUED' | 'RECEIVED' | 'LABEL_REQUESTED' | 'LABEL_PREPARED' | 'PRINT_DIALOG_REQUESTED' | 'QR_PRESENTED';
  recordedAt: string;
  originSequence: string;
  actor: { id: string; name: string; role: AppRole };
  fromState?: string;
  toState?: string;
  receiptId?: string;
  movementId?: string;
  labelJobId?: string;
  method?: 'CAMERA' | 'QR_INPUT';
  checkoutId?: string;
  orderReference?: string | null;
  reasonCode?: string | null;
  reasonNote?: string;
  reconciliationId?: string;
  managerRemarks?: string;
  requestId?: string;
  requestReason?: string;
  requestEvidence?: string;
  requestStatus?: 'PENDING_CLOUD_AUTHORIZATION';
  damageId?: string;
  damageCause?: string;
  damageDescription?: string;
  damageOutcome?: string | null;
};
export type UnitTracking = {
  unit: UnitIdentityLookup;
  recordedCustody?: string;
  receiptId?: string;
  initialCondition?: string;
  deliveredOn?: string;
  timeline: { events: UnitHistoryItem[]; total: number; page: number; pageSize: number };
  historyScope: 'OPERATIONAL' | 'OWN_QR_PRESENTATIONS' | 'OWN_ACTIVITY';
  physicalVerification: 'NOT_ESTABLISHED_BY_THIS_VIEW';
};
export type UnitObservationResult = {
  id: string;
  unitId: string;
  recordedAt: string;
  originSequence: string;
  evidence: 'QR_PRESENTED_ONLY';
};
