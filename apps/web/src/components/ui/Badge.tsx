import type { ReactNode } from 'react';

export type BadgeVariant = 'success' | 'error' | 'warning' | 'neutral' | 'info' | 'queued';

const styles: Record<BadgeVariant, string> = {
  success: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
  error:   'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200',
  warning: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200',
  neutral: 'bg-gray-100 text-gray-600 ring-1 ring-inset ring-gray-200',
  info:    'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200',
  queued:  'bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200',
};

export function Badge({
  children,
  variant = 'neutral',
}: {
  children: ReactNode;
  variant?: BadgeVariant;
}) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[variant]}`}>
      {children}
    </span>
  );
}
