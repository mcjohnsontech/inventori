import {expect,it} from 'vitest';
import {can} from '@dayari/contracts';
import {destinations,mainDestination,navGroups,sectionTabs,workspaceAllowed,type Workspace} from '../../apps/web/components/shell/destinations.js';
it('consolidates sidebar destinations and preserves old routes',()=>{
 const keys=navGroups.flatMap(group=>group.keys);expect(keys).toEqual(['dashboard','inventory','receipts','checkout','qr','labels','catalogue','reports','settings']);expect(new Set(keys).size).toBe(9);
 for(const [key,main] of Object.entries({availability:'inventory',counts:'inventory',damage:'inventory',requests:'inventory',closing:'inventory',receiving:'receipts',qr:'qr',completion:'checkout',reconciliation:'checkout',orders:'checkout',checkoutHistory:'checkout',suppliers:'catalogue',users:'settings',help:'help'}))expect(mainDestination(key as any)).toBe(main);
 // Every section tab belongs to its section.
 for(const [main,tabs] of Object.entries(sectionTabs))for(const key of tabs!)expect(mainDestination(key)).toBe(main);
});
it('gives every sidebar and tab destination its own icon',()=>{
 const shown=[...new Set([...navGroups.flatMap(group=>group.keys),...Object.values(sectionTabs).flat(),'help'])] as Workspace[];
 const icons=shown.map(key=>destinations[key].icon);
 expect(new Set(icons).size).toBe(icons.length);
});
it('Production inventory navigation does not grant operational API capabilities',()=>{
 expect(workspaceAllowed('PRODUCTION','inventory')).toBe(true);expect(can('PRODUCTION','OPERATIONAL_STOCK')).toBe(false);expect(can('PRODUCTION','CATALOGUE_READ')).toBe(false);
 expect(navGroups.flatMap(g=>g.keys).filter(key=>workspaceAllowed('PRODUCTION',key))).toEqual(['inventory','checkout','qr','settings']);
 for(const key of ['counts','requests','users','labels','reports','reconciliation','completion'] as const)expect(workspaceAllowed('PRODUCTION',key)).toBe(false);
});
