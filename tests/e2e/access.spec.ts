import {test,expect} from '@playwright/test';
test('role navigation, forbidden routes and same-origin session controls',async({page,context})=>{
 for(const role of ['manager','production']){
  await page.goto('/');await page.getByLabel('Email address').fill(`e2e-${role}@dayari.test`);await page.getByLabel('Password',{exact:true}).fill(process.env.E2E_PASSWORD!);await page.getByRole('button',{name:'Sign in',exact:true}).click();
  const nav=page.getByRole('navigation',{name:'Workspace'});await expect(nav).toBeVisible();await expect(nav.getByRole('button',{name:'Users & access'})).toHaveCount(0);
  const cookie=(await context.cookies()).find(c=>c.name==='dayari_session');expect(cookie?.httpOnly).toBe(true);expect(cookie?.sameSite).toBe('Strict');
  const forbidden=await page.request.post('/api/admin/users',{headers:{Origin:'http://foreign.invalid'},data:{}});expect(forbidden.status()).toBe(403);
  await page.goto('/#users');await expect(page.getByRole('heading',{name:'Access restricted'})).toBeVisible();
  if(role==='production'){expect((await page.request.get('/api/receipts')).status()).toBe(403);await expect(nav.getByRole('button',{name:'Receiving',exact:true})).toHaveCount(0);}
  await page.getByRole('button',{name:'Return to your workspace'}).click();await page.getByRole('button',{name:'Sign out',exact:true}).click();await expect(page.getByRole('heading',{name:'Sign in to your shop'})).toBeVisible();
 }
});
