'use client';
import { useState } from 'react';
import type { ReceiptUnitsPage } from '@dayari/contracts';
import { useApiRead } from '../../lib/api';
import { Badge, Code, CopyButton, DataTable, DetailSkeleton, EmptyState, ErrorNotice, Pager, type Column } from '../ui';

export function ReceivedUnits({ receiptId }: { receiptId: string }) {
  const [page, setPage] = useState(1);
  const read = useApiRead<ReceiptUnitsPage>(`receipts/${receiptId}/units?page=${page}`);
  const columns: Column<ReceiptUnitsPage['units'][number]>[] = [
    { key: 'code', label: 'Unit Code', cell: unit => <span className="flex items-center gap-2"><Code className="text-sm font-semibold tracking-[0.06em] whitespace-nowrap">{unit.unitCode}</Code><CopyButton value={unit.unitCode} label="Unit Code" /></span> },
    { key: 'item', label: 'Product / variant', wide: true, cell: unit => <><span className="block">{unit.productName} · {unit.variantName}</span><Code tone="muted">{unit.fullSku}</Code></> },
    { key: 'state', label: 'Recorded stock', cell: unit => <Badge tone={unit.state === 'U' ? 'usable' : 'damaged'}>{unit.state === 'U' ? 'Usable' : 'Damaged'}</Badge> },
  ];
  return read.loading ? <DetailSkeleton rows={4} /> : read.error ? <ErrorNotice message={read.error} onRetry={read.refresh} /> : !read.data?.total ? <EmptyState title="Historical stock has no assigned unit identities">No identities or past physical verification have been fabricated. Historical enrollment requires a separately reviewed workflow.</EmptyState> : <>
    <DataTable columns={columns} rows={read.data.units} rowKey={unit => unit.id} emptyMessage="No units on this page." mobileStack label="Received physical units" />
    <Pager page={page} pageCount={Math.ceil(read.data.total / read.data.pageSize)} total={read.data.total} onChange={setPage} />
  </>;
}
