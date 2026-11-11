'use client';
import { useState, type ComponentProps } from 'react';
import type { Catalogue, Role } from '@dayari/contracts';

import {CountsWorkspace} from './counts-workspace';
import { CompletionWorkspace } from './completion-workspace';
import { AuthorizationRequestsWorkspace } from './authorization-requests-workspace';
import { DamageWorkspace } from './damage-workspace';
import { ReconciliationWorkspace } from './reconciliation-workspace';
import { CheckoutLookupWorkspace } from './checkout-lookup-workspace';
import { CatalogueWorkspace } from './catalogue/catalogue-workspace';
import { Dashboard } from './dashboard';
import { HelpWorkspace } from './help-workspace';
import { InventoryWorkspace } from './inventory-workspace';
import { PrintingWorkspace } from './labels/printing-workspace';
import { ProductionWorkspace } from './production-workspace';
import { ReceiptsWorkspace } from './receiving/receipts-workspace';
import { ReportsWorkspace } from './operational-reports-workspace';
import { SettingsWorkspace } from './settings-workspace';
import { SuppliersWorkspace } from './suppliers-workspace';
import { UsersWorkspace } from './users-workspace';
import { Button, DetailSkeleton, EmptyState, Page, card } from './ui';
import { cn } from '../lib/cn';
import { workspaceAllowed, mainDestination, type Workspace } from './shell/destinations';

/** Workspaces that cannot render until the catalogue snapshot has loaded. */
const NEEDS_CATALOGUE: Workspace[] = [
  'dashboard',
  'catalogue',
  'suppliers',
  'inventory',
  'reports',
];

export type Actor = { id: string; name: string; role: Role };

function Blocked({
  title,
  message,
  onHome,
}: {
  title: string;
  message: string;
  onHome: () => void;
}) {
  return (
    <Page>
      <div className={cn(card, 'mx-auto max-w-lg px-6 py-10 text-center')}>
        <h1 className="font-display text-2xl font-semibold tracking-[-0.03em] text-ink">{title}</h1>
        <p className="mt-3 font-sans text-sm leading-[1.7] tracking-[-0.02em] text-grey-2">
          {message}
        </p>
        <Button className="mt-6" onClick={onHome}>
          Return to your workspace
        </Button>
      </div>
    </Page>
  );
}

function WorkspaceContent({
  workspace,
  overlayActive = false,
  catalogue,
  catalogueReady,
  user,
  detail,
  missing,
  error,
  navigate,
  onSupplierFlow,
  onProductFlow,
  onPasswordChanged,
  onCatalogueChanged,
  onReceive,
}: {
  overlayActive?: boolean;
  workspace: Workspace;
  catalogue: Catalogue;
  catalogueReady: boolean;
  user: Actor;
  detail: { catalogue: string; stock: string; lot: string; receipt: string; labelJob: string; labelReceipt:string; qrCode: string };
  missing: boolean;
  error: string;
  navigate: (workspace: Workspace, id?: string, lotId?: string) => void;
  onSupplierFlow: (id?: string) => void;
  onProductFlow: (id?: string) => void;
  onPasswordChanged: () => void;
  onCatalogueChanged: (catalogue: Catalogue) => void;
  onReceive: () => void;
}) {
  const home = () => navigate(user.role === 'PRODUCTION' ? 'inventory' : 'dashboard');

  if (missing) {
    return (
      <Blocked
        title="Workspace not found"
        message="This workspace address is unavailable."
        onHome={home}
      />
    );
  }

  if (!workspaceAllowed(user.role, workspace)) {
    return (
      <Blocked
        title="Access restricted"
        message="This workspace is not available for your role."
        onHome={home}
      />
    );
  }

  if (user.role !== 'PRODUCTION' && NEEDS_CATALOGUE.includes(workspace) && !catalogueReady) {
    return (
      <Page>
        {error ? (
          <EmptyState title="Catalogue data is unavailable">
            Reload it above before continuing.
          </EmptyState>
        ) : (
          <DetailSkeleton rows={4} />
        )}
      </Page>
    );
  }

  switch (workspace) {
    case 'counts':
      return <CountsWorkspace actorId={user.id}/>;
    case 'completion':
      return <CompletionWorkspace actorId={user.id} />;
    case 'requests':
      return <AuthorizationRequestsWorkspace actorId={user.id} />;

    case 'damage':
      return <DamageWorkspace actorId={user.id} />;

    case 'reconciliation':
      return <ReconciliationWorkspace actorId={user.id} />;

    case 'checkout':
      return <CheckoutLookupWorkspace key="checkout" actorId={user.id} />;

    case 'help':
      return <HelpWorkspace role={user.role} navigate={navigate} />;

    case 'reports':
      return (
        <ReportsWorkspace
          catalogue={catalogue}
          onProduct={(id) => navigate('inventory', id)}
          onReceipt={(id) => navigate('receipts', id)}
          onLabels={(id) => navigate('labels', id)}
        />
      );

    case 'availability':
      return (
        <ProductionWorkspace
          onCheckout={() => navigate('checkout')}
          onScan={() => navigate('qr')}
          onCode={(code) => navigate('qr', code)}
        />
      );

    case 'users':
      return <UsersWorkspace actorId={user.id} />;

    case 'settings':
      return <SettingsWorkspace user={user} onPasswordChanged={onPasswordChanged} />;

    case 'qr':
      return <CheckoutLookupWorkspace key={`lookup:${detail.qrCode}`} actorId={user.id} initialCode={detail.qrCode} initialMode="lookup" />;

    case 'labels':
      return <PrintingWorkspace actorId={user.id} initialLegacyJobId={detail.labelJob} initialReceiptId={detail.labelReceipt} />;

    case 'suppliers':
      return (
        <SuppliersWorkspace
          catalogue={catalogue}
          role={user.role}
          onSupplier={onSupplierFlow}
          onProduct={onProductFlow}
        />
      );

    case 'inventory':
      if(user.role==='PRODUCTION')return <ProductionWorkspace onCheckout={()=>navigate('checkout')} onScan={()=>navigate('qr')} onCode={code=>navigate('qr',code)}/>;
      return (
        <InventoryWorkspace
          catalogue={catalogue}
          initialProductId={detail.stock}
          initialLotId={detail.lot}
          onProductDetail={(id) => navigate('catalogue', id)}
          onProductFilter={(id) => navigate('inventory', id)}
          onReceipt={(id) => navigate('receipts', id)}
        />
      );

    case 'receiving':
    case 'receipts':
      return (
        <ReceiptsWorkspace
          initialReceiptId={detail.receipt}
          onUnitLabels={(id)=>navigate('labels','',id)}
          onSelect={(id) => navigate('receipts', id)}
          onStock={(id) => navigate('inventory', id)}
          onReceive={onReceive}
        />
      );

    case 'catalogue':
      return (
        <CatalogueWorkspace
          active={!overlayActive}
          catalogue={catalogue}
          role={user.role}
          initialProductId={detail.catalogue}
          onSelect={(id) => navigate('catalogue', id)}
          onProduct={onProductFlow}
          onSupplier={onSupplierFlow}
          onSupplierDirectory={() => navigate('suppliers')}
          onStock={(id) => navigate('inventory', id)}
        />
      );

    default:
      return (
        <Dashboard
          catalogue={catalogue}
          name={user.name}
          role={user.role}
          navigate={navigate}
          onReceipt={(id) => navigate('receipts', id)}
          onLot={(productId, lotId) => navigate('inventory', productId, lotId)}
          onReceive={onReceive}
        />
      );
  }
}

export function WorkspaceRouter(props:ComponentProps<typeof WorkspaceContent>){
 const {workspace,user,navigate}=props;
 const main=mainDestination(workspace);
 const groups:Partial<Record<Workspace,{key:Workspace;label:string}[]>>={
 inventory:[{key:'inventory',label:'Stock'},{key:'counts',label:'Count history'},{key:'requests',label:'Requests'},{key:'damage',label:'Damaged / BAD'}],
 checkout:[{key:'checkout',label:'Checkout & lookup'},{key:'completion',label:'In Production'},{key:'reconciliation',label:'Reason follow-up'}],
 catalogue:[{key:'catalogue',label:'Products'},{key:'suppliers',label:'Suppliers'}],
 settings:[{key:'settings',label:'My account'},{key:'users',label:'Staff & invitations'},{key:'help',label:'Help'}],
 };
 const tabs=(groups[main]??[]).filter(item=>workspaceAllowed(user.role,item.key));
 // Stock browsing stays mounted while inspecting inventory subviews, preserving filters/pages.
 const [stockVisited,setStockVisited]=useState(false);
 if(workspace==='inventory'&&!stockVisited)setStockVisited(true);
 const preserveStock=main==='inventory'&&stockVisited;
 return <>{tabs.length>1?<nav aria-label={`${main} views`} className="flex flex-wrap gap-2 px-4 pt-5 sm:px-6 lg:px-10">{tabs.map(item=><Button key={item.key} variant={(workspace===item.key||(workspace==='availability'&&item.key==='inventory')||(workspace==='qr'&&item.key==='checkout'))?'primary':'secondary'} aria-pressed={workspace===item.key} onClick={()=>navigate(item.key)}>{item.label}</Button>)}</nav>:null}
 {preserveStock?<div hidden={workspace!=='inventory'}><WorkspaceContent {...props} workspace="inventory"/></div>:null}
 {(!preserveStock||workspace!=='inventory')?<WorkspaceContent {...props}/>:null}</>;
}
