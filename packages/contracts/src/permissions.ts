export type AppRole='ADMIN'|'MANAGER'|'PRODUCTION';
export type Capability='STAFF_ADMIN'|'SHOP_INFO'|'CATALOGUE_WRITE'|'CATALOGUE_READ'|'RECEIVE'|'OPERATIONAL_STOCK'|'PRINT_ADMIN'|'IDENTIFY'|'OWN_ACCOUNT'|'CHECKOUT';
const operational:readonly AppRole[]=['ADMIN','MANAGER'];
export const permissionRoles:Record<Capability,readonly AppRole[]>={
 STAFF_ADMIN:['ADMIN'],SHOP_INFO:['ADMIN'],CATALOGUE_WRITE:['ADMIN'],CATALOGUE_READ:operational,
 RECEIVE:operational,OPERATIONAL_STOCK:operational,PRINT_ADMIN:operational,
 IDENTIFY:['ADMIN','MANAGER','PRODUCTION'],OWN_ACCOUNT:['ADMIN','MANAGER','PRODUCTION'],
 CHECKOUT:['ADMIN','MANAGER','PRODUCTION'],
};
export function can(role:AppRole,capability:Capability):boolean{return permissionRoles[capability].includes(role);}
