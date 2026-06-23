import type { ReactNode } from 'react';

interface ScrollAreaProps {
  children: ReactNode;
  className?: string;
  /** Preserve line breaks (for pre/json). Default true. */
  preWrap?: boolean;
  maxHeight?: string;
}

/**
 * Scrollable container: no horizontal overflow, long strings wrap with break-all,
 * uses the global thin custom scrollbar from index.css.
 */
export function ScrollArea({ children, className = '', preWrap = true, maxHeight }: ScrollAreaProps) {
  return (
    <div
      className={`scroll-area ${preWrap ? 'scroll-area-pre' : ''} ${maxHeight ?? ''} ${className}`.trim()}
    >
      {children}
    </div>
  );
}
