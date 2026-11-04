import { expect, it } from 'vitest';
import { staffCreate, staffUpdate, staffQuery, strongPassword } from '@dayari/contracts';
it('requires supervised strong onboarding without expanding roles or accepting private metadata',()=>{
 const valid={name:'Staff',email:'staff@dayari.test',role:'PRODUCTION',initialPassword:'a long private passphrase',currentPassword:'proof'};
 expect(staffCreate.safeParse(valid).success).toBe(true);
 for(const input of [{...valid,role:'OWNER'},{...valid,passwordHash:'injected'},{...valid,initialPassword:'short'},{...valid,originId:'foreign'}])expect(staffCreate.safeParse(input).success).toBe(false);
 expect(strongPassword.safeParse(' '.repeat(16)).success).toBe(false);
 expect(staffUpdate.safeParse({name:'Staff',role:'ADMIN',active:'true',currentPassword:'proof'}).success).toBe(false);
});
it('bounds directory queries and rejects unapproved filters',()=>{
 expect(staffQuery.parse({page:'2'}).page).toBe(2);
 for(const q of [{page:'0'},{page:'1.2'},{active:'yes'},{q:'x'.repeat(161)},{originId:'foreign'}])expect(staffQuery.safeParse(q).success).toBe(false);
});
