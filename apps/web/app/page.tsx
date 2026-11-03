'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { Catalogue, Role } from '@dayari/contracts';

import { api } from '../lib/api';
import { AppShell } from '../components/shell/app-shell';
import { workspaceOrder, type Workspace } from '../components/shell/destinations';
import { LoginPage } from '../components/login-page';
import { WorkspaceRouter } from '../components/workspace-router';
import { ProductWizard, SupplierWizard } from '../components/catalogue/setup-wizards';
import {
  DetailSkeleton,
  ErrorNotice,
  Page,
  SuccessNotice,
} from '../components/ui';

type Actor = { id: string; name: string; role: Role };

const EMPTY_CATALOGUE: Catalogue = {
  products: [],
  suppliers: [],
  skus: [],
  locations: [],
  sourcings: [],
};

const UUID = /^[0-9a-f-]{36}$/i;

const PRODUCTION_WORKSPACES: Workspace[] = ['qr', 'settings'];

export default function DayariInventory() {
  const [workspace, setWorkspace] = useState<Workspace>('dashboard');
  const [user, setUser] = useState<Actor | null>(null);
  const [catalogue, setCatalogue] = useState<Catalogue>(EMPTY_CATALOGUE);
  const [catalogueReady, setCatalogueReady] = useState(false);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [flow, setFlow] = useState<'supplier' | 'product' | null>(null);
  const [supplierContext, setSupplierContext] = useState('');
  const [productContext, setProductContext] = useState('');

  const [detail, setDetail] = useState({ catalogue: '', stock: '', receipt: '' });

  const acceptedHash = useRef('');

  /** An open wizard can veto a route change to protect its unsaved draft. */
  const mayNavigate = useCallback(
    () => window.dispatchEvent(new Event('dayari:before-navigate', { cancelable: true })),
    [],
  );

  const applyDetail = useCallback((key: Workspace, id: string) => {
    setDetail((previous) => ({
      ...previous,
      ...(key === 'catalogue' ? { catalogue: id } : {}),
      ...(key === 'inventory' ? { stock: id } : {}),
      ...(key === 'receipts' ? { receipt: id } : {}),
    }));
  }, []);

  useEffect(() => {
    const restore = () => {
      if (location.hash !== acceptedHash.current && !mayNavigate()) {
        history.replaceState(null, '', `${location.pathname}${acceptedHash.current}`);
        return;
      }

      acceptedHash.current = location.hash;
      const [key = '', detailId = ''] = location.hash.slice(1).split('/');

      if (workspaceOrder.includes(key as Workspace)) {
        const id = UUID.test(detailId) ? detailId : '';
        setWorkspace(key as Workspace);
        applyDetail(key as Workspace, id);
      }
    };

    restore();
    window.addEventListener('hashchange', restore);
    return () => window.removeEventListener('hashchange', restore);
  }, [mayNavigate, applyDetail]);

  const load = useCallback(async (actor: Actor) => {
    if (actor.role === 'PRODUCTION') return;
    setCatalogue(await api<Catalogue>('catalogue'));
    setCatalogueReady(true);
  }, []);

  useEffect(() => {
    api<Actor>('me')
      .then(async (actor) => {
        setUser(actor);
        if (actor.role === 'PRODUCTION') setWorkspace('qr');
        try {
          await load(actor);
        } catch (failure) {
          setError((failure as Error).message);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [load]);

  function navigate(next: Workspace, id = '') {
    if (!mayNavigate()) return;

    const hash = `#${next}${id ? `/${id}` : ''}`;
    acceptedHash.current = hash;
    location.hash = hash;

    setWorkspace(next);
    setNotice('');
    applyDetail(next, id);
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');

    const data = Object.fromEntries(new FormData(event.currentTarget));

    try {
      const result = await api<{ user: Actor }>('sessions', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      setUser(result.user);
      if (result.user.role === 'PRODUCTION') navigate('qr');
      await load(result.user);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);

    try {
      await api('sessions/logout', { method: 'POST', body: '{}' });

      for (const key of Object.keys(sessionStorage)) {
        if (key.startsWith('dayari_')) sessionStorage.removeItem(key);
      }

      history.replaceState(null, '', location.pathname);
      acceptedHash.current = '';

      setWorkspace('dashboard');
      setUser(null);
      setCatalogue(EMPTY_CATALOGUE);
      setCatalogueReady(false);
      setDetail({ catalogue: '', stock: '', receipt: '' });
      setFlow(null);
      setError('');
      setNotice('');
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function openSupplier(id = '') {
    setSupplierContext(id);
    setError('');
    setNotice('');
    setFlow('supplier');
  }

  function openProduct(id = '') {
    setProductContext(id);
    setError('');
    setNotice('');
    setFlow('product');
  }

  async function saved(message: string) {
    setFlow(null);
    setNotice(message);

    if (!user) return;

    try {
      await load(user);
    } catch {
      setError('Saved successfully. Refresh the page to reload the catalogue.');
    }
  }

  if (loading) {
    return (
      <main className="grid min-h-dvh place-items-center">
        <p className="font-sans text-sm tracking-[-0.02em] text-grey-3">
          Opening Dayari Inventory…
        </p>
      </main>
    );
  }

  if (!user) {
    return <LoginPage onSubmit={login} busy={busy} error={error} />;
  }

  const available =
    user.role === 'PRODUCTION' ? PRODUCTION_WORKSPACES : [...workspaceOrder];
  const current =
    user.role === 'PRODUCTION' && workspace !== 'settings' ? 'qr' : workspace;
  const awaitingCatalogue = user.role !== 'PRODUCTION' && !catalogueReady;

  return (
    <AppShell
      workspace={current}
      available={available}
      account={user}
      busy={busy}
      onNavigate={navigate}
      onLogout={logout}
    >
      {notice || error ? (
        <div className="space-y-3 px-4 pt-5 sm:px-6 lg:px-10">
          {notice ? <SuccessNotice message={notice} /> : null}
          {error ? (
            <ErrorNotice
              message={error}
              onRetry={() =>
                load(user)
                  .then(() => setError(''))
                  .catch((failure) => setError(failure.message))
              }
            />
          ) : null}
        </div>
      ) : null}

      {awaitingCatalogue ? (
        <Page>
          {error ? (
            <p className="font-sans text-sm tracking-[-0.02em] text-grey-2">
              Catalogue data is unavailable. Reload it above before continuing.
            </p>
          ) : (
            <DetailSkeleton rows={4} />
          )}
        </Page>
      ) : (
        <WorkspaceRouter
          workspace={current}
          catalogue={catalogue}
          user={user}
          detail={detail}
          navigate={navigate}
          onSupplierFlow={openSupplier}
          onProductFlow={openProduct}
        />
      )}

      {flow === 'supplier' && user.role === 'ADMIN' ? (
        <SupplierWizard
          catalogue={catalogue}
          initialSupplierId={supplierContext}
          onClose={() => setFlow(null)}
          onSaved={saved}
        />
      ) : null}

      {flow === 'product' && user.role === 'ADMIN' ? (
        <ProductWizard
          catalogue={catalogue}
          initialProductId={productContext}
          onClose={() => setFlow(null)}
          onSaved={saved}
          onConfigureSupplier={openSupplier}
        />
      ) : null}
    </AppShell>
  );
}
