import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';

interface BreadcrumbItem {
  label: string;
  active?: boolean;
}

interface PageHeaderProps {
  title: string;
  description?: string;
  /** @deprecated use description */
  subtitle?: string;
  breadcrumb?: BreadcrumbItem[];
  onRefresh?: () => void;
  refreshing?: boolean;
  nav?: ReactNode;
  /** Right-aligned extras next to the title — status badges, reference links, icon buttons. */
  actions?: ReactNode;
}

export function PageHeader({
  title,
  description,
  subtitle,
  breadcrumb,
  onRefresh,
  refreshing,
  nav,
  actions,
}: PageHeaderProps) {
  const desc = description ?? subtitle;
  return (
    <div className="mb-6">
      {breadcrumb && breadcrumb.length > 0 && (
        <div className="mb-3 flex justify-end">
          <nav className="flex items-center gap-1.5 text-xs text-gray-400">
            {breadcrumb.map((item, i) => (
              <span key={item.label} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-gray-300">/</span>}
                <span className={item.active ? 'font-medium text-emerald-600' : ''}>{item.label}</span>
              </span>
            ))}
          </nav>
        </div>
      )}

      <div className="flex items-start gap-3">
        <div className="flex shrink-0 items-center gap-1 pt-1">
          {nav ?? (
            <>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="Back"
              >
                <ChevronLeft size={16} />
              </button>
              {onRefresh && (
                <button
                  type="button"
                  onClick={onRefresh}
                  disabled={refreshing}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-60"
                  aria-label="Refresh"
                >
                  <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                </button>
              )}
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="Forward"
              >
                <ChevronRight size={16} />
              </button>
            </>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">{title}</h1>
          {desc && (
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-gray-500">{desc}</p>
          )}
        </div>

        {actions && <div className="flex shrink-0 items-center gap-2 pt-1">{actions}</div>}
      </div>
    </div>
  );
}
