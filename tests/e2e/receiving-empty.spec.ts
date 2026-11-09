import {expect,test} from '@playwright/test';

for(const role of ['admin','manager'] as const){
  test(`${role} sees appropriate empty receiving setup`,async({page})=>{
    await page.route('**/api/receiving/options',async route=>{const response=await route.fetch();const body=await response.json();await route.fulfill({response,json:{...body,suppliers:[]}});});
    await page.goto('/');await page.getByLabel('Email address').fill(`e2e-${role}@dayari.test`);await page.getByLabel('Password',{exact:true}).fill(process.env.E2E_PASSWORD!);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('heading',{name:/Welcome/})).toBeVisible({timeout:30000});
    if(role==='admin'){
      await page.getByRole('button',{name:'Receive a delivery',exact:true}).click();await expect(page.getByRole('dialog').getByRole('heading',{name:'Add supplier',exact:true})).toBeVisible();await page.getByRole('button',{name:'Close setup',exact:true}).click();
    }
    await page.goto('/#receiving');await expect(page.getByRole('heading',{name:'No receiving suppliers configured',exact:true})).toBeVisible();
    if(role==='admin'){
      await expect(page.getByText(/Ask an? Admin/)).toHaveCount(0);await page.getByRole('button',{name:'Add supplier',exact:true}).click();await expect(page.getByRole('dialog').getByLabel('Supplier name',{exact:true})).toBeVisible();
    }else{
      await expect(page.getByText('Ask an Admin to register a supplier and its location prefix first.',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Receive delivery',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Add supplier',exact:true})).toHaveCount(0);
    }
  });
}
