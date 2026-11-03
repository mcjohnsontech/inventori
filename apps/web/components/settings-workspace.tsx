'use client';
import type {Role} from '@dayari/contracts';
import {Server} from 'lucide-react';
import {useApiRead} from '../lib/api';
import {AccountSecurity} from './account-security';
import {Badge,PageHeader,ReadError,LoadingState} from './ui/workspace';
type ShopInfo={originId:string;authority:string;timeZone:string;cloudSync:string;observedAt:string};
export function SettingsWorkspace({user,onPasswordChanged}:{user:{name:string;role:Role};onPasswordChanged:()=>void}){
 const shop=useApiRead<ShopInfo>(user.role==='ADMIN'?'admin/shop':null);
 const role=user.role==='ADMIN'?'Administrator':user.role==='MANAGER'?'Inventory Manager':'Production Staff';
 const description=user.role==='ADMIN'?'Manage your account and sessions. Shop staff administration is available in Users & access.':user.role==='MANAGER'?'Your account supports receiving, operational stock, receipts and lot labels. Catalogue registration remains Admin-only.':'Your account supports usable stock discovery and exact identification. Receiving and print administration are restricted.';
 return <div className="page"><PageHeader eyebrow="Your workspace" title="Account & shop" description={description} actions={<Badge>{role}</Badge>}/><AccountSecurity onChanged={onPasswordChanged}/>
 {user.role==='ADMIN'&&<section className="surface mt-6"><div className="surface-heading"><h2 className="flex items-center gap-2"><Server size={18}/>Shop authority</h2><Badge>Read-only configuration</Badge></div><div className="p-5">{shop.loading?<LoadingState/>:shop.error?<ReadError message={shop.error} onRetry={shop.refresh}/>:shop.data&&<dl className="grid gap-5 text-sm sm:grid-cols-2 lg:grid-cols-3"><div><dt className="text-xs text-stone-500">Authority mode</dt><dd className="mt-2 font-semibold">{shop.data.authority}</dd></div><div><dt className="text-xs text-stone-500">Shop origin</dt><dd className="mt-2 break-all font-mono text-xs">{shop.data.originId}</dd></div><div><dt className="text-xs text-stone-500">Business timezone</dt><dd className="mt-2 font-semibold">{shop.data.timeZone}</dd></div><div><dt className="text-xs text-stone-500">Cloud synchronization</dt><dd className="mt-2">{shop.data.cloudSync==='not-configured'?'Not configured':shop.data.cloudSync}</dd></div><div><dt className="text-xs text-stone-500">Observed at</dt><dd className="mt-2">{new Date(shop.data.observedAt).toLocaleString('en-GB',{timeZone:'Africa/Lagos'})} Lagos</dd></div></dl>}</div></section>}
 </div>;
}
