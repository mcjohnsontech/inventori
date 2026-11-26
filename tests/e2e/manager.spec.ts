import {test,expect} from '@playwright/test';
test('Manager operational desk is usable at every requested viewport',async({page})=>{
 await page.goto('/');await page.getByLabel('Email address').fill('e2e-manager@dayari.test');await page.getByLabel('Password',{exact:true}).fill(process.env.E2E_PASSWORD!);await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.getByRole('heading',{name:/Good (morning|afternoon|evening)/})).toBeVisible();
 await expect(page.getByRole('button',{name:'Receive a delivery',exact:true})).toBeVisible();
 await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Settings',exact:true}).click();await expect(page.getByRole('button',{name:'Staff',exact:true})).toHaveCount(0);await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Overview',exact:true}).click();
 for(const width of [320,390,768,1024,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`test-results/manager-desk-${width}.png`});}
 await page.getByRole('button',{name:'Products',exact:true}).click();await page.getByRole('group',{name:'Catalogue view'}).getByRole('button',{name:'Suppliers',exact:true}).click();await page.getByRole('button',{name:'Supplier directory',exact:true}).click();await expect(page.getByRole('heading',{name:'Suppliers',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Add supplier',exact:true})).toHaveCount(0);
 expect((await page.request.get('/api/admin/users')).status()).toBe(403);
});
