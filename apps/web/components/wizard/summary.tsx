import { DetailList, type DetailRow } from '../ui/detail-list';

/** Review rows inside a wizard step. */
export function Summary({ rows }: { rows: DetailRow[] }) {
  return <DetailList rows={rows} boxed />;
}
