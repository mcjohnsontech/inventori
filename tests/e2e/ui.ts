import type { Locator, Page } from '@playwright/test';

/**
 * Choose a value in a Radix select. Radix renders a button trigger plus a
 * portalled listbox, so `selectOption` does not apply: open the trigger, then
 * click the option by its value or its visible label.
 */
export async function choose(
  scope: Page | Locator,
  name: string,
  option: string | { label: string },
) {
  const page = 'page' in scope ? scope.page() : scope;

  await scope.getByRole('combobox', { name, exact: true }).click();

  const listbox = page.getByRole('listbox');
  await listbox.waitFor({ state: 'visible' });

  const item =
    typeof option === 'string'
      ? listbox.locator(`[role="option"][data-value="${option}"]`)
      : listbox.getByRole('option', { name: option.label, exact: true });

  await item.click();
  await listbox.waitFor({ state: 'hidden' });
}

/** Navigate the consolidated workspaces while retaining explicit workflow assertions. */
export async function openWorkspace(page:Page,label:string){
 const paths:Record<string,string[]>={
 'Production checkout':['Production','Checkout & lookup'], 'QR lookup':['Production','Checkout & lookup','QR & code lookup'],
 'Production completion':['Production','Completion'], 'Reason reconciliation':['Production','Reason follow-up'],
 'Physical counts':['Inventory','Count history'], 'Recovery & corrections':['Inventory','Requests'],
 'Damage & BAD reports':['Inventory','Damaged / BAD'], 'Receipts & activity':['Receiving'],
 'Account & shop':['Users & settings','My account'], 'Users & access':['Users & settings','Staff & invitations'],
 'Help & guide':['Users & settings','Help'], 'Usable stock':['Inventory'], 'Suppliers & sources':['Catalogue','Suppliers'],
 };
 const steps=paths[label]??[label];
 // Inspectors retain their lists; leave the inspector before using the sidebar.
 for(const name of ['Close product details','Close receipt details','Close supplier details']){
  const close=page.getByRole('button',{name,exact:true});
  if(await close.isVisible()){
   await close.click();
   // A dirty nested print form can refuse leaving; do not force a second navigation.
   if(await close.isVisible())return;
  }
 }

 const nav=page.getByRole('navigation',{name:'Workspace'});
 const menu=page.getByRole('button',{name:'Open navigation',exact:true});
 if(await menu.isVisible())await menu.click();
 await nav.waitFor({state:'visible'});
 await nav.getByRole('button',{name:steps[0],exact:true}).click();
 for(const step of steps.slice(1)){
  const scope=page;
  if(step==='Suppliers'){await page.getByRole('group',{name:'Catalogue view'}).getByRole('button',{name:'Suppliers',exact:true}).click();await page.getByRole('button',{name:'Supplier directory',exact:true}).click();continue;}
  if(step==='Checkout & lookup'){
   await page.getByRole('group',{name:'Checkout and lookup mode'}).waitFor({state:'visible'});
   const tab=scope.getByRole('button',{name:step,exact:true});
   if(await tab.count())await tab.click();
  }else await scope.getByRole('button',{name:step,exact:true}).click();
 }
}
