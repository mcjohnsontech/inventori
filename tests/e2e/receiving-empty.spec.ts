import {expect,test} from '@playwright/test';

// Owner decision 26 Nov 2026: Admins and Inventory Managers may both add a supplier when none exist.
// Admins get the full supplier setup; Managers add one inside the receive wizard.
for(const role of ['admin','manager'] as const){
  test(`${role} can start receiving with no suppliers configured`,async({page})=>{
    await page.route('**/api/receiving/options',async route=>{const response=await route.fetch();const body=await response.json();await route.fulfill({response,json:{...body,suppliers:[]}});});
    await page.goto('/');await page.getByLabel('Email address').fill(`e2e-${role}@dayari.test`);await page.getByLabel('Password',{exact:true}).fill(process.env.E2E_PASSWORD!);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('heading',{name:/Good (morning|afternoon|evening)/})).toBeVisible({timeout:30000});
    await page.getByRole('button',{name:'Receive a delivery',exact:true}).click();
    await expect(page.getByText(/Ask an? Admin/)).toHaveCount(0);
    if(role==='admin'){
      await expect(page.getByRole('dialog').getByRole('heading',{name:'Add supplier',exact:true})).toBeVisible();
      await page.getByRole('button',{name:'Close setup',exact:true}).click();
    }else{
      const dialog=page.getByRole('dialog',{name:'Receive delivery',exact:true});
      await expect(dialog.getByText('No suppliers yet. Use Add supplier to register the one delivering today.',{exact:true})).toBeVisible();
      await dialog.getByRole('button',{name:'Add supplier',exact:true}).click();
      await expect(page.getByRole('dialog').getByLabel('Supplier name',{exact:true})).toBeVisible();
    }
  });
}
