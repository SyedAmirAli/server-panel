import type { LucideIcon } from 'lucide-react';
import { Spinner } from './Spinner';

export type ActionBtnVariant = 'default' | 'edit' | 'delete' | 'rotate' | 'view' | 'danger' | 'copy';

const styles: Record<ActionBtnVariant, string> = {
  default: 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700',
  view:    'bg-violet-100 text-violet-600 hover:bg-violet-200 hover:text-violet-700',
  edit:    'bg-indigo-100 text-indigo-600 hover:bg-indigo-200 hover:text-indigo-700',
  rotate:  'bg-amber-100 text-amber-600 hover:bg-amber-200 hover:text-amber-700',
  delete:  'bg-red-100 text-red-600 hover:bg-red-200 hover:text-red-700',
  danger:  'bg-red-100 text-red-600 hover:bg-red-200 hover:text-red-700',
  copy:    'bg-emerald-100 text-emerald-600 hover:bg-emerald-200 hover:text-emerald-700',
};

interface ActionBtnProps {
  icon: LucideIcon;
  label: string;
  onClick?: (e: React.MouseEvent) => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: ActionBtnVariant;
}

export function ActionBtn({ icon: Icon, label, onClick, disabled, loading, variant = 'default' }: ActionBtnProps) {
  return (
    <div className="group relative inline-flex">
      <button
        type="button"
        title={label}
        aria-label={label}
        onClick={onClick}
        disabled={disabled || loading}
        className={`rounded-lg p-1.5 transition-all disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]}`}
      >
        {loading ? <Spinner size="sm" /> : <Icon size={14} strokeWidth={2.25} />}
      </button>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-[10px] font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
        {label}
      </span>
    </div>
  );
}
