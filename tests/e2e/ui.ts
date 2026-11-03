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
