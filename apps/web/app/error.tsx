'use client';
import { Button, card } from '../components/ui';
import { cn } from '../lib/cn';

export default function WorkspaceError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className={cn(card, 'max-w-lg p-7')}>
        <p className="font-sans text-xs font-semibold tracking-[0.1em] text-brand uppercase">
          Dayari Inventory
        </p>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-[-0.03em] text-ink">
          This workspace could not open
        </h1>
        <p className="mt-4 font-sans text-sm leading-[1.7] tracking-[-0.02em] text-grey-2">
          Retry the view. If a submission was interrupted, check its accepted record before
          starting a separate transaction.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <Button onClick={reset}>Try again</Button>
          <a
            href="/"
            className="font-sans text-[13px] font-semibold tracking-[-0.02em] text-brand underline-offset-4 hover:underline"
          >
            Return to your shop
          </a>
        </div>
      </div>
    </main>
  );
}
