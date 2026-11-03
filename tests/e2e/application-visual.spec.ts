import {test,expect} from '@playwright/test';
test('new application screens have accessible controls and responsive loaded layouts',async({page})=>{
 test.setTimeout(240000);
 await page.goto('/');await page.getByLabel('Email address').fill('e2e-admin@dayari.test');await page.getByLabel('Password',{exact:true}).fill(process.env.E2E_PASSWORD!);const login=page.waitForResponse(r=>r.url().endsWith('/api/sessions')&&r.request().method()==='POST');await page.getByRole('button',{name:'Sign in',exact:true}).click();expect((await login).status()).toBe(200);
 async function navigate(name:string){const menu=page.getByRole('button',{name:'Open navigation',exact:true});if(await menu.isVisible())await menu.click();await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name,exact:true}).click();}
 for(const [route,title] of [['Users & access','Users & access'],['Account & shop','Account & shop'],['Help & guide','Help & operating guide'],['Reports & history','Reports & history']]){
  await navigate(route!);await expect(page.getByRole('heading',{name:title!,exact:true})).toBeVisible();await expect(page.getByRole('status',{name:'Loading workspace'})).toHaveCount(0);
  await page.getByRole('link',{name:'Skip to content'}).focus();await page.keyboard.press('Enter');await expect(page.locator('#workspace-content')).toBeFocused();
  expect(await page.locator('main').evaluate(main=>[...main.querySelectorAll('input:not([type=hidden]),select,textarea')].filter(el=>!el.getAttribute('aria-label')&&!el.getAttribute('aria-labelledby')&&!(el as HTMLInputElement).labels?.length).length)).toBe(0);
  for(const width of [320,390,768,1024,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`test-results/application-${route!.split(' ')[0]!.toLowerCase()}-${width}.png`});}
 }
 await navigate('Users & access');await page.getByRole('button',{name:'Create staff account'}).click();await page.getByLabel('Full name').fill('Unsaved synthetic staff');
 await page.setViewportSize({width:320,height:900});await page.screenshot({path:'test-results/application-user-form-320.png'});
 page.once('dialog',dialog=>dialog.dismiss());await navigate('Help & guide');await expect(page.getByLabel('Full name')).toHaveValue('Unsaved synthetic staff');
 page.once('dialog',dialog=>dialog.accept());await navigate('Help & guide');await expect(page.getByRole('heading',{name:'Help & operating guide'})).toBeVisible();
});
