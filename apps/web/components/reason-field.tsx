'use client';
import { checkoutReasonCodes, checkoutReasonLabels, type CheckoutReason } from '@dayari/contracts';
import { Field, Input, Select } from './ui';

export function ReasonField({ value, onChange, label, disabled, inherited = false, emptyLabel = 'Reason not provided — Manager follow-up' }: {
  value: CheckoutReason | null | undefined; onChange: (reason: CheckoutReason | null | undefined) => void;
  label: string; disabled: boolean; inherited?: boolean; emptyLabel?: string;
}) {
  return <div className="space-y-3"><Field label={label}>{id => <Select id={id} label={label} disabled={disabled}
    value={value === undefined ? 'INHERIT' : value?.code ?? 'MISSING'}
    options={[...(inherited ? [{ value: 'INHERIT', label: 'Use session reason' }] : []), { value: 'MISSING', label: emptyLabel },
      ...checkoutReasonCodes.map(code => ({ value: code, label: checkoutReasonLabels[code] }))]}
    onChange={code => onChange(code === 'INHERIT' ? undefined : code === 'MISSING' ? null : { code: code as CheckoutReason['code'], note: '' })} />}</Field>
    {value?.code === 'OTHER' ? <Field label={`${label} explanation`} hint="At least ten meaningful characters.">{id => <Input id={id} value={value.note} maxLength={2000} disabled={disabled} onChange={event => onChange({ ...value, note: event.target.value })} />}</Field> : null}
  </div>;
}
