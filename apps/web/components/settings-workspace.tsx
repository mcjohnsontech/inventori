'use client';
import { DatabaseIcon, SecurityCheckIcon } from '@hugeicons/core-free-icons';
import type { Role } from '@dayari/contracts';

import { useApiRead } from '../lib/api';
import { AccountSecurity } from './account-security';
import { formatDateTime, roleLabel } from '../lib/format';
import {
  Badge,
  Code,
  DetailList,
  DetailSkeleton,
  ErrorNotice,
  Footnote,
  Icon,
  Page,
  PageHeader,
  Panel,
  Stack,
} from './ui';

type ShopInfo = {
  originId: string;
  authority: string;
  timeZone: string;
  cloudSync: string;
  observedAt: string;
};

const descriptions: Record<Role, string> = {
  ADMIN:
    'Manage your account and sessions. Shop staff administration is available in Users & access.',
  MANAGER:
    'Your account supports receiving, operational stock, receipts and lot labels. Catalogue registration remains Admin-only.',
  PRODUCTION:
    'Your account supports usable stock discovery and exact identification. Receiving and print administration are restricted.',
};

const permissions: Record<Role, string> = {
  ADMIN:
    'Catalogue registration and extension, operational receiving, inventory lookup and lot-label administration.',
  MANAGER:
    'Operational receiving, stock quantities, receipt review and existing lot-label workflows. Catalogue registration remains Admin-only.',
  PRODUCTION:
    'Identify supported Product and Lot Codes and QR labels, with usable availability. Receiving and print administration are restricted.',
};

export function SettingsWorkspace({
  user,
  onPasswordChanged,
}: {
  user: { name: string; role: Role };
  onPasswordChanged: () => void;
}) {
  const shop = useApiRead<ShopInfo>(user.role === 'ADMIN' ? 'admin/shop' : null);

  return (
    <Page>
      <PageHeader
        eyebrow="Your workspace"
        title="Account & shop"
        description={descriptions[user.role]}
        actions={<Badge tone="brand">{roleLabel(user.role)}</Badge>}
      />

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <AccountSecurity onChanged={onPasswordChanged} />

        <Panel title="Your account">
          <Stack gap="tight">
            <div className="flex items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-tint text-brand">
                <Icon icon={SecurityCheckIcon} size={22} />
              </span>
              <p className="font-display text-xl font-semibold tracking-[-0.03em] text-ink">
                {user.name}
              </p>
            </div>
            <p className="font-sans text-sm leading-[1.7] tracking-[-0.02em] text-grey-2">
              {permissions[user.role]}
            </p>
            <Footnote>
              Use Sign out in the workspace navigation to end this session. Password changes, user
              administration and role editing do not have supported commands in this milestone.
            </Footnote>
          </Stack>
        </Panel>

        {user.role === 'ADMIN' ? (
          <Panel
            title="Shop authority"
            description="Where this workspace's data comes from."
            action={
              <span className="grid size-9 place-items-center rounded-xl bg-brand-tint text-brand">
                <Icon icon={DatabaseIcon} size={18} />
              </span>
            }
          >
            {shop.loading ? (
              <DetailSkeleton rows={5} />
            ) : shop.error ? (
              <ErrorNotice message={shop.error} onRetry={shop.refresh} />
            ) : shop.data ? (
              <DetailList
                rows={[
                  { label: 'Authority mode', value: shop.data.authority },
                  { label: 'Shop origin', value: <Code>{shop.data.originId}</Code> },
                  { label: 'Business timezone', value: shop.data.timeZone },
                  {
                    label: 'Cloud synchronization',
                    value:
                      shop.data.cloudSync === 'not-configured'
                        ? 'Not configured'
                        : shop.data.cloudSync,
                  },
                  { label: 'Observed at', value: formatDateTime(shop.data.observedAt) },
                ]}
              />
            ) : null}
          </Panel>
        ) : null}
      </div>
    </Page>
  );
}
