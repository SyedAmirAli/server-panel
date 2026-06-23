import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { toastError, toastSuccess } from '@/lib/toast';

interface CopyButtonProps {
  value: string;
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function CopyButton({ value, label = 'Copy', size = 'sm', className = '' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toastSuccess('Copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toastError('Copy failed — select text manually');
    }
  }

  const iconSize = size === 'sm' ? 13 : 15;
  const pad = size === 'sm' ? 'p-1.5' : 'p-2';

  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? 'Copied!' : label}
      aria-label={label}
      className={`inline-flex items-center justify-center rounded-md bg-gray-100 text-gray-500 transition-colors hover:bg-indigo-100 hover:text-indigo-600 ${pad} ${className}`}
    >
      {copied ? <Check size={iconSize} className="text-emerald-600" /> : <Copy size={iconSize} />}
    </button>
  );
}
