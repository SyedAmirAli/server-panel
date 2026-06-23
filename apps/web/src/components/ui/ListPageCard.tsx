import type { ReactNode } from 'react';
import { Pagination } from '@/components/ui/Pagination';
import type { PageMeta } from '@/lib/types';

interface ListPageCardProps {
  children: ReactNode;
  meta?: PageMeta | null;
  onPageChange?: (page: number) => void;
  footer?: ReactNode;
}

/** White card wrapping a data table with optional pagination footer. */
export function ListPageCard({ children, meta, onPageChange, footer }: ListPageCardProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      {children}
      {footer}
      {meta && onPageChange && <Pagination meta={meta} onPageChange={onPageChange} />}
    </div>
  );
}

/** Shared table header cell styling. */
export function ListTableHead({ children }: { children: ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
      {children}
    </th>
  );
}
