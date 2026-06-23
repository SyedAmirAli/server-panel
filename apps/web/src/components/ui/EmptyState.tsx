import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
        <Icon size={22} className="text-gray-400" />
      </div>
      <h3 className="mb-1 text-sm font-semibold text-gray-900">{title}</h3>
      {description && <p className="mb-4 text-sm text-gray-500 max-w-xs">{description}</p>}
      {action}
    </div>
  );
}
