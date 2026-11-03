import { expect,it } from 'vitest';
import { can,permissionRoles,type Capability } from '@dayari/contracts';
it('keeps role capabilities explicit and prevents Manager/Production administration',()=>{
 for(const role of ['ADMIN','MANAGER','PRODUCTION'] as const){
  for(const capability of Object.keys(permissionRoles) as Capability[])expect(can(role,capability)).toBe(permissionRoles[capability].includes(role));
  expect(can(role,'STAFF_ADMIN')).toBe(role==='ADMIN');expect(can(role,'CATALOGUE_WRITE')).toBe(role==='ADMIN');
  expect(can(role,'RECEIVE')).toBe(role!=='PRODUCTION');expect(can(role,'PRINT_ADMIN')).toBe(role!=='PRODUCTION');
  expect(can(role,'IDENTIFY')).toBe(true);
 }
});
