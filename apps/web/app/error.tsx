'use client';
import { Button } from '../components/ui/button';
export default function WorkspaceError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="grid min-h-dvh place-items-center p-6"><div className="surface max-w-lg p-7"><p className="eyebrow">Dayari Inventory</p><h1 className="text-2xl font-semibold">This workspace could not open</h1><p className="my-5 text-sm leading-7 text-stone-500">Retry the view. If a submission was interrupted, check its accepted record before starting a separate transaction.</p><div className="flex flex-wrap items-center gap-4"><Button onClick={reset}>Try again</Button><a href="/" className="text-link">Return to your shop</a></div></div></main>;
}
