import {test,expect} from '@playwright/test';
test('role navigation, forbidden routes and same-origin session controls',async({page,context})=>{
 test.setTimeout(120000);
 for(const role of ['manager','production']){
  await page.goto('/');await page.getByLabel('Email address').fill(`e2e-${role}@dayari.test`);await page.getByLabel('Password',{exact:true}).fill(process.env.E2E_PASSWORD!);const signedIn=page.waitForResponse(r=>r.url().endsWith('/api/sessions')&&r.request().method()==='POST');await page.getByRole('button',{name:'Sign in',exact:true}).click();expect((await signedIn).status()).toBe(200);
  const nav=page.getByRole('navigation',{name:'Workspace'});await expect(nav).toBeVisible();await expect(nav.getByRole('button',{name:'Users & access'})).toHaveCount(0);
  const cookie=(await context.cookies()).find(c=>c.name==='dayari_session');expect(cookie?.httpOnly).toBe(true);expect(cookie?.sameSite).toBe('Strict');
  const forbidden=await page.request.post('/api/admin/users',{headers:{Origin:'http://foreign.invalid'},data:{}});expect(forbidden.status()).toBe(403);
  await page.goto('/#users');await expect(page.getByRole('heading',{name:'Access restricted'})).toBeVisible();
  if(role==='production'){expect((await page.request.get('/api/receipts')).status()).toBe(403);await expect(nav.getByRole('button',{name:'Receiving',exact:true})).toHaveCount(0);}
  await page.getByRole('button',{name:'Return to your workspace'}).click();await page.getByRole('button',{name:'Sign out',exact:true}).click();await expect(page.getByRole('heading',{name:'Sign in to your shop'})).toBeVisible();
 }
});
test('service-unavailable and expired-session states offer truthful recovery',async({page})=>{
 await page.route('**/api/me',route=>route.fulfill({status:503,json:{message:'The shop service is unavailable. Reconnect and retry.'}}));
 await page.goto('/');await expect(page.getByRole('alert').filter({hasText:'shop service is unavailable'})).toBeVisible();await page.unroute('**/api/me');
 await page.getByLabel('Email address').fill('e2e-production@dayari.test');await page.getByLabel('Password',{exact:true}).fill(process.env.E2E_PASSWORD!);const login=page.waitForResponse(r=>r.url().endsWith('/api/sessions')&&r.request().method()==='POST');await page.getByRole('button',{name:'Sign in',exact:true}).click();expect((await login).status()).toBe(200);await expect(page.getByRole('heading',{name:'Production workspace'})).toBeVisible();
 await page.route('**/api/availability**',route=>route.fulfill({status:401,json:{message:'Unauthorized'}}));await page.getByRole('button',{name:'Refresh availability'}).click();await expect(page.getByRole('heading',{name:'Sign in to your shop'})).toBeVisible();await expect(page.getByRole('alert').filter({hasText:'session ended'})).toBeVisible();
});
