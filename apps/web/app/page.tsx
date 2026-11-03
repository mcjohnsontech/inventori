'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Box, Layers3, ShieldCheck } from 'lucide-react';
import type { Catalogue, Role } from '@dayari/contracts';
import { InventoryWorkspace } from '../components/inventory-workspace';
import { SuppliersWorkspace } from '../components/suppliers-workspace';
import { SettingsWorkspace } from '../components/settings-workspace';
import { api } from '../lib/api';
import { ReceiptsWorkspace } from '../components/receiving/receipts-workspace';
import { Dashboard } from '../components/dashboard';
import { CatalogueWorkspace } from '../components/catalogue/catalogue-workspace';
import { AppShell, type Workspace } from '../components/app-shell';
import { QrWorkspace } from '../components/labels/qr-workspace';
import { LabelWorkspace } from '../components/labels/label-workspace';
import { ReceivingWorkspace } from '../components/receiving/receiving-workspace';
import { ProductWizard, SupplierWizard } from '../components/catalogue/setup-wizards';
import { LoadingState } from '../components/ui/workspace';
import { Button } from '../components/ui/button';

type Actor = { id: string; name: string; role: Role };
export default function Page() {
  const [workspace, setWorkspace] = useState<Workspace>('dashboard');
  const acceptedHash = useRef('');
  function mayNavigate() { return window.dispatchEvent(new Event('dayari:before-navigate', { cancelable: true })); }
  useEffect(() => {
    const restore = () => {
      if (location.hash !== acceptedHash.current && !mayNavigate()) { history.replaceState(null, '', `${location.pathname}${acceptedHash.current}`); return; }
      acceptedHash.current = location.hash;
      const [key = '', detail = ''] = location.hash.slice(1).split('/');
      if (['dashboard', 'catalogue', 'suppliers', 'inventory', 'receiving', 'receipts', 'labels', 'qr', 'settings'].includes(key)) {
        const id = /^[0-9a-f-]{36}$/i.test(detail) ? detail : '';
        setWorkspace(key as Workspace);
        if (key === 'catalogue') setCatalogueDetail(id);
        if (key === 'inventory') setStockProduct(id);
        if (key === 'receipts') setReceiptContext(id);
      }
    };
    restore(); window.addEventListener('hashchange', restore); return () => window.removeEventListener('hashchange', restore);
  }, []);
  function navigate(next: Workspace, id = '') { if (!mayNavigate()) return; const hash = `#${next}${id ? `/${id}` : ''}`; acceptedHash.current = hash; location.hash = hash; setWorkspace(next); setNotice(''); if (next === 'catalogue') setCatalogueDetail(id); if (next === 'inventory') setStockProduct(id); if (next === 'receipts') setReceiptContext(id); }
  const [user, setUser] = useState<Actor | null>(null);
  const [catalogue, setCatalogue] = useState<Catalogue>({ products: [], suppliers: [], skus: [], locations: [], sourcings: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [flow, setFlow] = useState<'supplier' | 'product' | null>(null);
  const [supplierContext, setSupplierContext] = useState('');
  const [productContext, setProductContext] = useState('');
  const [stockProduct, setStockProduct] = useState('');
  const [receiptContext, setReceiptContext] = useState('');
  const [catalogueDetail, setCatalogueDetail] = useState('');
  const [catalogueReady, setCatalogueReady] = useState(false);
  async function load(actor: Actor) { if (actor.role !== 'PRODUCTION') { setCatalogue(await api<Catalogue>('catalogue')); setCatalogueReady(true); } }
  useEffect(() => { api<Actor>('me').then(async actor => { setUser(actor); if (actor.role === 'PRODUCTION') setWorkspace('qr'); try { await load(actor); } catch (failure) { setError((failure as Error).message); } }).catch(() => {}).finally(() => setLoading(false)); }, []);
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try { const result = await api<{user: Actor}>('sessions', { method: 'POST', body: JSON.stringify(data) }); setUser(result.user); if (result.user.role === 'PRODUCTION') navigate('qr'); await load(result.user); } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true);
    try { await api('sessions/logout', { method: 'POST', body: '{}' }); sessionStorage.removeItem('dayari_pending_catalogue'); sessionStorage.removeItem('dayari_pending_supplier-setups'); sessionStorage.removeItem('dayari_pending_product-setups'); for(const key of Object.keys(sessionStorage))if(key.startsWith('dayari_label_'))sessionStorage.removeItem(key); setWorkspace('dashboard'); history.replaceState(null, '', location.pathname); sessionStorage.removeItem('dayari_pending_receipt'); setUser(null); setCatalogueReady(false); setCatalogueDetail(''); setStockProduct(''); setReceiptContext(''); setCatalogue({ products: [], suppliers: [], skus: [], locations: [], sourcings: [] }); setFlow(null); setError(''); setNotice(''); } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  }
  function openSupplier(id = '') { setSupplierContext(id); setError(''); setNotice(''); setFlow('supplier'); }
  function openProduct(id = '') { setProductContext(id); setError(''); setNotice(''); setFlow('product'); }
  async function saved(message: string) {
    setFlow(null); setNotice(message);
    if (user) { try { await load(user); } catch { setError('Saved successfully. Refresh the page to reload the catalogue.'); } }
  }
  if (loading) return <main className="grid min-h-screen place-items-center text-sm text-stone-500">Opening Dayari Inventory…</main>;
  if (!user) return <main className="grid min-h-screen lg:grid-cols-2">
    <section className="flex flex-col justify-between bg-[#153e31] p-6 text-white lg:p-16">
      <div className="flex items-center gap-3 text-xl font-semibold"><span className="grid size-9 place-items-center rounded-xl bg-white/10"><Layers3 size={21} /></span>dayari<span className="ml-2 text-xs font-normal uppercase tracking-[.2em] text-emerald-100/60">Inventory</span></div>
      <div className="my-5 max-w-lg lg:my-20"><span className="text-xs uppercase tracking-[.2em] text-lime-200">A clearer view of your shop</span><h1 className="mt-4 text-3xl lg:text-5xl font-medium leading-[1.12] tracking-tight">Good work starts<br />with knowing<br />what you have.</h1><p className="mt-4 max-w-sm text-sm lg:text-base leading-7 text-emerald-100/70">One shared product catalogue. Every supplier, source and variant kept connected.</p></div>
      <p className="flex items-center gap-2 text-xs text-emerald-100/60"><ShieldCheck size={15} />Connected to your local shop service</p>
    </section>
    <section className="flex items-center justify-center p-8"><div className="w-full max-w-sm"><div className="mb-7 grid size-12 place-items-center rounded-2xl border border-stone-200 bg-white"><Box size={23} /></div><p className="text-xs font-semibold uppercase tracking-widest text-emerald-800">Welcome back</p><h2 className="mt-3 text-3xl font-semibold tracking-tight">Sign in to your shop</h2><p className="mt-3 text-sm leading-6 text-stone-500">Use your Dayari account to continue.</p>
      <form onSubmit={login} className="mt-8 space-y-5"><label>Email address<input name="email" type="email" autoComplete="username" required placeholder="you@dayari.com" /></label><label>Password<input name="password" type="password" autoComplete="current-password" required maxLength={256} /></label>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}<Button className="w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}<ArrowRight size={16} /></Button></form><p className="mt-8 text-xs leading-5 text-stone-500">Need access? Ask your administrator to set up your account.</p></div></section>
  </main>;

  return <AppShell workspace={user.role === 'PRODUCTION' && workspace !== 'settings' ? 'qr' : workspace} available={['dashboard', 'catalogue', 'suppliers', 'inventory', 'receiving', 'receipts', 'labels', 'qr', 'settings']} onNavigate={navigate} user={user} onLogout={logout} busy={busy}>
    {notice && <p role="status" className="mx-5 mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 break-words">{notice}</p>}
    {error && <div role="alert" className="mx-5 mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}<Button variant="outline" size="small" className="ml-3" onClick={() => load(user).then(() => setError('')).catch(failure => setError(failure.message))}>Reload catalogue</Button></div>}
    {user.role !== 'PRODUCTION' && !catalogueReady ? <div className="page">{error ? <p className="text-sm text-stone-500">Catalogue data is unavailable. Reload it above before continuing.</p> : <LoadingState />}</div> : workspace === 'settings' ? <SettingsWorkspace user={user} /> : user.role === 'PRODUCTION' ? <QrWorkspace /> : workspace === 'dashboard' ? <Dashboard catalogue={catalogue} name={user.name} navigate={navigate} onReceipt={id => navigate('receipts', id)} /> : workspace === 'qr' ? <QrWorkspace /> : workspace === 'labels' ? <LabelWorkspace /> : workspace === 'inventory' ? <InventoryWorkspace catalogue={catalogue} initialProductId={stockProduct} onProductDetail={id => navigate('catalogue', id)} onProductFilter={id => navigate('inventory', id)} onReceipt={id => navigate('receipts', id)} /> : workspace === 'suppliers' ? <SuppliersWorkspace catalogue={catalogue} role={user.role} onSupplier={openSupplier} onProduct={openProduct} /> : workspace === 'receipts' ? <ReceiptsWorkspace initialReceiptId={receiptContext} onSelect={id => navigate('receipts', id)} onStock={id => navigate('inventory', id)} /> : workspace === 'receiving' ? <ReceivingWorkspace onHistory={() => navigate('receipts')} onInventory={id => navigate('inventory', id)} /> : <CatalogueWorkspace initialProductId={catalogueDetail} onSelect={id => navigate('catalogue', id)} catalogue={catalogue} role={user.role} onProduct={openProduct} onSupplier={openSupplier} onStock={id => navigate('inventory', id)} />}
    {flow === 'supplier' && user.role === 'ADMIN' && <SupplierWizard catalogue={catalogue} initialSupplierId={supplierContext} onClose={() => setFlow(null)} onSaved={saved} />}
    {flow === 'product' && user.role === 'ADMIN' && <ProductWizard catalogue={catalogue} initialProductId={productContext} onClose={() => setFlow(null)} onSaved={saved} onConfigureSupplier={openSupplier} />}
  </AppShell>;
}
