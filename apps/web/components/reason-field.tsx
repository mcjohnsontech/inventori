'use client';
import { useState } from 'react';
import { checkoutReasonCodes, checkoutReasonLabels, type CheckoutReason } from '@dayari/contracts';
import { Field, Input, Select } from './ui';

/**
 * A reason picker that starts empty ("Choose a reason") instead of pre-selecting
 * the skip option. Skipping stays available, listed last, and still records no
 * reason so a Manager follows up — the stored value is unchanged (null).
 */
export function ReasonField({ value, onChange, label, disabled, inherited = false, emptyLabel = 'Reason not provided — Manager follow-up' }: {
  value: CheckoutReason | null | undefined; onChange: (reason: CheckoutReason | null | undefined) => void;
  label: string; disabled: boolean; inherited?: boolean; emptyLabel?: string;
}) {
  const [skipped, setSkipped] = useState(false);
  const selected = value === undefined ? 'INHERIT' : value?.code ?? (skipped ? 'MISSING' : '');
  return <div className="min-w-0 space-y-3"><Field label={label} hint={selected === '' ? 'Optional. If no reason is chosen, a Manager follows up later.' : undefined}>{id => <Select id={id} label={label} disabled={disabled}
    value={selected} placeholder="Choose a reason"
    options={[...(inherited ? [{ value: 'INHERIT', label: 'Use checkout reason' }] : []),
      ...checkoutReasonCodes.map(code => ({ value: code, label: checkoutReasonLabels[code] })),
      { value: 'MISSING', label: emptyLabel }]}
    onChange={code => { setSkipped(code === 'MISSING'); onChange(code === 'INHERIT' ? undefined : code === 'MISSING' ? null : { code: code as CheckoutReason['code'], note: '' }); }} />}</Field>
    {value?.code === 'OTHER' ? <Field label={`${label} explanation`} hint="At least ten meaningful characters.">{id => <Input id={id} value={value.note} maxLength={2000} disabled={disabled} onChange={event => onChange({ ...value, note: event.target.value })} />}</Field> : null}
  </div>;
}
