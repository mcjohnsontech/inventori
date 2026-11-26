'use client';
import { QrCodeIcon, Search01Icon } from '@hugeicons/core-free-icons';
import { useEffect, useState } from 'react';

import { Icon } from '../ui/icon';
import { Tooltip } from '../ui/tooltip';
import { destinations, mainDestination, sectionTabs, tabLabel, type Workspace } from './destinations';

/**
 * Breadcrumb, the one search box for every printed code, and the connection
 * status in plain language. The signed-in account lives in the sidebar only.
 */
export function TopBar({
  workspace,
  onSearch,
}: {
  workspace: Workspace;
  onSearch: (term: string) => void;
}) {
  const main = mainDestination(workspace);
  const section = destinations[main].label;
  const own = workspace === 'availability' ? main : workspace;
  // Sections with tabs always show which view is open: "Inventory / Stock".
  const view = sectionTabs[main] ? (own === main ? tabLabel(main) : destinations[own].label) : '';
  const [term, setTerm] = useState('');

  useEffect(() => {
    document.title = `${view || section} · Dayari Inventory`;
  }, [section, view]);

  return (
    <div className="sticky top-[68px] z-20 border-b border-black/[0.06] bg-white/85 backdrop-blur lg:top-0">
      <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6 lg:h-16 lg:px-10">
        <nav aria-label="Breadcrumb" className="min-w-0">
          <ol className="flex min-w-0 items-center font-sans text-sm tracking-[-0.02em]">
            <li className={view ? 'truncate text-grey-3' : 'truncate font-semibold text-ink'}>
              {section}
            </li>
            {view ? (
              <>
                <li aria-hidden className="mx-2 text-black/15">/</li>
                <li aria-current="page" className="truncate font-semibold text-ink">{view}</li>
              </>
            ) : null}
          </ol>
        </nav>

        <div className="flex min-w-0 shrink-0 items-center gap-3">
          <form
            role="search"
            aria-label="Find a code"
            className={workspace === 'qr' ? 'hidden' : 'relative hidden md:block'}
            onSubmit={(event) => {
              event.preventDefault();
              const value = term.trim();
              if (!value) return;
              onSearch(value);
              setTerm('');
            }}
          >
            <span className="pointer-events-none absolute inset-y-0 left-0 grid w-10 place-items-center text-grey-3">
              <Icon icon={Search01Icon} size={16} />
            </span>
            <input
              type="search"
              aria-label="Find any code"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              maxLength={128}
              placeholder="Find product, lot, unit or QR code…"
              className="h-10 w-[20rem] rounded-lg border border-black/13 bg-white pr-3 pl-10 font-sans text-sm tracking-[-0.02em] text-ink outline-none placeholder:text-grey-3 hover:border-black/25 focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand xl:w-[24rem] [&::-webkit-search-cancel-button]:hidden"
            />
          </form>

          <Tooltip label="Scan & find" side="bottom">
            <button
              type="button"
              aria-label="Scan & find"
              onClick={() => onSearch('')}
              className="grid size-10 place-items-center rounded-lg border border-black/13 bg-white text-grey-2 transition-colors hover:border-black/25 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <Icon icon={QrCodeIcon} size={18} />
            </button>
          </Tooltip>

        </div>
      </div>
    </div>
  );
}
