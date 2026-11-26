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

/** Navigate the consolidated workspaces while retaining explicit workflow assertions.
 * Older screen names used by the specs map onto the current sidebar + section tabs. */
export async function openWorkspace(page:Page,label:string){
 const checkout=['Checkout','Product checkout'],finished=['Checkout','Finished items'],reasons=['Checkout','Missing reasons'],counts=['Stock','Stock counts'],damaged=['Stock','Damaged items'],endOfDay=['Stock','End of day'];
 const paths:Record<string,string[]>={
 'Production checkout':checkout,'Product checkout':checkout,'Production':['Checkout'],
 'QR lookup':['Scan & find'],
 'Production completion':finished,'Finished items':finished,
 'Reason reconciliation':reasons,'Missing reasons':reasons,
 'Physical counts':counts,'Stock counts':counts,
 'Recovery & corrections':['Stock','Correction requests'],
 'Damage & BAD reports':damaged,'Damage & Damage reports':damaged,'Damaged items':damaged,
 'Close day':endOfDay,'End of day':endOfDay,
 'Receipts & activity':['Deliveries'],'Receiving':['Deliveries'],
 'Inventory':['Stock'],'Usable stock':['Stock'],
 'Catalogue':['Products'],'Suppliers & sources':['Products','Suppliers'],
 'Labels & printing':['Print labels'],
 'Account & shop':['Settings','My account'],'Users & access':['Settings','Staff'],'Users & settings':['Settings'],
 'Help & guide':['Help'],'Reports & history':['Reports'],
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
 // Help sits in the sidebar footer beside the account, outside the grouped nav.
 if(steps[0]==='Help')await page.getByRole('button',{name:'Help',exact:true}).click();
 else await nav.getByRole('button',{name:steps[0],exact:true}).click();
 for(const step of steps.slice(1)){
  if(step==='Suppliers'){await page.getByRole('group',{name:'Catalogue view'}).getByRole('button',{name:'Suppliers',exact:true}).click();await page.getByRole('button',{name:'Supplier directory',exact:true}).click();continue;}
  await page.getByRole('navigation',{name:`${steps[0]} views`}).getByRole('button',{name:step,exact:true}).click();
 }
}

/** Look up any printed code through the top-bar search (desktop) or Scan & find (phone). */
export async function findCode(page:Page,code:string){
 const top=page.getByRole('searchbox',{name:'Find any code',exact:true});
 if(await top.isVisible()){await top.fill(code);await top.press('Enter');}
 else{await openWorkspace(page,'Scan & find');const input=page.getByLabel('Code or QR label',{exact:true});await input.fill(code);await input.press('Enter');}
 return page.getByRole('main');
}
