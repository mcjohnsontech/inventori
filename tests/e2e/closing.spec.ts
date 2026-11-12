import {randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {test,expect} from '@playwright/test';
import {openWorkspace} from './ui.js';
test('Manager reviews and confirms immutable closing with cancellation and lost-response retry; Admin reviews only',async({page})=>{
 test.setTimeout(180000);
 const login=async(email:string)=>{await page.getByLabel('Email address').fill(email);await page.getByLabel('Password',{exact:true}).fill(process.env.E2E_PASSWORD!);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('button',{name:'Sign out',exact:true})).toBeVisible();};
 await page.goto('/');await login('e2e-admin@dayari.test');await openWorkspace(page,'Inventory');await page.getByRole('button',{name:'Close day',exact:true}).click();
 await expect(page.getByText('Admin review only.',{exact:false})).toBeVisible();await expect(page.getByRole('button',{name:'Review daily closing',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Sign out',exact:true}).click();await login('e2e-manager@dayari.test');await openWorkspace(page,'Inventory');await page.getByRole('button',{name:'Close day',exact:true}).click();
 // Synthetic historical date: avoids certifying other tests' intentionally unresolved current-day fixtures.
 const day=`1999-${String(1+Math.floor(Math.random()*12)).padStart(2,'0')}-${String(1+Math.floor(Math.random()*28)).padStart(2,'0')}`;
 await page.getByLabel('Business date · Lagos',{exact:true}).fill(day);
 const review=page.getByRole('button',{name:'Review daily closing',exact:true});await expect(review).toBeEnabled();
 let submissions=0;await page.route('**/api/daily-closings',async route=>{if(route.request().method()==='POST')submissions++;await route.continue();});
 await review.click();const modal=page.getByRole('dialog',{name:'Confirm daily closing',exact:true});await expect(modal).toContainText(day);await modal.getByRole('button',{name:'Cancel',exact:true}).click();expect(submissions).toBe(0);
 await page.unroute('**/api/daily-closings');const keys:string[]=[];let lost=false;
 await page.route('**/api/daily-closings',async route=>{if(route.request().method()!=='POST')return route.continue();keys.push(route.request().headers()['idempotency-key']!);if(lost)return route.continue();const accepted=await route.fetch();expect(accepted.ok(),await accepted.text()).toBe(true);lost=true;await route.abort('failed');});
 await review.click();await modal.getByRole('button',{name:'Confirm daily closing',exact:true}).click();
 await expect(modal.getByRole('alert')).toBeVisible();await modal.getByRole('button',{name:'Cancel',exact:true}).click();await expect(page.getByRole('button',{name:'Retry saved closing',exact:true})).toBeVisible();await page.reload();
 await page.getByRole('button',{name:'Retry saved closing',exact:true}).click();const report=page.getByRole('dialog',{name:'Finalized daily closing',exact:true});await expect(report).toBeVisible();await expect(report).toContainText(day);expect(keys).toHaveLength(2);expect(keys[0]).toBe(keys[1]);
 await mkdir('test-results/final-sprint',{recursive:true});for(const width of [1440,1024,768,390,320]){await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`test-results/final-sprint/closing-${width}.png`,fullPage:true});}
 await page.getByRole('button',{name:'Close closing report',exact:true}).click();await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:'Sign out',exact:true}).click();await login('e2e-production@dayari.test');expect((await page.request.get('/api/daily-closings')).status()).toBe(403);await page.goto('/#closing');await expect(page.getByRole('button',{name:'Review daily closing',exact:true})).toHaveCount(0);
});
