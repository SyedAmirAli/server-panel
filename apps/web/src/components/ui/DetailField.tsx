import type { ReactNode } from 'react';

interface DetailFieldProps {
  label: string;
  children?: ReactNode;
  wide?: boolean;
}

export function DetailField({ label, children, wide }: DetailFieldProps) {
  return (
    <div className={`rounded-xl bg-gray-50 px-3.5 py-3 ${wide ? 'col-span-2' : ''}`}>
      <dt className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</dt>
      <dd className="text-sm font-medium text-gray-800">
        {children ?? <span className="font-normal text-gray-400">—</span>}
      </dd>
    </div>
  );
}

export function DetailGrid({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-2 gap-2">{children}</dl>;
}
