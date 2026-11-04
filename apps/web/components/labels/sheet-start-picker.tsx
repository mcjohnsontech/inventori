'use client';
import { labelCell, type LabelProfile, type SheetStart } from '@dayari/contracts';
import { useState } from 'react';
import { Button, Footnote } from '../ui';
export function SheetStartPicker({
  profile,
  value,
  onChange,
  disabled = false,
  hasDamaged,
}: {
  profile: LabelProfile;
  value: SheetStart;
  onChange: (next: SheetStart) => void;
  disabled?: boolean;
  hasDamaged: boolean;
}) {
  const [damaged, setDamaged] = useState(false);
  const slot = damaged ? value.damagedStartSlot : value.startSlot,
    capacity = profile.columns * profile.rows;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="compact"
          variant={damaged ? 'secondary' : 'primary'}
          onClick={() => setDamaged(false)}
        >
          Usable start
        </Button>
        {hasDamaged && (
          <Button
            type="button"
            size="compact"
            variant={damaged ? 'primary' : 'secondary'}
            onClick={() => setDamaged(true)}
          >
            Damaged start
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-5">
        <div
          role="group"
          aria-label={`${damaged ? 'Damaged' : 'Usable'} first free label`}
          className="grid w-40 gap-1 rounded-lg border border-black/10 bg-white p-2"
          style={{ gridTemplateColumns: `repeat(${profile.columns}, minmax(0,1fr))` }}
        >
          {Array.from({ length: capacity }, (_, n) => {
            const cell = labelCell(profile, n);
            return (
              <button
                key={n}
                type="button"
                disabled={disabled}
                aria-label={`Start at label ${n + 1}`}
                aria-pressed={n === slot}
                tabIndex={n === slot ? 0 : -1}
                onKeyDown={(e) => {
                  const moves: Record<string, number> = {
                    ArrowRight: 1,
                    ArrowLeft: -1,
                    ArrowDown: profile.columns,
                    ArrowUp: -profile.columns,
                  };
                  const delta = moves[e.key];
                  if (delta === undefined) return;
                  e.preventDefault();
                  const next = Math.min(capacity - 1, Math.max(0, n + delta));
                  onChange({ ...value, [damaged ? 'damagedStartSlot' : 'startSlot']: next });
                  e.currentTarget.parentElement?.querySelectorAll('button')[next]?.focus();
                }}
                title={`Row ${Math.floor(n / profile.columns) + 1}, column ${(n % profile.columns) + 1}`}
                onClick={() =>
                  onChange({ ...value, [damaged ? 'damagedStartSlot' : 'startSlot']: n })
                }
                className={`min-h-6 rounded-sm border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed ${n === slot ? 'border-brand bg-brand/20' : n < slot ? 'border-dashed border-black/15 bg-black/[0.03]' : 'border-black/20 bg-white hover:bg-brand/10'}`}
                style={{ aspectRatio: `${cell.width}/${cell.height}` }}
              />
            );
          })}
        </div>
        <div className="min-w-36 flex-1">
          <p className="text-sm font-semibold">Starts at label {slot + 1}</p>
          <p className="mt-1 text-xs leading-5 text-grey-2">
            {slot
              ? `${slot} earlier positions stay blank. Tap the first unused label.`
              : 'Use a fresh sheet, or tap its first free label.'}
          </p>
        </div>
      </div>
      <Footnote>
        {disabled
          ? 'Saved PDF layout. For another start, create a reprint.'
          : 'Each purpose starts on its own sheet. Later sheets start at label 1.'}
      </Footnote>
    </div>
  );
}
