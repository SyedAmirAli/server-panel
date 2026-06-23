import { LayoutGrid, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { SearchBar } from '@/components/ui/SearchBar';

const PAGE_SIZES = [10, 20, 50, 100] as const;

interface ListToolbarProps {
  limit: number;
  onLimitChange: (limit: number) => void;
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  action?: ReactNode;
}

export function ListToolbar({
  limit,
  onLimitChange,
  search,
  onSearchChange,
  searchPlaceholder = 'Search…',
  action,
}: ListToolbarProps) {
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:gap-4">
      <div className="flex shrink-0 items-center gap-2 text-sm text-gray-600">
        <LayoutGrid size={15} className="text-gray-400" />
        <span className="hidden sm:inline">Select</span>
        <select
          value={limit}
          onChange={(e) => onLimitChange(Number(e.target.value))}
          className="h-9 cursor-pointer rounded-lg border border-gray-200 bg-white px-2.5 text-sm font-medium text-gray-800 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
          aria-label="Items per page"
        >
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <span className="whitespace-nowrap text-gray-500">in single page.</span>
      </div>

      <div className="min-w-0 flex-1">
        <SearchBar value={search} onChange={onSearchChange} placeholder={searchPlaceholder} pill />
      </div>

      {action && <div className="shrink-0 sm:ml-auto">{action}</div>}
    </div>
  );
}

export function PrimaryActionButton({
  children,
  onClick,
  icon: Icon,
}: {
  children: ReactNode;
  onClick?: () => void;
  icon?: LucideIcon;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-10 items-center gap-2 whitespace-nowrap rounded-xl bg-emerald-600 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700"
    >
      {Icon && <Icon size={15} />}
      {children}
    </button>
  );
}
