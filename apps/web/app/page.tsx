'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { Catalogue, ReceivingOptions, Role } from '@dayari/contracts';

import { ApiError, api } from '../lib/api';
import { AppShell } from '../components/shell/app-shell';
import { workspaceOrder, type Workspace } from '../components/shell/destinations';
import { LoginPage } from '../components/login-page';
import { WorkspaceRouter } from '../components/workspace-router';
import { ProductWizard, SupplierWizard } from '../components/catalogue/setup-wizards';
import { ReceiveWizard } from '../components/receiving/receive-wizard';
import { PasswordForm } from '../components/account-security';
import { Button, ErrorNotice, SuccessNotice } from '../components/ui';

type Actor = { id: string; name: string; role: Role; mustChangePassword?: boolean };

const EMPTY_CATALOGUE: Catalogue = {
  products: [],
  suppliers: [],
  skus: [],
  locations: [],
  sourcings: [],
};

const UUID = /^[0-9a-f-]{36}$/i;

const PRODUCTION_WORKSPACES: Workspace[] = ['availability', 'qr', 'settings', 'help'];

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

  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiveOptions, setReceiveOptions] = useState<ReceivingOptions | null>(null);
  /** Remounts the active workspace after an accepted receipt so its reads refresh. */
  const [dataVersion, setDataVersion] = useState(0);
  /**
   * Set after a receipt is accepted. The wizard still counts as busy while its
   * save resolves, so the route change waits for the next commit, when the
   * dialog has unmounted and its unsaved-draft guard is gone.
   */
  const [receiptToOpen, setReceiptToOpen] = useState('');

  const [detail, setDetail] = useState({
    catalogue: '',
    stock: '',
    lot: '',
    receipt: '',
    labelJob: '',
    qrCode: '',
  });
  const [missing, setMissing] = useState(false);

  const acceptedHash = useRef('');

  /** An open wizard can veto a route change to protect its unsaved draft. */
  const mayNavigate = useCallback(
    () => window.dispatchEvent(new Event('dayari:before-navigate', { cancelable: true })),
    [],
  );

  const applyDetail = useCallback((key: Workspace, id: string, lotId = '') => {
    setDetail((previous) => ({
      ...previous,
      ...(key === 'catalogue' ? { catalogue: id } : {}),
      ...(key === 'inventory' ? { stock: id, lot: lotId } : {}),
      ...(key === 'receipts' ? { receipt: id } : {}),
      ...(key === 'labels' ? { labelJob: id } : {}),
      ...(key === 'qr' ? { qrCode: id } : {}),
    }));
  }, []);

  useEffect(() => {
    const restore = () => {
      if (location.hash !== acceptedHash.current && !mayNavigate()) {
        history.replaceState(null, '', `${location.pathname}${acceptedHash.current}`);
        return;
      }

      acceptedHash.current = location.hash;
      const [key = '', detailId = '', lotDetail = ''] = location.hash.slice(1).split('/');
      const known = workspaceOrder.includes(key as Workspace);

      setMissing(Boolean(key) && !known);

      if (known) {
        const workspaceKey = key as Workspace;
        // QR takes a printed code; everything else takes a record id.
        const id =
          workspaceKey === 'qr'
            ? /^[PL][A-Z0-9]{5}$/.test(detailId)
              ? detailId
              : ''
            : UUID.test(detailId)
              ? detailId
              : '';
        setWorkspace(workspaceKey);
        applyDetail(workspaceKey, id, UUID.test(lotDetail) ? lotDetail : '');
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
        if (actor.role === 'PRODUCTION' && !location.hash) setWorkspace('availability');
        try {
          await load(actor);
        } catch (failure) {
          setError((failure as Error).message);
        }
      })
      .catch((failure) => {
        if (!(failure instanceof ApiError) || failure.status !== 401) {
          setError((failure as Error).message);
        }
      })
      .finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    const expired = () => {
      setUser(null);
      setCatalogueReady(false);
      setFlow(null);
      setError('Your session ended or your access changed. Sign in again.');
    };

    window.addEventListener('dayari:session-expired', expired);
    return () => window.removeEventListener('dayari:session-expired', expired);
  }, []);

  useEffect(() => {
    if (!receiptToOpen) return;

    setReceiptToOpen('');
    navigate('receipts', receiptToOpen);
    setNotice('Delivery accepted. Receipt evidence and stock projections are updating.');
    // navigate is declared below and is not a dependency of this one-shot handoff.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receiptToOpen]);

  function navigate(next: Workspace, id = '', lotId = '') {
    if (!mayNavigate()) return;

    const hash = `#${next}${id ? `/${id}` : ''}${next === 'inventory' && id && lotId ? `/${lotId}` : ''}`;
    acceptedHash.current = hash;
    location.hash = hash;

    setWorkspace(next);
    setMissing(false);
    setNotice('');
    applyDetail(next, id, lotId);
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
      if (result.user.role === 'PRODUCTION') navigate('availability');
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
      setDetail({ catalogue: '', stock: '', lot: '', receipt: '', labelJob: '', qrCode: '' });
      setFlow(null);
      setReceiveOpen(false);
      setReceiveOptions(null);
      setReceiptToOpen('');
      setError('');
      setNotice('');
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function passwordChanged() {
    setUser((previous) => (previous ? { ...previous, mustChangePassword: false } : previous));
    setNotice('Password updated.');
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

  /**
   * The receive wizard is a dialog, so any page can start a delivery without
   * leaving its context. Options are loaded first to keep the dialog synchronous.
   */
  async function openReceive() {
    setError('');
    setNotice('');

    try {
      const options = await api<ReceivingOptions>('receiving/options');
      if (!options.suppliers.length) {
        setNotice('Ask Admin to register a supplier and its location prefix before receiving.');
        return;
      }
      setReceiveOptions(options);
      setReceiveOpen(true);
    } catch (failure) {
      setError((failure as Error).message);
    }
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

  if (user.mustChangePassword) {
    return (
      <main className="mx-auto grid min-h-dvh max-w-lg content-center gap-5 p-5">
        <p className="font-sans text-xs font-semibold tracking-[0.1em] text-brand uppercase">
          Dayari · Account setup
        </p>
        <PasswordForm required onChanged={passwordChanged} />
        <Button variant="secondary" onClick={logout} disabled={busy}>
          Sign out
        </Button>
      </main>
    );
  }

  const available =
    user.role === 'PRODUCTION' ? PRODUCTION_WORKSPACES : [...workspaceOrder];
  const current = workspace;

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

      <WorkspaceRouter
        key={dataVersion}
        workspace={current}
        catalogue={catalogue}
        catalogueReady={catalogueReady}
        user={user}
        detail={detail}
        missing={missing}
        error={error}
        navigate={navigate}
        onSupplierFlow={openSupplier}
        onProductFlow={openProduct}
        onPasswordChanged={passwordChanged}
        onCatalogueChanged={setCatalogue}
        onReceive={() => void openReceive()}
      />

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

      {receiveOpen && receiveOptions ? (
        <ReceiveWizard
          options={receiveOptions}
          onCatalogueChanged={setCatalogue}
          onClose={() => setReceiveOpen(false)}
          onSaved={(receipt) => {
            setReceiveOpen(false);
            setReceiveOptions(null);
            setReceiptToOpen(receipt.id);
            setDataVersion((version) => version + 1);
          }}
        />
      ) : null}
    </AppShell>
  );
}
