import {expect,it} from 'vitest';
import {can} from '@dayari/contracts';
import {mainDestination,navGroups,workspaceAllowed} from '../../apps/web/components/shell/destinations.js';
it('consolidates sidebar destinations and preserves old routes',()=>{
 const keys=navGroups.flatMap(group=>group.keys);expect(keys).toEqual(['dashboard','inventory','receipts','checkout','labels','catalogue','reports','settings']);expect(new Set(keys).size).toBe(8);
 for(const [key,main] of Object.entries({availability:'inventory',counts:'inventory',damage:'inventory',requests:'inventory',receiving:'receipts',qr:'checkout',completion:'checkout',reconciliation:'checkout',suppliers:'catalogue',users:'settings',help:'settings'}))expect(mainDestination(key as any)).toBe(main);
});
it('Production inventory navigation does not grant operational API capabilities',()=>{
 expect(workspaceAllowed('PRODUCTION','inventory')).toBe(true);expect(can('PRODUCTION','OPERATIONAL_STOCK')).toBe(false);expect(can('PRODUCTION','CATALOGUE_READ')).toBe(false);
 expect(navGroups.flatMap(g=>g.keys).filter(key=>workspaceAllowed('PRODUCTION',key))).toEqual(['inventory','checkout','settings']);
 for(const key of ['counts','requests','users','labels','reports','reconciliation','completion'] as const)expect(workspaceAllowed('PRODUCTION',key)).toBe(false);
});
